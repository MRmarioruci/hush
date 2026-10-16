import Foundation

/// Append-only log of what happened while listening (no audio). One JSON object per line.
/// Same format as the Android EventLog; the app moves the lines into its own storage with take().
enum EventLog {
  private static let lock = NSLock()
  private static var url: URL {
    let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
    try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
    return dir.appendingPathComponent("hush-events.jsonl")
  }

  static func add(_ type: String, _ fields: [String: Any] = [:]) {
    var o = fields
    o["type"] = type
    o["t"] = Int64(Date().timeIntervalSince1970 * 1000)
    guard let data = try? JSONSerialization.data(withJSONObject: o), var line = String(data: data, encoding: .utf8) else { return }
    line += "\n"
    lock.lock(); defer { lock.unlock() }
    if let h = try? FileHandle(forWritingTo: url) {
      h.seekToEndOfFile()
      h.write(line.data(using: .utf8)!)
      try? h.close()
    } else {
      try? line.write(to: url, atomically: true, encoding: .utf8)
    }
  }

  /// Everything logged so far; empties the log.
  static func take() -> String {
    lock.lock(); defer { lock.unlock() }
    guard let s = try? String(contentsOf: url, encoding: .utf8) else { return "" }
    try? "".write(to: url, atomically: true, encoding: .utf8)
    return s
  }
}
