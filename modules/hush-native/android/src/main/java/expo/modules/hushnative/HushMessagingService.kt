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
      val type = data["body"]?.let { runCatching { JSONObject(it).optString("type") }.getOrNull() }
      if (type in setOf("cry", "stopped", "test") || data["channelId"] == "baby-alarm-2") alarmBuzz(applicationContext)
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
