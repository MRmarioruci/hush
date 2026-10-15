package expo.modules.hushnative

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.os.PowerManager
import android.util.Log
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sqrt

/**
 * Listens through the mic and decides whether a baby is crying, entirely on the phone.
 *
 * - Records 16 kHz mono with the voice-call source, which turns on echo cancellation on
 *   most phones, so the white noise Hush itself is playing is largely removed.
 * - Every half second it runs YAMNet (a general sound classifier) on the last ~1 s and
 *   reads its "baby cry", "crying" and "whimper" scores.
 * - It calls it crying when at least 3 of the last 6 windows (about 3 s) pass the
 *   threshold, then sends an alert to the paired parent phones. While crying continues,
 *   a reminder goes out every [REPEAT_MS].
 *
 * Audio never leaves the phone; only the alert text does.
 */
object CryEngine {
  private const val TAG = "HushCry"
  private const val SR = 16000
  private const val WINDOW = 15600 // YAMNet's 0.975 s input
  private const val HOP = 8000 // 0.5 s
  private const val REPEAT_MS = 3 * 60 * 1000L

  // YAMNet class indices (yamnet_class_map.csv).
  private const val CRYING_SOBBING = 19
  private const val BABY_CRY = 20
  private const val WHIMPER = 21

  @Volatile var threshold = 0.3f
  @Volatile var babyName = "Baby"
  @Volatile var tokens: List<String> = emptyList()

  /** Receives "status" and "cry" events; set by the JS-facing module. */
  @Volatile var listener: ((String, Map<String, Any>) -> Unit)? = null

  @Volatile var running = false
    private set

  private var thread: Thread? = null
  private var wakeLock: PowerManager.WakeLock? = null

  fun start(context: Context) {
    if (running) return
    running = true
    val app = context.applicationContext
    wakeLock = (app.getSystemService(Context.POWER_SERVICE) as PowerManager)
      .newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "hush:listening")
      .apply { setReferenceCounted(false); acquire(12 * 60 * 60 * 1000L) }
    thread = Thread({ loop(app) }, "hush-cry").apply { start() }
  }

  fun stop() {
    running = false
    thread?.interrupt()
    thread = null
    try { wakeLock?.release() } catch (_: Exception) {}
    wakeLock = null
  }

  private fun loadModel(context: Context): Interpreter {
    val bytes = context.assets.open("yamnet.tflite").use { it.readBytes() }
    val buf = ByteBuffer.allocateDirect(bytes.size).order(ByteOrder.nativeOrder())
    buf.put(bytes).rewind()
    return Interpreter(buf, Interpreter.Options().setNumThreads(2))
  }

  @SuppressLint("MissingPermission")
  private fun openRecorder(): AudioRecord {
    val min = AudioRecord.getMinBufferSize(SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT)
    val size = max(min, HOP * 2 * 2)
    for (source in intArrayOf(MediaRecorder.AudioSource.VOICE_COMMUNICATION, MediaRecorder.AudioSource.MIC)) {
      val rec = AudioRecord(source, SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
      if (rec.state == AudioRecord.STATE_INITIALIZED) {
        if (AcousticEchoCanceler.isAvailable()) {
          try { AcousticEchoCanceler.create(rec.audioSessionId)?.enabled = true } catch (_: Exception) {}
        }
        return rec
      }
      rec.release()
    }
    throw IllegalStateException("Microphone unavailable")
  }

  private fun loop(context: Context) {
    var rec: AudioRecord? = null
    var model: Interpreter? = null
    try {
      model = loadModel(context)
      val inShape = model.getInputTensor(0).shape()
      val outShape = model.getOutputTensor(0).shape()
      val classes = outShape.last()

      rec = openRecorder()
      rec.startRecording()

      val window = FloatArray(WINDOW)
      val pcm = ShortArray(HOP)
      var filled = 0
      val history = ArrayDeque<Boolean>()
      var crying = false
      var lastAlert = 0L

      while (running && !Thread.currentThread().isInterrupted) {
        var read = 0
        while (read < HOP && running) {
          val n = rec.read(pcm, read, HOP - read)
          if (n <= 0) break
          read += n
        }
        if (read < HOP) continue

        // Slide the window and append the new half second.
        System.arraycopy(window, HOP, window, 0, WINDOW - HOP)
        var sumSq = 0.0
        for (i in 0 until HOP) {
          val v = pcm[i] / 32768f
          window[WINDOW - HOP + i] = v
          sumSq += v * v
        }
        filled = minOf(WINDOW, filled + HOP)
        val levelDb = 20 * log10(max(1e-6, sqrt(sumSq / HOP)))
        if (filled < WINDOW) continue

        val scores = classify(model, window, inShape, outShape, classes)
        val score = maxOf(scores[BABY_CRY], scores[CRYING_SOBBING], scores[WHIMPER] * 0.8f)

        history.addLast(score >= threshold)
        if (history.size > 6) history.removeFirst()
        val now = history.count { it } >= 3

        listener?.invoke("status", mapOf("score" to score.toDouble(), "level" to levelDb, "crying" to now))

        val t = System.currentTimeMillis()
        if (now && (!crying || t - lastAlert >= REPEAT_MS)) {
          val first = !crying
          lastAlert = t
          listener?.invoke("cry", mapOf("at" to t.toDouble(), "first" to first))
          val body = if (first) "$babyName is crying" else "$babyName is still crying"
          AlertSender.send(tokens, body, mapOf("type" to "cry", "baby" to babyName, "at" to t))
        }
        crying = now
      }
    } catch (e: Exception) {
      Log.w(TAG, "Listening stopped", e)
      listener?.invoke("status", mapOf("error" to (e.message ?: "Listening stopped")))
    } finally {
      try { rec?.stop() } catch (_: Exception) {}
      rec?.release()
      model?.close()
      running = false
    }
  }

  private fun classify(model: Interpreter, window: FloatArray, inShape: IntArray, outShape: IntArray, classes: Int): FloatArray {
    val input: Any = if (inShape.size == 1) window else arrayOf(window)
    return if (outShape.size == 1) {
      val out = FloatArray(classes)
      model.run(input, out)
      out
    } else {
      // [frames, classes]: take the strongest score per class across frames.
      val out = Array(outShape[0]) { FloatArray(classes) }
      model.run(input, out)
      val best = FloatArray(classes)
      for (row in out) for (c in 0 until classes) if (row[c] > best[c]) best[c] = row[c]
      best
    }
  }
}
