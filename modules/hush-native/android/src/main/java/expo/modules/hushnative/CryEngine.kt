package expo.modules.hushnative

import android.annotation.SuppressLint
import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.media.audiofx.AcousticEchoCanceler
import android.media.audiofx.AutomaticGainControl
import android.media.audiofx.NoiseSuppressor
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
 * - Records 16 kHz mono, near-raw, with echo cancellation attached.
 * - A denoiser removes steady sound first (hush's own white noise, fans, hum), so crying
 *   still stands out while white noise plays from the same phone.
 * - Every half second it runs YAMNet (a general sound classifier) on the last ~1 s and
 *   combines its crying scores, minus talking and laughing.
 * - A pitch check then turns the score down when the voice is clearly an adult's (low and
 *   in short syllables) and up when it's high and held, like a cry.
 * - It calls it crying when 4 of the last 8 windows (about 2 s of the last 4 s) pass the
 *   threshold, then sends an alert to the paired parent phones. While crying continues,
 *   a reminder goes out every [REPEAT_MS].
 *
 * Audio stays on the phone, except short clips when "listen in" is turned on.
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
  private const val WAIL = 22
  private const val SCREAMING = 11
  // Sounds that are easy to mistake for crying.
  private const val SPEECH = 0
  private const val CHILD_SPEECH = 1
  private const val CONVERSATION = 2
  private const val NARRATION = 3
  private const val BABBLING = 4
  private const val LAUGHTER = 13
  private const val BABY_LAUGHTER = 14
  /** Above this background level (dBFS) the classifier hears the cleaned audio. */
  private const val NOISY_DB = -55f

  @Volatile var threshold = 0.3f
  /** How long crying has to go on before the first alert. 0 = right away. */
  @Volatile var delayMs = 0L
  /** Pauses shorter than this don't end a crying spell (babies stop for breath). */
  private const val GAP_MS = 6000L
  @Volatile var babyName = "Baby"

  // Message templates in the app's language ({name}, {pct} are filled in here).
  @Volatile var txtCrying = "{name} is crying"
  @Volatile var txtStill = "{name} is still crying"
  @Volatile var txtLowBattery = "{name}'s phone battery is at {pct}%. Plug it in to keep listening."
  @Volatile var txtStopped = "{name}'s phone stopped listening"
  @Volatile var txtListenTitle = "hush is listening"
  @Volatile var txtListenText = "Paired phones get an alert if {name} cries"

  /** Set when the user stops listening, so a stop by the system can be told apart. */
  @Volatile var stopRequested = false

  fun fill(template: String, pct: Int = 0) = template.replace("{name}", babyName).replace("{pct}", pct.toString())

  /** Tell the parents that listening ended without anyone asking it to. */
  fun reportUnexpectedStop() {
    if (!stopRequested) alert("stopped", txtStopped, mapOf("type" to "stopped", "baby" to babyName))
  }
  @Volatile var tokens: List<String> = emptyList()

  /**
   * Per-parent alert texts, already in each parent's language:
   * token, crying, still, lowBattery ({pct} left in), stopped.
   */
  @Volatile var targets: List<Map<String, String>> = emptyList()

  /** Send one kind of alert, in each parent's language when known. */
  private fun alert(kind: String, fallback: String, data: Map<String, Any>, pct: Int = 0) {
    val list = targets.filter { !it["token"].isNullOrEmpty() }
    if (list.isEmpty()) { AlertSender.send(tokens, fill(fallback, pct), data); return }
    AlertSender.sendEach(list.map { it["token"]!! to fill(it[kind] ?: fallback, pct) }, data)
  }

  /** Receives "status" and "cry" events; set by the JS-facing module. */
  @Volatile var listener: ((String, Map<String, Any>) -> Unit)? = null

  @Volatile var running = false
    private set

  /* ---------- the room's state, reported to the parents ---------- */
  @Volatile var roomPlaying = false
  @Volatile var roomSound = "womb"
  @Volatile var listenSince = 0L
  private const val HEARTBEAT_MS = 10 * 60 * 1000L

  /** What the parents' phones show: listening, white noise, battery. Sent silently. */
  fun reportRoom(context: Context, to: List<String> = targets.mapNotNull { it["token"] }.ifEmpty { tokens }) {
    val (pct, plugged) = battery(context)
    AlertSender.sendData(to, mapOf(
      "type" to "room", "listening" to running, "playing" to roomPlaying, "sound" to roomSound,
      "listenSince" to listenSince, "battery" to pct, "charging" to plugged, "at" to System.currentTimeMillis(),
    ))
  }

  /* ---------- "listen in": settings from the app ---------- */
  @Volatile var allowListen = false
  @Volatile var bucket = ""
  @Volatile var txtListenNotice = "{who} is listening to the room for {s} seconds"

  /** Seconds of sound sent with each crying alert (needs "listen in" on); 0 = none. */
  @Volatile var cryClipSecs = 10

  /*
   * ---------- short clips ("listen in" and crying alerts) ----------
   * The last RING_S seconds of raw sound are always kept in memory (never saved), so a clip
   * is ready the moment it's asked for instead of being recorded first.
   */
  private const val RING_S = 20
  private val clipLock = Any()
  private val ring = ShortArray(SR * RING_S)
  private var ringPos = 0
  private var ringFilled = 0
  private var clipWant = 0
  private var clipDone: ((ByteArray?) -> Unit)? = null

  /**
   * The last [seconds] of sound as a WAV, right away. Just after listening starts, when fewer
   * seconds have been heard, it waits until there are enough. null if not listening.
   */
  fun recordClip(seconds: Int, done: (ByteArray?) -> Unit) {
    if (!running) { done(null); return }
    val want = SR * seconds.coerceIn(1, RING_S)
    val ready = synchronized(clipLock) {
      if (ringFilled >= want) snapshot(want) else {
        clipDone?.invoke(null)
        clipWant = want; clipDone = done
        null
      }
    }
    EventLog.add("clip")
    if (ready != null) Thread { done(ready) }.start()
  }

  /** Call with clipLock held. */
  private fun snapshot(n: Int): ByteArray {
    val out = ShortArray(n)
    val start = (ringPos - n + ring.size) % ring.size
    val first = minOf(n, ring.size - start)
    System.arraycopy(ring, start, out, 0, first)
    if (first < n) System.arraycopy(ring, 0, out, first, n - first)
    return wav(out)
  }

  private fun feedClip(pcm: ShortArray, n: Int) {
    val finished: Pair<ByteArray, (ByteArray?) -> Unit>? = synchronized(clipLock) {
      var i = 0
      while (i < n) {
        val take = minOf(n - i, ring.size - ringPos)
        System.arraycopy(pcm, i, ring, ringPos, take)
        ringPos = (ringPos + take) % ring.size
        i += take
      }
      ringFilled = minOf(ring.size, ringFilled + n)
      val cb = clipDone
      if (cb == null || ringFilled < clipWant) null else {
        clipDone = null
        snapshot(clipWant) to cb
      }
    }
    finished?.let { (bytes, cb) -> Thread { cb(bytes) }.start() }
  }

  private fun cancelClip() {
    val cb = synchronized(clipLock) { val c = clipDone; clipDone = null; ringFilled = 0; ringPos = 0; c }
    cb?.invoke(null)
  }

  /** Where a clip goes in Firebase Storage: (upload URL, download URL), or null if not set up. */
  fun clipUrls(): Pair<String, String>? {
    if (bucket.isEmpty()) return null
    val id = (1..24).map { "abcdefghijklmnopqrstuvwxyz0123456789".random() }.joinToString("")
    val path = java.net.URLEncoder.encode("clips/$id.wav", "UTF-8")
    return "https://firebasestorage.googleapis.com/v0/b/$bucket/o?uploadType=media&name=$path" to
      "https://firebasestorage.googleapis.com/v0/b/$bucket/o/$path?alt=media"
  }

  /**
   * After a crying alert: a few more seconds of the cry, then the clip goes to every parent
   * as its own notification ("Tap to hear ..."). Only when "listen in" is on.
   */
  private fun sendCryClip(at: Long) {
    val secs = cryClipSecs
    if (!allowListen || secs <= 0) return
    val urls = clipUrls() ?: return
    Thread {
      try {
        Thread.sleep(2500) // a bit more of the cry, past the moment it was recognised
        if (!running) return@Thread
        recordClip(secs) { bytes ->
          if (bytes == null) return@recordClip
          val (ok, _) = AlertSender.upload(urls.first, bytes, "audio/wav")
          if (!ok) return@recordClip
          val list = targets.filter { !it["token"].isNullOrEmpty() }
            .map { it["token"]!! to fill(it["cryClip"] ?: "{name}: {s} s", 0).replace("{s}", secs.toString()) }
          AlertSender.sendEach(list, mapOf("type" to "clip", "auto" to true, "url" to urls.second, "seconds" to secs, "at" to at))
        }
      } catch (_: Exception) {}
    }.start()
  }

  /** 16 kHz mono 16-bit WAV. */
  private fun wav(pcm: ShortArray): ByteArray {
    val data = pcm.size * 2
    val b = ByteBuffer.allocate(44 + data).order(ByteOrder.LITTLE_ENDIAN)
    b.put("RIFF".toByteArray()).putInt(36 + data).put("WAVE".toByteArray())
    b.put("fmt ".toByteArray()).putInt(16).putShort(1).putShort(1).putInt(SR).putInt(SR * 2).putShort(2).putShort(16)
    b.put("data".toByteArray()).putInt(data)
    for (v in pcm) b.putShort(v)
    return b.array()
  }

  private var thread: Thread? = null
  private var wakeLock: PowerManager.WakeLock? = null

  fun start(context: Context) {
    if (running) return
    running = true
    stopRequested = false
    val app = context.applicationContext
    EventLog.init(app)
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
    // VOICE_RECOGNITION gives near-raw audio on most phones. The voice-call source filters out
    // anything that isn't speech, which can hide a baby's cry. Echo cancellation is attached
    // separately so hush's own white noise is still reduced; noise suppression stays off.
    for (source in intArrayOf(MediaRecorder.AudioSource.VOICE_RECOGNITION, MediaRecorder.AudioSource.MIC)) {
      val rec = AudioRecord(source, SR, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, size)
      if (rec.state == AudioRecord.STATE_INITIALIZED) {
        val id = rec.audioSessionId
        if (AcousticEchoCanceler.isAvailable()) try { AcousticEchoCanceler.create(id)?.enabled = true } catch (_: Exception) {}
        if (NoiseSuppressor.isAvailable()) try { NoiseSuppressor.create(id)?.enabled = false } catch (_: Exception) {}
        if (AutomaticGainControl.isAvailable()) try { AutomaticGainControl.create(id)?.enabled = false } catch (_: Exception) {}
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
      val clean = FloatArray(WINDOW)
      val denoiser = Denoiser()
      val pitch = PitchTracker()
      val hop = FloatArray(HOP)
      val pcm = ShortArray(HOP)
      var filled = 0
      val history = ArrayDeque<Boolean>()
      var spellStart = 0L   // when the current crying spell began, 0 = none
      var lastHeard = 0L    // last moment crying was detected
      var alerted = false   // already alerted for this spell
      var lastAlert = 0L
      var peak = 0f
      var lastBatteryCheck = 0L
      var lowBatterySent = false
      EventLog.add("listen_start")
      listenSince = System.currentTimeMillis()
      var lastReport = 0L

      // A spell is recorded once it's over (or when listening stops).
      fun endSpell() {
        if (spellStart == 0L) return
        EventLog.add("cry", mapOf("start" to spellStart, "end" to lastHeard, "peak" to peak.toDouble(), "alerted" to alerted))
        spellStart = 0L
        alerted = false
        peak = 0f
      }

      while (running && !Thread.currentThread().isInterrupted) {
        var read = 0
        while (read < HOP && running) {
          val n = rec.read(pcm, read, HOP - read)
          if (n <= 0) break
          read += n
        }
        if (read < HOP) continue
        feedClip(pcm, read)

        // Slide the windows and append the new half second (raw and cleaned).
        System.arraycopy(window, HOP, window, 0, WINDOW - HOP)
        System.arraycopy(clean, HOP, clean, 0, WINDOW - HOP)
        var sumSq = 0.0
        for (i in 0 until HOP) {
          val v = pcm[i] / 32768f
          hop[i] = v
          window[WINDOW - HOP + i] = v
          sumSq += v * v
        }
        val cleaned = denoiser.process(hop)
        System.arraycopy(cleaned, 0, clean, WINDOW - HOP, HOP)
        pitch.add(cleaned)
        filled = minOf(WINDOW, filled + HOP)
        val levelDb = 20 * log10(max(1e-6, sqrt(sumSq / HOP)))
        if (filled < WINDOW) continue

        val noisy = denoiser.noiseDb > NOISY_DB
        val scores = classify(model, if (noisy) clean else window, inShape, outShape, classes)
        // Crying usually lights up several related classes at once, so add them up.
        val cry = scores[BABY_CRY] + 0.6f * scores[CRYING_SOBBING] + 0.4f * scores[WHIMPER] + 0.4f * scores[WAIL] + 0.2f * scores[SCREAMING]
        // Talking, babbling and laughing count against it when they're stronger than the crying.
        val talk = scores[SPEECH] + 0.6f * scores[CHILD_SPEECH] + 0.5f * (scores[CONVERSATION] + scores[NARRATION]) +
          0.7f * scores[BABBLING] + scores[LAUGHTER] + scores[BABY_LAUGHTER]
        val score = (max(0f, cry - 0.5f * max(0f, talk - cry)) * pitch.factor()).coerceIn(0f, 1f)
        var top = 0
        for (c in 1 until classes) if (scores[c] > scores[top]) top = c

        // About 2 s of crying within the last 4 s.
        history.addLast(score >= threshold)
        if (history.size > 8) history.removeFirst()
        val now = history.count { it } >= 4

        listener?.invoke(
          "status",
          mapOf("score" to score.toDouble(), "level" to levelDb, "crying" to now, "top" to top, "topScore" to scores[top].toDouble(), "noiseDb" to denoiser.noiseDb.toDouble())
        )

        // Every 10 minutes (and right after starting): tell the parents all is well.
        if (System.currentTimeMillis() - lastReport > HEARTBEAT_MS) {
          lastReport = System.currentTimeMillis()
          reportRoom(context)
        }

        // Once a minute: warn the parents if this phone is about to run out of battery.
        if (System.currentTimeMillis() - lastBatteryCheck > 60_000) {
          lastBatteryCheck = System.currentTimeMillis()
          val (pct, plugged) = battery(context)
          if (!plugged && pct in 1..15 && !lowBatterySent) {
            lowBatterySent = true
            alert("lowBattery", txtLowBattery, mapOf("type" to "battery", "baby" to babyName, "pct" to pct), pct)
          } else if (plugged || pct > 25) lowBatterySent = false
        }

        // A crying spell starts on the first detection and lasts until there's been no
        // crying for GAP_MS. Alert once it has lasted delayMs, then remind every REPEAT_MS.
        val t = System.currentTimeMillis()
        if (now) {
          if (spellStart == 0L) spellStart = t
          lastHeard = t
          if (score > peak) peak = score
        } else if (spellStart != 0L && t - lastHeard > GAP_MS) {
          endSpell()
        }
        if (spellStart != 0L && now) {
          val due = if (!alerted) t - spellStart >= delayMs else t - lastAlert >= REPEAT_MS
          if (due) {
            val first = !alerted
            alerted = true
            lastAlert = t
            listener?.invoke("cry", mapOf("at" to t.toDouble(), "first" to first))
            EventLog.add("alert", mapOf("first" to first))
            if (first) alert("crying", txtCrying, mapOf("type" to "cry", "baby" to babyName, "at" to t))
            else alert("still", txtStill, mapOf("type" to "cry", "baby" to babyName, "at" to t))
            sendCryClip(t)
          }
        }
      }
      endSpell()
      cancelClip()
    } catch (e: Exception) {
      cancelClip()
      Log.w(TAG, "Listening stopped", e)
      listener?.invoke("status", mapOf("error" to (e.message ?: "Listening stopped")))
      reportUnexpectedStop()
    } finally {
      EventLog.add("listen_stop")
      try { rec?.stop() } catch (_: Exception) {}
      rec?.release()
      model?.close()
      running = false
    }
  }

  fun battery(context: Context): Pair<Int, Boolean> {
    val i = context.registerReceiver(null, android.content.IntentFilter(android.content.Intent.ACTION_BATTERY_CHANGED)) ?: return 100 to true
    val level = i.getIntExtra(android.os.BatteryManager.EXTRA_LEVEL, -1)
    val scale = i.getIntExtra(android.os.BatteryManager.EXTRA_SCALE, 100)
    val plugged = i.getIntExtra(android.os.BatteryManager.EXTRA_PLUGGED, 0) != 0
    return (if (level < 0) 100 else level * 100 / maxOf(1, scale)) to plugged
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
