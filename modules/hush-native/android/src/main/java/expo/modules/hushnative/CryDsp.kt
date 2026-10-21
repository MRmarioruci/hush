package expo.modules.hushnative

import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.log10
import kotlin.math.max
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Removes steady background sound (hush's own white noise, a fan, room hum) before the cry
 * classifier hears it. Streaming STFT with a per-frequency noise estimate that follows the
 * quiet moments, then a Wiener-style gain. Crying is loud, pitched and comes in bursts, so it
 * passes through; steady noise is pushed down by up to 20 dB.
 *
 * Feed it any number of samples with [process]; it returns the same number, delayed by a
 * fraction of a frame.
 */
class Denoiser(private val n: Int = 512) {
  private val h = n / 2
  private val win = FloatArray(n) { sqrt(0.5 * (1 - cos(2 * PI * it / n))).toFloat() }
  private val frame = FloatArray(n)
  private val ola = FloatArray(n)
  private val re = FloatArray(n)
  private val im = FloatArray(n)
  private val noise = FloatArray(h + 1)
  private val smooth = FloatArray(h + 1)
  private var started = false

  // pending input (< h samples) and cleaned output waiting to be returned
  private val pend = FloatArray(h)
  private var pendN = 0
  private var fifo = FloatArray(h) // starts with h samples of silence (the latency)
  private var fifoN = h

  /** Estimated level of the steady background, in dB relative to full scale. */
  var noiseDb = -120f
    private set

  fun process(x: FloatArray): FloatArray {
    // Make room for everything this call can produce.
    if (fifo.size < fifoN + x.size + h) fifo = fifo.copyOf(fifoN + x.size + h)
    var i = 0
    while (i < x.size) {
      val take = minOf(h - pendN, x.size - i)
      System.arraycopy(x, i, pend, pendN, take)
      pendN += take
      i += take
      if (pendN == h) {
        hopFrame(pend)
        System.arraycopy(ola, 0, fifo, fifoN, h)
        fifoN += h
        System.arraycopy(ola, h, ola, 0, h)
        java.util.Arrays.fill(ola, h, n, 0f)
        pendN = 0
      }
    }
    val out = FloatArray(x.size)
    val give = minOf(x.size, fifoN)
    System.arraycopy(fifo, 0, out, x.size - give, give)
    System.arraycopy(fifo, give, fifo, 0, fifoN - give)
    fifoN -= give
    return out
  }

  private fun hopFrame(hop: FloatArray) {
    System.arraycopy(frame, h, frame, 0, h)
    System.arraycopy(hop, 0, frame, h, h)
    for (k in 0 until n) { re[k] = frame[k] * win[k]; im[k] = 0f }
    fft(re, im, false)
    var sum = 0.0
    for (k in 0..h) {
      val p = re[k] * re[k] + im[k] * im[k]
      if (!started) { noise[k] = p; smooth[k] = p }
      smooth[k] = 0.7f * smooth[k] + 0.3f * p
      // Follow the quiet moments down quickly and drift up slowly; loud bursts (crying)
      // don't pull the estimate up.
      if (smooth[k] < noise[k]) noise[k] = 0.9f * noise[k] + 0.1f * smooth[k]
      else if (smooth[k] < 2.5f * noise[k]) noise[k] = 0.998f * noise[k] + 0.002f * smooth[k]
      // The tracked minimum sits below the average noise; 1.8 corrects that, 2.0 over-subtracts.
      val g = max(0.1f, 1f - 3.6f * noise[k] / max(p, 1e-12f))
      re[k] *= g
      im[k] *= g
      if (k in 1 until h) { re[n - k] = re[k]; im[n - k] = -im[k] }
      sum += noise[k]
    }
    started = true
    noiseDb = (10 * log10(max(1e-12, 1.8 * 4 * sum / (n.toDouble() * n)))).toFloat()
    fft(re, im, true)
    for (k in 0 until n) ola[k] += re[k] * win[k]
  }
}

/**
 * Pitch of the voice in the last second. Babies cry at roughly 350–600 Hz and hold each
 * cry for a good fraction of a second; adults talk at 85–255 Hz in short syllables.
 * Fed cleaned audio in hops; keeps one result per 40 ms frame for the last second.
 */
class PitchTracker {
  private val sr = 16000
  private val len = 640 // 40 ms
  private val step = 320
  private val minLag = 16 // 1000 Hz
  private val maxLag = 160 // 100 Hz
  private val tail = FloatArray(len - step)
  private var tailN = 0
  private val codes = ArrayDeque<Int>() // 0 unvoiced, 1 low voice, 2 high voice
  private val cum = DoubleArray(len + 1)
  private val corr = DoubleArray(maxLag + 1)

  fun add(x: FloatArray) {
    val buf = FloatArray(tailN + x.size)
    System.arraycopy(tail, 0, buf, 0, tailN)
    System.arraycopy(x, 0, buf, tailN, x.size)
    var st = 0
    while (st + len <= buf.size) {
      codes.addLast(classify(buf, st))
      if (codes.size > 50) codes.removeFirst()
      st += step
    }
    tailN = minOf(tail.size, buf.size - st)
    System.arraycopy(buf, buf.size - tailN, tail, 0, tailN)
  }

  private fun classify(b: FloatArray, st: Int): Int {
    var mean = 0.0
    for (i in 0 until len) mean += b[st + i]
    mean /= len
    cum[0] = 0.0
    for (i in 0 until len) { val v = b[st + i] - mean; cum[i + 1] = cum[i] + v * v }
    if (cum[len] < 1e-5 * len) return 0
    var best = 0.0
    for (l in minLag..maxLag) {
      var s = 0.0
      for (i in 0 until len - l) s += (b[st + i] - mean) * (b[st + i + l] - mean)
      val ea = cum[len - l]
      val eb = cum[len] - cum[l]
      val c = s / sqrt(ea * eb + 1e-12)
      corr[l] = c
      if (c > best) best = c
    }
    if (best < 0.45) return 0
    // The shortest lag that is nearly as good: avoids reading a cry an octave too low.
    var lag = maxLag
    for (l in minLag..maxLag) if (corr[l] >= 0.9 * best) { lag = l; break }
    return if (sr.toDouble() / lag >= 270) 2 else 1
  }

  /**
   * How much to trust a cry score given the voice pitch: < 1 when the voice is clearly an
   * adult's, > 1 when it's high and held like a cry, 1 when there isn't enough voice to tell.
   */
  fun factor(): Float {
    var voiced = 0; var high = 0; var run = 0; var longest = 0
    for (c in codes) {
      if (c > 0) voiced++
      if (c == 2) { high++; run++; if (run > longest) longest = run } else run = 0
    }
    if (voiced < 6) return 1f
    val ratio = high.toFloat() / voiced
    return when {
      ratio < 0.3f -> 0.3f
      ratio >= 0.6f && longest >= 8 -> 1.2f
      else -> 1f
    }
  }

  fun reset() { codes.clear(); tailN = 0 }
}

/** In-place radix-2 FFT; [inverse] also divides by n. */
internal fun fft(re: FloatArray, im: FloatArray, inverse: Boolean) {
  val n = re.size
  var j = 0
  for (i in 1 until n) {
    var bit = n shr 1
    while (j and bit != 0) { j = j xor bit; bit = bit shr 1 }
    j = j xor bit
    if (i < j) {
      val tr = re[i]; re[i] = re[j]; re[j] = tr
      val ti = im[i]; im[i] = im[j]; im[j] = ti
    }
  }
  var size = 2
  while (size <= n) {
    val ang = 2 * PI / size * (if (inverse) 1 else -1)
    val wr = cos(ang)
    val wi = sin(ang)
    val half = size / 2
    var i = 0
    while (i < n) {
      var cr = 1.0
      var ci = 0.0
      for (k in 0 until half) {
        val a = i + k
        val b = a + half
        val xr = re[b] * cr - im[b] * ci
        val xi = re[b] * ci + im[b] * cr
        re[b] = (re[a] - xr).toFloat()
        im[b] = (im[a] - xi).toFloat()
        re[a] = (re[a] + xr).toFloat()
        im[a] = (im[a] + xi).toFloat()
        val ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
      i += size
    }
    size = size shl 1
  }
  if (inverse) for (i in 0 until n) { re[i] /= n; im[i] /= n }
}
