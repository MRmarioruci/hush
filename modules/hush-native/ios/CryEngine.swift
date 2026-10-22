import AVFoundation
import Foundation
import TensorFlowLite
import UIKit

/**
 Swift port of android/.../CryEngine.kt: listens through the mic and decides whether a baby is
 crying, entirely on the phone. Same steps and numbers as Android:

 - 16 kHz mono from the mic (converted from the hardware rate), no voice processing.
 - The denoiser removes steady sound first (hush's own white noise, fans, hum).
 - Every half second YAMNet scores the last ~1 s; crying scores minus talking and laughing.
 - The pitch check turns the score down for adult voices and up for high, held cries.
 - Crying = 4 of the last 8 windows over the threshold; then alert the paired parent phones.

 iOS keeps it running with the screen locked through the "audio" background mode, as long as
 listening was started while hush was open. Audio stays on the phone, except short clips
 when "listen in" is turned on.
 */
final class CryEngine {
  static let shared = CryEngine()

  private let SR = 16000.0
  private let WINDOW = 15600 // YAMNet's 0.975 s input
  private let HOP = 8000 // 0.5 s
  private let REPEAT_MS: Int64 = 3 * 60 * 1000
  private let GAP_MS: Int64 = 6000
  private let NOISY_DB: Float = -55

  // YAMNet class indices (yamnet_class_map.csv).
  private let CRYING_SOBBING = 19, BABY_CRY = 20, WHIMPER = 21, WAIL = 22, SCREAMING = 11
  private let SPEECH = 0, CHILD_SPEECH = 1, CONVERSATION = 2, NARRATION = 3, BABBLING = 4, LAUGHTER = 13, BABY_LAUGHTER = 14

  var threshold: Float = 0.3
  var delayMs: Int64 = 0
  var babyName = "Baby"
  var tokens: [String] = []
  /// Per-parent texts in each parent's language: token, crying, still, lowBattery, stopped.
  var targets: [[String: String]] = []
  var txtCrying = "{name} is crying"
  var txtStill = "{name} is still crying"
  var txtLowBattery = "{name}'s phone battery is at {pct}%. Plug it in to keep listening."
  var txtStopped = "{name}'s phone stopped listening"

  /// "status" and "cry" events for the JS-facing module.
  var listener: ((String, [String: Any]) -> Void)?

  private(set) var running = false
  private var stopRequested = false

  private let engine = AVAudioEngine()
  private let queue = DispatchQueue(label: "hush.cry")
  private var converter: AVAudioConverter?
  private let outFormat = AVAudioFormat(commonFormat: .pcmFormatFloat32, sampleRate: 16000, channels: 1, interleaved: false)!
  private var model: Interpreter?
  private var classes = 521

  // Detection state (only touched on `queue`).
  private var pending: [Float] = []
  private var window: [Float] = []
  private var clean: [Float] = []
  private var filled = 0
  private var denoiser = Denoiser()
  private var pitch = PitchTracker()
  private var history: [Bool] = []
  private var spellStart: Int64 = 0
  // Grown-ups talking in the room, logged as "talk" spells (see the Android engine).
  private var talkHistory: [Bool] = []
  private var talkStart: Int64 = 0
  private var lastTalk: Int64 = 0
  private var lastHeard: Int64 = 0
  private var alerted = false
  private var lastAlert: Int64 = 0
  private var peak: Float = 0
  private var lastBatteryCheck: Int64 = 0
  private var lowBatterySent = false
  private var observers: [NSObjectProtocol] = []

  /* ---------- "listen in" settings from the app ---------- */
  var allowListen = false
  var bucket = ""
  /// Seconds of sound sent with each crying alert (needs "listen in" on); 0 = none.
  var cryClipSecs = 10

