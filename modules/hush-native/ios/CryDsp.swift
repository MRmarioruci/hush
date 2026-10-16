import Foundation

// Swift port of android/.../CryDsp.kt. Keep the two in step: same numbers, same behaviour.

/**
 Removes steady background sound (hush's own white noise, a fan, room hum) before the cry
 classifier hears it. Streaming STFT with a per-frequency noise estimate that follows the
 quiet moments, then a Wiener-style gain. Crying is loud, pitched and comes in bursts, so it
 passes through; steady noise is pushed down by up to 20 dB.
 */
final class Denoiser {
  private let n: Int
  private let h: Int
  private let win: [Float]
  private var frame: [Float]
  private var ola: [Float]
  private var re: [Float]
  private var im: [Float]
  private var noise: [Float]
  private var smooth: [Float]
  private var started = false
  private var pend: [Float]
  private var pendN = 0
  private var fifo: [Float]

  /// Estimated level of the steady background, in dB relative to full scale.
  private(set) var noiseDb: Float = -120

  init(n: Int = 512) {
    self.n = n
    h = n / 2
    win = (0..<n).map { Float(sqrt(0.5 * (1 - cos(2 * Double.pi * Double($0) / Double(n))))) }
    frame = [Float](repeating: 0, count: n)
    ola = [Float](repeating: 0, count: n)
    re = [Float](repeating: 0, count: n)
    im = [Float](repeating: 0, count: n)
    noise = [Float](repeating: 0, count: n / 2 + 1)
    smooth = [Float](repeating: 0, count: n / 2 + 1)
    pend = [Float](repeating: 0, count: n / 2)
    fifo = [Float](repeating: 0, count: n / 2) // h samples of silence: the latency
  }

  /// Returns as many samples as it was given, delayed by a fraction of a frame.
  func process(_ x: [Float]) -> [Float] {
    var i = 0
    while i < x.count {
      let take = min(h - pendN, x.count - i)
      for j in 0..<take { pend[pendN + j] = x[i + j] }
      pendN += take
      i += take
      if pendN == h {
        hopFrame()
        fifo.append(contentsOf: ola[0..<h])
        for k in 0..<h { ola[k] = ola[k + h] }
        for k in h..<n { ola[k] = 0 }
        pendN = 0
      }
    }
    var out = [Float](repeating: 0, count: x.count)
    let give = min(x.count, fifo.count)
    for k in 0..<give { out[x.count - give + k] = fifo[k] }
    fifo.removeFirst(give)
    return out
  }

  private func hopFrame() {
    for k in 0..<h { frame[k] = frame[k + h] }
    for k in 0..<h { frame[h + k] = pend[k] }
    for k in 0..<n { re[k] = frame[k] * win[k]; im[k] = 0 }
    fft(&re, &im, inverse: false)
    var sum = 0.0
    for k in 0...h {
      let p = re[k] * re[k] + im[k] * im[k]
      if !started { noise[k] = p; smooth[k] = p }
      smooth[k] = 0.7 * smooth[k] + 0.3 * p
      // Follow the quiet moments down quickly and drift up slowly; loud bursts don't pull it up.
      if smooth[k] < noise[k] { noise[k] = 0.9 * noise[k] + 0.1 * smooth[k] }
      else if smooth[k] < 2.5 * noise[k] { noise[k] = 0.998 * noise[k] + 0.002 * smooth[k] }
      let g = max(0.1, 1 - 3.6 * noise[k] / max(p, 1e-12))
      re[k] *= g
      im[k] *= g
      if k >= 1 && k < h { re[n - k] = re[k]; im[n - k] = -im[k] }
      sum += Double(noise[k])
    }
    started = true
    noiseDb = Float(10 * log10(max(1e-12, 1.8 * 4 * sum / (Double(n) * Double(n)))))
    fft(&re, &im, inverse: true)
    for k in 0..<n { ola[k] += re[k] * win[k] }
  }
}

/**
 Pitch of the voice in the last second. Babies cry at roughly 350–600 Hz and hold each cry
 for a good fraction of a second; adults talk at 85–255 Hz in short syllables.
 */
