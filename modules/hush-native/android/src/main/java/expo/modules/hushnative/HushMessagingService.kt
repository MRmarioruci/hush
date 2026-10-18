package expo.modules.hushnative

import android.content.Context
import android.media.AudioAttributes
import android.os.Build
import android.os.VibrationAttributes
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService
import org.json.JSONObject

/**
 * Receives push messages before expo-notifications shows them. For crying alerts it also
 * vibrates the phone itself, as an alarm, so the parent feels it even with the phone on silent
 * (many phones mute notification vibration in silent mode).
 */
class HushMessagingService : ExpoFirebaseMessagingService() {
  override fun onMessageReceived(remoteMessage: RemoteMessage) {
    super.onMessageReceived(remoteMessage)
    try {
      val data = remoteMessage.data
      val body = data["body"]?.let { runCatching { JSONObject(it) }.getOrNull() }
      val type = body?.optString("type")
      if (type in setOf("cry", "stopped", "test") || data["channelId"] == "baby-alarm-2") alarmBuzz(applicationContext)
      // Requests from a paired parent, answered here so they work with the screen locked.
      if (type == "cmd" && body != null) RoomCommands.handle(applicationContext, body)
    } catch (_: Exception) {}
  }
}

/** Baby's phone: answers "status" and "clip" (listen in) natively, even when the app is asleep. */
object RoomCommands {
  private val busy = java.util.concurrent.atomic.AtomicBoolean(false)

  fun handle(context: Context, body: JSONObject) {
    val from = body.optString("from")
    val parent = CryEngine.targets.firstOrNull { it["token"] == from } ?: return
    when (body.optString("cmd")) {
      "status" -> CryEngine.reportRoom(context, listOf(from))
      "clip" -> clip(context, from, parent, body.optInt("seconds", 10).coerceIn(5, 15))
    }
  }

  private fun clip(context: Context, to: String, parent: Map<String, String>, secs: Int) {
    fun text(key: String) = (parent[key] ?: key).replace("{s}", secs.toString())
    fun reply(key: String, extra: Map<String, Any>) =
      AlertSender.sendEach(listOf(to to text(key)), mapOf("type" to "clip", "at" to System.currentTimeMillis(), "seconds" to secs, "from" to CryEngine.myToken) + extra)
    if (!CryEngine.allowListen) return reply("listenOff", mapOf("error" to "off"))
    if (!CryEngine.running) return reply("listenNotListening", mapOf("error" to "notListening"))
    val (upload, download) = CryEngine.clipUrls() ?: return reply("listenFailed", mapOf("error" to "setup"))
    if (!busy.compareAndSet(false, true)) return
    notice(context, CryEngine.txtListenNotice.replace("{who}", parent["name"] ?: "").replace("{s}", secs.toString()))
    CryEngine.recordClip(secs) { bytes ->
      try {
        if (bytes == null) reply("listenNotListening", mapOf("error" to "notListening"))
        else {
          val (ok, detail) = AlertSender.upload(upload, bytes, "audio/wav")
          if (ok) reply("listenReady", mapOf("url" to download))
          else reply("listenFailed", mapOf("error" to "upload", "detail" to detail.take(300)))
        }
      } finally { busy.set(false) }
    }
  }

  /** Nobody listens in unnoticed: a notice on the baby's phone. */
  private fun notice(context: Context, text: String) {
    try {
      val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as android.app.NotificationManager
      val builder = if (Build.VERSION.SDK_INT >= 26) android.app.Notification.Builder(context, "cry-alerts")
        else @Suppress("DEPRECATION") android.app.Notification.Builder(context)
      nm.notify(4343, builder.setSmallIcon(context.applicationInfo.icon).setContentTitle("hush").setContentText(text).setAutoCancel(true).build())
    } catch (_: Exception) {}
  }
}

private val PATTERN = longArrayOf(0, 700, 300, 700, 300, 700)

fun alarmBuzz(context: Context) {
  val vibrator: Vibrator = if (Build.VERSION.SDK_INT >= 31) {
    (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
  } else {
    @Suppress("DEPRECATION") context.getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
  }
  if (!vibrator.hasVibrator()) return
  val effect = VibrationEffect.createWaveform(PATTERN, -1)
  when {
    Build.VERSION.SDK_INT >= 33 -> vibrator.vibrate(effect, VibrationAttributes.createForUsage(VibrationAttributes.USAGE_ALARM))
    else -> @Suppress("DEPRECATION") vibrator.vibrate(
      effect,
      AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_ALARM).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build()
    )
  }
}