  /*
   ---------- short clips ("listen in" and crying alerts) ----------
   The last RING seconds of raw sound are kept in memory (never saved), so a clip is ready
   the moment it's asked for instead of being recorded first. Only touched on `queue`.
   */
  private let RING = 16000 * 20
  private var ring = [Int16](repeating: 0, count: 16000 * 20)
  private var ringPos = 0
  private var ringFilled = 0
  private var clipWant = 0
  private var clipDone: ((Data?) -> Void)?

  /// The last `seconds` of sound as a WAV, right away (waits if fewer have been heard). nil if not listening.
  func recordClip(_ seconds: Int, done: @escaping (Data?) -> Void) {
    guard running else { done(nil); return }
    queue.async {
      EventLog.add("clip")
      let want = 16000 * max(1, min(20, seconds))
      if self.ringFilled >= want {
        let data = self.snapshot(want)
        DispatchQueue.global().async { done(data) }
      } else {
        self.clipDone?(nil)
        self.clipWant = want
        self.clipDone = done
      }
    }
  }

  private func snapshot(_ n: Int) -> Data {
    var out = [Int16](repeating: 0, count: n)
    let start = (ringPos - n + RING) % RING
    for i in 0..<n { out[i] = ring[(start + i) % RING] }
    return wav(out)
  }

  private func feedClip(_ x: [Float]) {
    for v in x {
      ring[ringPos] = Int16(max(-1, min(1, v)) * 32767)
      ringPos = (ringPos + 1) % RING
    }
    ringFilled = min(RING, ringFilled + x.count)
    if let done = clipDone, ringFilled >= clipWant {
      let data = snapshot(clipWant)
      clipDone = nil; clipWant = 0
      DispatchQueue.global().async { done(data) }
    }
  }

  private func cancelClip() {
    let d = clipDone
    clipDone = nil; clipWant = 0; ringFilled = 0; ringPos = 0
    d?(nil)
  }

  /// After a crying alert: a few more seconds of the cry, then the clip goes to every parent.
  private func sendCryClip(_ at: Int64) {
    let secs = cryClipSecs
    guard allowListen, secs > 0, !bucket.isEmpty else { return }
    let id = String((0..<24).map { _ in "abcdefghijklmnopqrstuvwxyz0123456789".randomElement()! })
    let path = "clips%2F\(id).wav"
    let upload = "https://firebasestorage.googleapis.com/v0/b/\(bucket)/o?uploadType=media&name=\(path)"
    let download = "https://firebasestorage.googleapis.com/v0/b/\(bucket)/o/\(path)?alt=media"
    let list = targets.compactMap { t -> (String, String)? in
      guard let token = t["token"], !token.isEmpty else { return nil }
      return (token, fill(t["cryClip"] ?? "{name}: {s} s").replacingOccurrences(of: "{s}", with: String(secs)))
    }
    queue.asyncAfter(deadline: .now() + 2.5) {
      guard self.running else { return }
      self.recordClip(secs) { data in
        guard let data else { return }
        AlertSender.upload(upload, data, contentType: "audio/wav") { ok, _ in
          if ok { AlertSender.sendEach(list, ["type": "clip", "auto": true, "url": download, "seconds": secs, "at": at]) }
        }
      }
    }
  }

