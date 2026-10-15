package expo.modules.hushnative

import android.content.Intent
import android.os.Build
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/** JS bridge for the cry detector: start/stop listening, settings, and a test alert. */
class HushCryModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("HushCry")

    Events("onStatus", "onCry")

    OnCreate {
      appContext.reactContext?.let { EventLog.init(it) }
      CryEngine.listener = { type, payload ->
        try { sendEvent(if (type == "cry") "onCry" else "onStatus", payload) } catch (_: Exception) {}
      }
    }

    OnDestroy {
      CryEngine.listener = null
    }

    Function("configure") { threshold: Double, babyName: String, tokens: List<String>, delaySeconds: Int ->
      CryEngine.threshold = threshold.toFloat()
      CryEngine.delayMs = delaySeconds * 1000L
      CryEngine.babyName = babyName
      CryEngine.tokens = tokens
    }

    Function("start") {
      val ctx = appContext.reactContext ?: return@Function false
      val intent = Intent(ctx, CryListenerService::class.java)
      if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
      true
    }

    Function("stop") {
      val ctx = appContext.reactContext ?: return@Function false
      ctx.stopService(Intent(ctx, CryListenerService::class.java))
      CryEngine.stop()
      true
    }

    Function("isListening") { CryEngine.running }

    // Hands the app everything logged since last time, one JSON object per line.
    Function("takeEvents") {
      appContext.reactContext?.let { EventLog.init(it) }
      EventLog.take()
    }

    AsyncFunction("sendAlert") { tokens: List<String>, body: String, kind: String, promise: Promise ->
      AlertSender.send(tokens, body, mapOf("type" to kind, "baby" to CryEngine.babyName)) { ok, detail ->
        promise.resolve(mapOf("ok" to ok, "detail" to detail))
      }
    }
  }
}
