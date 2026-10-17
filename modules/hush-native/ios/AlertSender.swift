import Foundation

/// Sends alerts to the paired parent phones through Expo's push service (same as Android's AlertSender).
enum AlertSender {
  /// POSTs bytes (Firebase Storage's simple upload).
  static func upload(_ url: String, _ body: Data, contentType: String, done: @escaping (Bool, String) -> Void) {
    guard let u = URL(string: url) else { done(false, "Bad URL"); return }
    var req = URLRequest(url: u, timeoutInterval: 30)
    req.httpMethod = "POST"
    req.setValue(contentType, forHTTPHeaderField: "Content-Type")
    URLSession.shared.uploadTask(with: req, from: body) { data, resp, err in
      let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
      done(code >= 200 && code < 300, data.flatMap { String(data: $0, encoding: .utf8) } ?? (err?.localizedDescription ?? ""))
    }.resume()
  }

  private static let pushURL = URL(string: "https://exp.host/--/api/v2/push/send")!

  static func send(_ tokens: [String], _ body: String, _ data: [String: Any], wait: Bool = false, done: ((Bool, String) -> Void)? = nil) {
    sendEach(tokens.map { ($0, body) }, data, wait: wait, done: done)
  }

  /// One message per phone, each with its own text (every parent gets their own language).
  /// `wait` blocks until sent (up to a few seconds), for when the app is about to close.
  static func sendEach(_ list: [(String, String)], _ data: [String: Any], wait: Bool = false, done: ((Bool, String) -> Void)? = nil) {
    if list.isEmpty { done?(false, "No parent phones are paired yet"); return }
    let alarm = ["cry", "stopped", "test"].contains(data["type"] as? String ?? "")
    let messages: [[String: Any]] = list.map { token, body in
      var m: [String: Any] = [
        "to": token,
        "title": "hush",
        "body": body,
        "sound": alarm ? "alert.wav" : "default",
        "priority": "high",
        // Android channel; iPhones: crying breaks through Focus.
        "channelId": alarm ? "baby-alarm-2" : "cry-alerts",
        "interruptionLevel": alarm ? "time-sensitive" : "active",
        "data": data,
      ]
      if (data["type"] as? String) == "cry" { m["categoryId"] = "hush-cry" } // "Listen" button
      return m
    }
    var req = URLRequest(url: pushURL, timeoutInterval: 10)
    req.httpMethod = "POST"
    req.setValue("application/json", forHTTPHeaderField: "Content-Type")
    req.setValue("application/json", forHTTPHeaderField: "Accept")
    req.httpBody = try? JSONSerialization.data(withJSONObject: messages)
    let sem = wait ? DispatchSemaphore(value: 0) : nil
    URLSession.shared.dataTask(with: req) { body, resp, err in
      let code = (resp as? HTTPURLResponse)?.statusCode ?? 0
      let text = body.flatMap { String(data: $0, encoding: .utf8) } ?? (err?.localizedDescription ?? "")
      done?(code >= 200 && code < 300 && !text.contains("\"status\":\"error\""), text)
      sem?.signal()
    }.resume()
    _ = sem?.wait(timeout: .now() + 4)
  }
}
