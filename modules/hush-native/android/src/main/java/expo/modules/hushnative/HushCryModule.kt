package expo.modules.hushnative

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
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

    Function("setTexts") { texts: Map<String, String> ->
      texts["crying"]?.let { CryEngine.txtCrying = it }
      texts["still"]?.let { CryEngine.txtStill = it }
      texts["lowBattery"]?.let { CryEngine.txtLowBattery = it }
      texts["stopped"]?.let { CryEngine.txtStopped = it }
      texts["listenTitle"]?.let { CryEngine.txtListenTitle = it }
      texts["listenText"]?.let { CryEngine.txtListenText = it }
    }

    // Battery optimisation: some phones close background apps overnight unless exempted.
    Function("isBatteryExempt") {
      val ctx = appContext.reactContext ?: return@Function true
      if (Build.VERSION.SDK_INT < 23) return@Function true
      (ctx.getSystemService(Context.POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(ctx.packageName)
    }

    Function("requestBatteryExempt") {
      val ctx = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < 23) return@Function true
      try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${ctx.packageName}"))
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
        true
      } catch (_: Exception) {
        try {
          ctx.startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
          true
        } catch (_: Exception) { false }
      }
    }

    Function("stop") {
      CryEngine.stopRequested = true
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