final class PitchTracker {
  private let sr = 16000
  private let len = 640 // 40 ms
  private let step = 320
  private let minLag = 16 // 1000 Hz
  private let maxLag = 160 // 100 Hz
  private var tail: [Float] = []
  private var codes: [Int] = [] // 0 unvoiced, 1 low voice, 2 high voice
  private var cum: [Double]
  private var corr: [Double]

  init() {
    cum = [Double](repeating: 0, count: 641)
    corr = [Double](repeating: 0, count: 161)
  }

  func add(_ x: [Float]) {
    let buf = tail + x
    var st = 0
    while st + len <= buf.count {
      codes.append(classify(buf, st))
      if codes.count > 50 { codes.removeFirst() }
      st += step
    }
    let keep = min(len - step, buf.count - st)
    tail = Array(buf[(buf.count - keep)...])
  }

  private func classify(_ b: [Float], _ st: Int) -> Int {
    var mean = 0.0
    for i in 0..<len { mean += Double(b[st + i]) }
    mean /= Double(len)
    cum[0] = 0
    for i in 0..<len { let v = Double(b[st + i]) - mean; cum[i + 1] = cum[i] + v * v }
    if cum[len] < 1e-5 * Double(len) { return 0 }
    var best = 0.0
    for l in minLag...maxLag {
      var s = 0.0
      for i in 0..<(len - l) { s += (Double(b[st + i]) - mean) * (Double(b[st + i + l]) - mean) }
      let ea = cum[len - l]
      let eb = cum[len] - cum[l]
      let c = s / sqrt(ea * eb + 1e-12)
      corr[l] = c
      if c > best { best = c }
    }
    if best < 0.45 { return 0 }
    // The shortest lag that is nearly as good: avoids reading a cry an octave too low.
    var lag = maxLag
    for l in minLag...maxLag where corr[l] >= 0.9 * best { lag = l; break }
    return Double(sr) / Double(lag) >= 270 ? 2 : 1
  }

  /// < 1 when the voice is clearly an adult's, > 1 when it's high and held like a cry.
  func factor() -> Float {
    var voiced = 0, high = 0, run = 0, longest = 0
    for c in codes {
      if c > 0 { voiced += 1 }
      if c == 2 { high += 1; run += 1; longest = max(longest, run) } else { run = 0 }
    }
    if voiced < 6 { return 1 }
    let ratio = Float(high) / Float(voiced)
    if ratio < 0.3 { return 0.3 }
    if ratio >= 0.6 && longest >= 8 { return 1.2 }
    return 1
  }

  func reset() { codes.removeAll(); tail.removeAll() }
}

/// In-place radix-2 FFT; `inverse` also divides by n.
func fft(_ re: inout [Float], _ im: inout [Float], inverse: Bool) {
  let n = re.count
  var j = 0
  for i in 1..<n {
    var bit = n >> 1
    while j & bit != 0 { j ^= bit; bit >>= 1 }
    j ^= bit
    if i < j { re.swapAt(i, j); im.swapAt(i, j) }
  }
  var size = 2
  while size <= n {
    let ang = 2 * Double.pi / Double(size) * (inverse ? 1 : -1)
    let wr = cos(ang), wi = sin(ang)
    let half = size / 2
    var i = 0
    while i < n {
      var cr = 1.0, ci = 0.0
      for k in 0..<half {
        let a = i + k, b = a + half
        let xr = Double(re[b]) * cr - Double(im[b]) * ci
        let xi = Double(re[b]) * ci + Double(im[b]) * cr
        re[b] = Float(Double(re[a]) - xr)
        im[b] = Float(Double(im[a]) - xi)
        re[a] = Float(Double(re[a]) + xr)
        im[a] = Float(Double(im[a]) + xi)
        let ncr = cr * wr - ci * wi
        ci = cr * wi + ci * wr
        cr = ncr
      }
      i += size
    }
    size <<= 1
  }
  if inverse { for i in 0..<n { re[i] /= Float(n); im[i] /= Float(n) } }
}