  /// 16 kHz mono 16-bit WAV.
  private func wav(_ pcm: [Int16]) -> Data {
    var d = Data()
    func u32(_ v: UInt32) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 4)) }
    func u16(_ v: UInt16) { var x = v.littleEndian; d.append(Data(bytes: &x, count: 2)) }
    let bytes = UInt32(pcm.count * 2)
    d.append("RIFF".data(using: .ascii)!); u32(36 + bytes); d.append("WAVE".data(using: .ascii)!)
    d.append("fmt ".data(using: .ascii)!); u32(16); u16(1); u16(1); u32(16000); u32(32000); u16(2); u16(16)
    d.append("data".data(using: .ascii)!); u32(bytes)
    pcm.withUnsafeBufferPointer { d.append(Data(buffer: $0)) }
    return d
  }

  private func now() -> Int64 { Int64(Date().timeIntervalSince1970 * 1000) }
  func fill(_ s: String, _ pct: Int = 0) -> String {
    s.replacingOccurrences(of: "{name}", with: babyName).replacingOccurrences(of: "{pct}", with: String(pct))
  }

  /* ---------- start / stop ---------- */

  func start() -> Bool {
    if running { return true }
    stopRequested = false
    do {
      if model == nil { try loadModel() }
      try configureSession()
      try startEngine()
    } catch {
      listener?("status", ["error": error.localizedDescription])
      return false
    }
    running = true
    queue.async { self.resetState() }
    if monitorMode { EventLog.add("listen_start") }
    UIDevice.current.isBatteryMonitoringEnabled = true
    observe()
    return true
  }

  func stop() {
    stopRequested = true
    guard running else { return }
    running = false
    engine.inputNode.removeTap(onBus: 0)
    engine.stop()
    observers.forEach { NotificationCenter.default.removeObserver($0) }
    observers.removeAll()
    queue.async {
      self.endSpell()
      self.endTalk()
      self.cancelClip()
      if self.monitorMode { EventLog.add("listen_stop") }
    }
  }

  /// Listening ended without anyone asking (the system closed hush, the mic was taken).
  func reportUnexpectedStop(wait: Bool = false) {
    if stopRequested { return }
    alert("stopped", txtStopped, ["type": "stopped", "baby": babyName], wait: wait)
  }

  private func loadModel() throws {
    let path = Bundle.main.path(forResource: "yamnet", ofType: "tflite")
      ?? Bundle(for: CryEngine.self).path(forResource: "yamnet", ofType: "tflite")
    guard let path else { throw NSError(domain: "hush", code: 1, userInfo: [NSLocalizedDescriptionKey: "Cry model missing"]) }
    var opts = Interpreter.Options()
    opts.threadCount = 2
    let m = try Interpreter(modelPath: path, options: opts)
    try m.allocateTensors()
    classes = try m.output(at: 0).shape.dimensions.last ?? 521
    model = m
  }

  private func configureSession() throws {
    let s = AVAudioSession.sharedInstance()
    // Record while hush's white noise keeps playing through the speaker.
    try s.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker, .allowBluetoothA2DP])
    try s.setActive(true)
  }

  private func startEngine() throws {
    let input = engine.inputNode
    let inFormat = input.outputFormat(forBus: 0)
    guard inFormat.sampleRate > 0 else { throw NSError(domain: "hush", code: 2, userInfo: [NSLocalizedDescriptionKey: "Microphone unavailable"]) }
    converter = AVAudioConverter(from: inFormat, to: outFormat)
    input.removeTap(onBus: 0)
    input.installTap(onBus: 0, bufferSize: 4096, format: inFormat) { [weak self] buf, _ in self?.convert(buf) }
    engine.prepare()
    try engine.start()
  }

  private func observe() {
    let nc = NotificationCenter.default
    // A phone call or another app took the audio: pick up again when it's over.
    observers.append(nc.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] n in
      guard let self, self.running,
            let raw = n.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt,
            AVAudioSession.InterruptionType(rawValue: raw) == .ended else { return }
      self.restart()
    })
    observers.append(nc.addObserver(forName: AVAudioSession.mediaServicesWereResetNotification, object: nil, queue: .main) { [weak self] _ in
      self?.restart()
    })
    // The route or category changed (headphones, or the player reset the session).
    observers.append(nc.addObserver(forName: AVAudioSession.routeChangeNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self, self.running, !self.engine.isRunning else { return }
      self.restart()
    })
    observers.append(nc.addObserver(forName: UIApplication.willTerminateNotification, object: nil, queue: .main) { [weak self] _ in
      guard let self, self.running else { return }
      if self.monitorMode { EventLog.add("listen_stop") }
      self.reportUnexpectedStop(wait: true)
    })
  }

  private func restart() {
    guard running else { return }
    do {
      engine.stop()
      try configureSession()
      try startEngine()
    } catch {
      running = false
      listener?("status", ["error": error.localizedDescription])
      reportUnexpectedStop()
      queue.async { self.endSpell(); self.endTalk(); if self.monitorMode { EventLog.add("listen_stop") } }
    }
  }

  /* ---------- audio ---------- */

  private func convert(_ buf: AVAudioPCMBuffer) {
    guard let converter else { return }
    let ratio = outFormat.sampleRate / buf.format.sampleRate
    let cap = AVAudioFrameCount(Double(buf.frameLength) * ratio + 32)
    guard let out = AVAudioPCMBuffer(pcmFormat: outFormat, frameCapacity: cap) else { return }
    var given = false
    var err: NSError?
    converter.convert(to: out, error: &err) { _, status in
      if given { status.pointee = .noDataNow; return nil }
      given = true
      status.pointee = .haveData
      return buf
    }
    guard err == nil, let ch = out.floatChannelData else { return }
    let samples = Array(UnsafeBufferPointer(start: ch[0], count: Int(out.frameLength)))
    queue.async { self.feed(samples) }
  }

  private func resetState() {
    pending = []
    window = [Float](repeating: 0, count: WINDOW)
    clean = [Float](repeating: 0, count: WINDOW)
    filled = 0
    denoiser = Denoiser()
    pitch = PitchTracker()
    history = []
    spellStart = 0; lastHeard = 0; alerted = false; lastAlert = 0; peak = 0
    lowBatterySent = false
  }

  private func feed(_ samples: [Float]) {
    guard running else { return }
    feedClip(samples)
    pending.append(contentsOf: samples)
    while pending.count >= HOP {
      let hop = Array(pending[0..<HOP])
      pending.removeFirst(HOP)
      step(hop)
    }
  }

  private func step(_ hop: [Float]) {
    // Slide the windows and append the new half second (raw and cleaned).
    window.removeFirst(HOP); window.append(contentsOf: hop)
    let cleaned = denoiser.process(hop)
    clean.removeFirst(HOP); clean.append(contentsOf: cleaned)
    pitch.add(cleaned)
    filled = min(WINDOW, filled + HOP)
    var sumSq = 0.0
    for v in hop { sumSq += Double(v * v) }
    let levelDb = 20 * log10(max(1e-6, sqrt(sumSq / Double(HOP))))
    if filled < WINDOW { return }

    let noisy = denoiser.noiseDb > NOISY_DB
    guard let scores = classify(noisy ? clean : window) else { return }
    // Crying usually lights up several related classes at once, so add them up.
    let cry = scores[BABY_CRY] + 0.6 * scores[CRYING_SOBBING] + 0.4 * scores[WHIMPER] + 0.4 * scores[WAIL] + 0.2 * scores[SCREAMING]
    // Talking, babbling and laughing count against it when they're stronger than the crying.
    let talk = scores[SPEECH] + 0.6 * scores[CHILD_SPEECH] + 0.5 * (scores[CONVERSATION] + scores[NARRATION]) +
      0.7 * scores[BABBLING] + scores[LAUGHTER] + scores[BABY_LAUGHTER]
    let score = min(1, max(0, max(0, cry - 0.5 * max(0, talk - cry)) * pitch.factor()))
    var top = 0
    for c in 1..<classes where scores[c] > scores[top] { top = c }

    // About 2 s of crying within the last 4 s.
    history.append(score >= threshold)
    if history.count > 8 { history.removeFirst() }
    let crying = history.filter { $0 }.count >= 4
    let adult = scores[SPEECH] + 0.5 * (scores[CONVERSATION] + scores[NARRATION])
    talkHistory.append(adult >= 0.35 && adult > cry && pitch.factor() <= 1)
    if talkHistory.count > 8 { talkHistory.removeFirst() }
    let talking = talkHistory.filter { $0 }.count >= 3

    listener?("status", ["score": Double(score), "level": levelDb, "crying": crying, "top": top, "topScore": Double(scores[top]), "noiseDb": Double(denoiser.noiseDb)])

    // Once a minute: warn the parents if this phone is about to run out of battery.
    let t = now()
    if t - lastBatteryCheck > 60_000 {
      lastBatteryCheck = t
      let (pct, plugged) = battery()
      if !plugged && pct >= 1 && pct <= 15 && !lowBatterySent {
        lowBatterySent = true
        alert("lowBattery", txtLowBattery, ["type": "battery", "baby": babyName, "pct": pct], pct: pct)
      } else if plugged || pct > 25 { lowBatterySent = false }
    }

    // A spell lasts until there's been no crying for GAP_MS. Alert once it has lasted
    // delayMs, then remind every REPEAT_MS.
    if crying {
      if spellStart == 0 { spellStart = t }
      lastHeard = t
      peak = max(peak, score)
    } else if spellStart != 0 && t - lastHeard > GAP_MS {
      endSpell()
    }
    if talking {
      if talkStart == 0 { talkStart = t }
      lastTalk = t
    } else if talkStart != 0 && t - lastTalk > 10_000 {
      endTalk()
    }
    if spellStart != 0 && crying {
      let due = !alerted ? t - spellStart >= delayMs : t - lastAlert >= REPEAT_MS
      if due {
        let first = !alerted
        alerted = true
        lastAlert = t
        listener?("cry", ["at": Double(t), "first": first])
        EventLog.add("alert", ["first": first])
        if first { alert("crying", txtCrying, ["type": "cry", "baby": babyName, "at": t]) }
        else { alert("still", txtStill, ["type": "cry", "baby": babyName, "at": t]) }
        sendCryClip(t)
      }
    }
  }

  private func endTalk() {
    if talkStart == 0 { return }
    if lastTalk - talkStart >= 4000 { EventLog.add("talk", ["start": talkStart, "end": lastTalk]) }
    talkStart = 0
  }

  private func endSpell() {
    if spellStart == 0 { return }
    EventLog.add("cry", ["start": spellStart, "end": lastHeard, "peak": Double(peak), "alerted": alerted])
    spellStart = 0
    alerted = false
    peak = 0
  }

  private func classify(_ x: [Float]) -> [Float]? {
    guard let model else { return nil }
    do {
      let data = x.withUnsafeBufferPointer { Data(buffer: $0) }
      try model.copy(data, toInputAt: 0)
      try model.invoke()
      let out = try model.output(at: 0)
      let all = out.data.withUnsafeBytes { Array($0.bindMemory(to: Float32.self)) }
      if all.count <= classes { return all }
      // [frames, classes]: strongest score per class across frames.
      var best = [Float](repeating: 0, count: classes)
      for i in 0..<all.count { let c = i % classes; if all[i] > best[c] { best[c] = all[i] } }
      return best
    } catch {
      return nil
    }
  }

  private func battery() -> (Int, Bool) {
    var pct = 100, plugged = true
    DispatchQueue.main.sync {
      let d = UIDevice.current
      if d.batteryLevel >= 0 { pct = Int(d.batteryLevel * 100) }
      plugged = d.batteryState == .charging || d.batteryState == .full || d.batteryState == .unknown
    }
    return (pct, plugged)
  }

  /* ---------- alerts ---------- */

  /** True when this phone is the baby monitor (false: the mic only serves smart volume; nothing is sent). */
  var monitorMode = true
  func setMonitor(_ on: Bool) {
    if on == monitorMode { return }
    monitorMode = on
    if running { EventLog.add(on ? "listen_start" : "listen_stop") }
  }

  private func alert(_ kind: String, _ fallback: String, _ data: [String: Any], pct: Int = 0, wait: Bool = false) {
    if !monitorMode { return }
    let list = targets.compactMap { t -> (String, String)? in
      guard let token = t["token"], !token.isEmpty else { return nil }
      return (token, fill(t[kind] ?? fallback, pct))
    }
    if list.isEmpty { AlertSender.send(tokens, fill(fallback, pct), data, wait: wait); return }
    AlertSender.sendEach(list, data, wait: wait)
  }
}
