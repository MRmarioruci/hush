import AVFoundation
import ExpoModulesCore
import ExpoNotifications

/**
 JS bridge for the cry detector on iPhone, with the same functions as the Android module.
 It also passes silent push messages (remote control, sync, pairing) to JS as "onData": on iOS,
 expo-notifications only reports notifications that show an alert.
 */
public class HushCryModule: Module, NotificationDelegate {
  public func definition() -> ModuleDefinition {
    Name("HushCry")

    Events("onStatus", "onCry", "onData")

    OnCreate {
      CryEngine.shared.listener = { [weak self] type, payload in
        self?.sendEvent(type == "cry" ? "onCry" : "onStatus", payload)
      }
      NotificationCenterManager.shared.addDelegate(self)
    }

    OnDestroy {
      CryEngine.shared.listener = nil
      NotificationCenterManager.shared.removeDelegate(self)
    }

    Function("configure") { (threshold: Double, babyName: String, tokens: [String], delaySeconds: Int) in
      let e = CryEngine.shared
      e.threshold = Float(threshold)
      e.delayMs = Int64(delaySeconds) * 1000
      e.babyName = babyName
      e.tokens = tokens
    }

    Function("start") { () -> Bool in
      CryEngine.shared.start()
    }

    Function("stop") { () -> Bool in
      CryEngine.shared.stop()
      return true
    }

    Function("isListening") { CryEngine.shared.running }

    Function("setTargets") { (list: [[String: String]]) in
      CryEngine.shared.targets = list
    }

    Function("setTexts") { (texts: [String: String]) in
      let e = CryEngine.shared
      if let v = texts["crying"] { e.txtCrying = v }
      if let v = texts["still"] { e.txtStill = v }
      if let v = texts["lowBattery"] { e.txtLowBattery = v }
      if let v = texts["stopped"] { e.txtStopped = v }
    }

    // "testflight" or "appstore" (both sell through the App Store), "simulator" otherwise.
    Function("installer") { () -> String in
      #if targetEnvironment(simulator)
      return "simulator"
      #else
      return Bundle.main.appStoreReceiptURL?.lastPathComponent == "sandboxReceipt" ? "testflight" : "appstore"
      #endif
    }

    // Android's battery optimisation has no iOS counterpart.
    Function("isBatteryExempt") { true }
    Function("requestBatteryExempt") { true }

    Function("micPermission") { () -> String in
      switch AVAudioSession.sharedInstance().recordPermission {
      case .granted: return "granted"
      case .denied: return "denied"
      default: return "undetermined"
      }
    }

    AsyncFunction("requestMic") { (promise: Promise) in
      AVAudioSession.sharedInstance().requestRecordPermission { ok in promise.resolve(ok) }
    }

    Function("takeEvents") { EventLog.take() }

    // Android answers room/listen requests natively; on iOS the app does it.
    Function("setRoom") { (_: Bool, _: String) in }
    // Crying alerts can carry a clip, sent from here even while hush is in the background.
    Function("setListen") { (allow: Bool, bucket: String, _: String, cryClip: Int) in
      let e = CryEngine.shared
      e.allowListen = allow
      e.bucket = bucket
      e.cryClipSecs = cryClip
    }

    // "Listen in": record the next few seconds while listening and upload them as a WAV.
    AsyncFunction("recordClip") { (seconds: Int, uploadUrl: String, promise: Promise) in
      CryEngine.shared.recordClip(seconds) { data in
        guard let data else { promise.resolve(["ok": false, "detail": "notListening"]); return }
        AlertSender.upload(uploadUrl, data, contentType: "audio/wav") { ok, detail in
          promise.resolve(["ok": ok, "detail": detail])
        }
      }
    }

    AsyncFunction("sendAlert") { (tokens: [String], body: String, kind: String, promise: Promise) in
      AlertSender.send(tokens, body, ["type": kind, "baby": CryEngine.shared.babyName]) { ok, detail in
        promise.resolve(["ok": ok, "detail": detail])
      }
    }
  }

  /* ---------- silent pushes ---------- */

  public func didReceive(_ userInfo: [AnyHashable: Any], completionHandler: @escaping (UIBackgroundFetchResult) -> Void) -> Bool {
    // Expo puts the message's data under "body".
    var data: [String: Any] = [:]
    if let body = userInfo["body"] as? [String: Any] { data = body }
    else if let s = userInfo["body"] as? String, let d = s.data(using: .utf8),
            let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any] { data = o }
    guard data["type"] != nil else { return false }
    sendEvent("onData", data)
    // Give JS a moment to act (start the sound, answer a sync) before iOS suspends hush.
    DispatchQueue.main.asyncAfter(deadline: .now() + 5) { completionHandler(.newData) }
    return true
  }
}
