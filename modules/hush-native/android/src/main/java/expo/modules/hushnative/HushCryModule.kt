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
      // Android doesn't allow starting the microphone from the background (e.g. white noise
      // started from a parent's phone with this screen locked). Say no instead of crashing.
      try {
        if (Build.VERSION.SDK_INT >= 26) ctx.startForegroundService(intent) else ctx.startService(intent)
        true
      } catch (e: Exception) {
        android.util.Log.w("HushCry", "Can't start listening now", e)
        false
      }
    }

    // What the parents see about the room (white noise), and the "listen in" settings.
    Function("setRoom") { playing: Boolean, sound: String ->
      val changed = CryEngine.roomPlaying != playing || CryEngine.roomSound != sound
      CryEngine.roomPlaying = playing
      CryEngine.roomSound = sound
      val ctx = appContext.reactContext
      if (changed && ctx != null && CryEngine.running) CryEngine.reportRoom(ctx)
    }
    Function("setMe") { token: String, name: String ->
      CryEngine.myToken = token
      CryEngine.myName = name
    }
    Function("setListen") { allow: Boolean, bucket: String, notice: String, cryClip: Int ->
      CryEngine.allowListen = allow
      CryEngine.cryClipSecs = cryClip
      CryEngine.bucket = bucket
      CryEngine.txtListenNotice = notice
    }

    // Alert texts for each paired parent, in their own language.
    Function("setTargets") { list: List<Map<String, String>> ->
      CryEngine.targets = list
    }

    Function("setTexts") { texts: Map<String, String> ->
      texts["crying"]?.let { CryEngine.txtCrying = it }
      texts["still"]?.let { CryEngine.txtStill = it }
      texts["lowBattery"]?.let { CryEngine.txtLowBattery = it }
      texts["stopped"]?.let { CryEngine.txtStopped = it }
      texts["listenTitle"]?.let { CryEngine.txtListenTitle = it }
      texts["listenText"]?.let { CryEngine.txtListenText = it }
    }

    // Which app store installed hush ("com.android.vending" = Google Play), or "" if sideloaded.
    Function("installer") {
      val ctx = appContext.reactContext ?: return@Function ""
      try {
        if (Build.VERSION.SDK_INT >= 30) ctx.packageManager.getInstallSourceInfo(ctx.packageName).installingPackageName ?: ""
        else @Suppress("DEPRECATION") (ctx.packageManager.getInstallerPackageName(ctx.packageName) ?: "")
      } catch (e: Exception) { "" }
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
    // Diagnostics (no personal data): a mark from JS, and the full report to share.
    Function("diagMark") { what: String -> appContext.reactContext?.let { Diag.init(it) }; Diag.add("js $what") }
    Function("diagReport") { appContext.reactContext?.let { Diag.init(it); Diag.report(it) } ?: "" }

    Function("takeEvents") {
      appContext.reactContext?.let { EventLog.init(it) }
      EventLog.take()
    }

    // "Listen in": record the next few seconds while listening and upload them as a WAV.
    AsyncFunction("recordClip") { seconds: Int, uploadUrl: String, promise: Promise ->
      CryEngine.recordClip(seconds) { bytes ->
        if (bytes == null) { promise.resolve(mapOf("ok" to false, "detail" to "notListening")); return@recordClip }
        val (ok, detail) = AlertSender.upload(uploadUrl, bytes, "audio/wav")
        promise.resolve(mapOf("ok" to ok, "detail" to detail))
      }
    }

    AsyncFunction("sendAlert") { tokens: List<String>, body: String, kind: String, promise: Promise ->
      AlertSender.send(tokens, body, mapOf("type" to kind, "baby" to CryEngine.babyName)) { ok, detail ->
        promise.resolve(mapOf("ok" to ok, "detail" to detail))
      }
    }
  }
}
