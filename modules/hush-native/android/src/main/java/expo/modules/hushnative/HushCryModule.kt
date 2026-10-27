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
      appContext.reactContext?.let { RoomStore.saveMe(it) }
    }
    Function("setBaby") { name: String ->
      CryEngine.babyName = name
      appContext.reactContext?.let { RoomStore.saveMe(it) }
    }
    // The family's room in the cloud, for writing this phone's state while hush sleeps (CloudSync.kt).
    Function("setCloud") { apiKey: String, projectId: String, room: String, phone: String, refreshToken: String ->
      val ctx = appContext.reactContext ?: return@Function false
      if (room.isEmpty()) CloudSync.clear(ctx) else CloudSync.configure(ctx, apiKey, projectId, room, phone, refreshToken)
      true
    }
    // The Quick Settings tile follows the white noise the app shows (here, or the baby's room).
    Function("setTile") { playing: Boolean ->
      CryEngine.tilePlaying = playing
      appContext.reactContext?.let { ctx ->
        try { android.service.quicksettings.TileService.requestListeningState(ctx, android.content.ComponentName(ctx, HushTileService::class.java)) } catch (_: Exception) {}
      }
      Unit
    }
    // On a call (or one ringing): a pause of the white noise then is an interruption, not a choice.
    Function("inCall") {
      val am = appContext.reactContext?.getSystemService(android.content.Context.AUDIO_SERVICE) as? android.media.AudioManager
      val mode = am?.mode ?: android.media.AudioManager.MODE_NORMAL
      mode == android.media.AudioManager.MODE_IN_CALL || mode == android.media.AudioManager.MODE_IN_COMMUNICATION || mode == android.media.AudioManager.MODE_RINGTONE
    }
    // Room reports that arrived natively (also while hush was closed): JSON { token: report }.
    Function("rooms") { appContext.reactContext?.let { RoomStore.all(it) } ?: "{}" }

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
      appContext.reactContext?.let { RoomStore.saveMe(it) }
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
      appContext.reactContext?.let { RoomStore.saveMe(it) }
    }

    // Baby monitor, or only smart volume's ears (then nothing is sent to the other phones).
    Function("setMonitor") { on: Boolean -> CryEngine.setMonitor(on) }
    Function("setVisible") { on: Boolean -> CryEngine.uiVisible = on }
    // Listening as the baby monitor (not just for smart volume).
    Function("isMonitoring") { CryEngine.running && CryEngine.monitorMode }
    // Another phone took over as the baby monitor while hush wasn't running here: who (once).
    Function("takeUnmonitored") {
      val p = appContext.reactContext?.getSharedPreferences("hush-native", android.content.Context.MODE_PRIVATE) ?: return@Function null
      val v = p.getString("unmonitoredBy", null)
      if (v != null) p.edit().remove("unmonitoredBy").apply()
      v
    }
    // When this phone became the baby monitor (0 = it isn't).
    Function("listenSince") { if (CryEngine.running && CryEngine.monitorMode) CryEngine.listenSince.toDouble() else 0.0 }

    Function("setTexts") { texts: Map<String, String> ->
      texts["crying"]?.let { CryEngine.txtCrying = it }
      texts["still"]?.let { CryEngine.txtStill = it }
      texts["lowBattery"]?.let { CryEngine.txtLowBattery = it }
      texts["stopped"]?.let { CryEngine.txtStopped = it }
      texts["listenTitle"]?.let { CryEngine.txtListenTitle = it }
      texts["listenText"]?.let { CryEngine.txtListenText = it }
      texts["allowAsk"]?.let { CryEngine.txtAllowAsk = it }
      texts["monitorAsk"]?.let { CryEngine.txtMonitorAsk = it }
      texts["acked"]?.let { CryEngine.txtAcked = it }
      if (texts.containsKey("listenText")) appContext.reactContext?.let { CryListenerService.refresh(it) }
    }

    // Which app store installed hush ("com.android.vending" = Google Play), or "" if sideloaded.
    // Tell the family's phones right away whether this phone is listening (after starting or stopping).
    Function("reportRoom") {
      val ctx = appContext.reactContext ?: return@Function false
      Thread { try { CryEngine.reportRoom(ctx) } catch (_: Exception) {} }.start()
      true
    }

    // The name people know the phone by: what's set in Settings > About phone, else maker and model.
    // The app's moon as a file (file://…), for the playback notification's picture. In release builds
    // bundled images are resources, not files, and expo-audio needs a URL it can open.
    Function("artworkFile") { name: String ->
      val ctx = appContext.reactContext ?: return@Function ""
      try {
        val out = java.io.File(ctx.cacheDir, "hush-$name.png")
        if (!out.exists() || out.length() == 0L) {
          val id = ctx.resources.getIdentifier(name, "drawable", ctx.packageName)
          if (id == 0) return@Function ""
          val bmp = android.graphics.BitmapFactory.decodeResource(ctx.resources, id) ?: return@Function ""
          out.outputStream().use { bmp.compress(android.graphics.Bitmap.CompressFormat.PNG, 100, it) }
        }
        "file://" + out.absolutePath
      } catch (_: Exception) { "" }
    }

    Function("deviceName") {
      val ctx = appContext.reactContext
      val set = try { ctx?.let { android.provider.Settings.Global.getString(it.contentResolver, "device_name") } } catch (_: Exception) { null }
      val bt = try { ctx?.let { android.provider.Settings.Secure.getString(it.contentResolver, "bluetooth_name") } } catch (_: Exception) { null }
      val maker = Build.MANUFACTURER.replaceFirstChar { it.uppercase() }
      val model = if (Build.MODEL.startsWith(Build.MANUFACTURER, ignoreCase = true)) Build.MODEL else "$maker ${Build.MODEL}"
      (set?.takeIf { it.isNotBlank() } ?: bt?.takeIf { it.isNotBlank() } ?: model).trim()
    }

    Function("takeDeadTokens") { AlertSender.takeDead() }

    // The latest recording that arrived (JSON, "" if none), and playing it without hush's screens.
    Function("lastClip") { appContext.reactContext?.let { ClipStore.last(it) } ?: "" }
    Function("playClip") { url: String -> ClipStore.play(url) }
    Function("stopClip") { ClipStore.stop() }
    Function("clipPlaying") { ClipStore.isPlaying() }
    Function("refreshWidgets") { appContext.reactContext?.let { ClipStore.refreshWidgets(it) }; Unit }

    Function("battery") {
      val ctx = appContext.reactContext ?: return@Function listOf(-1, false)
      val (pct, plugged) = CryEngine.battery(ctx)
      listOf(pct, plugged)
    }

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
    Function("diagMemory") { what: String -> appContext.reactContext?.let { Diag.init(it) }; Diag.memory(what) }
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
