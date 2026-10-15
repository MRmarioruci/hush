package expo.modules.hushvolume

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioManager
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

/**
 * Reads and sets the phone's media volume, reports every change, and can hold
 * the volume at or below a ceiling. The ceiling is enforced here in native code
 * so it keeps working while the screen is locked and JavaScript is asleep.
 */
class HushVolumeModule : Module() {
  private var receiver: BroadcastReceiver? = null
  private var ceiling: Int = -1 // -1 means no ceiling

  private val context: Context?
    get() = appContext.reactContext

  private val audio: AudioManager?
    get() = context?.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

  private fun state(): Map<String, Int> {
    val am = audio ?: return mapOf("step" to 0, "max" to 15)
    return mapOf(
      "step" to am.getStreamVolume(AudioManager.STREAM_MUSIC),
      "max" to am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
    )
  }

  private fun enforce() {
    val am = audio ?: return
    if (ceiling < 0) return
    if (am.getStreamVolume(AudioManager.STREAM_MUSIC) > ceiling) {
      am.setStreamVolume(AudioManager.STREAM_MUSIC, ceiling, 0)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("HushVolume")

    Events("onVolumeChange")

    OnCreate {
      val ctx = context ?: return@OnCreate
      val r = object : BroadcastReceiver() {
        override fun onReceive(c: Context?, intent: Intent?) {
          val type = intent?.getIntExtra("android.media.EXTRA_VOLUME_STREAM_TYPE", -1) ?: -1
          if (type != AudioManager.STREAM_MUSIC && type != -1) return
          enforce()
          sendEvent("onVolumeChange", state())
        }
      }
      val filter = IntentFilter("android.media.VOLUME_CHANGED_ACTION")
      if (Build.VERSION.SDK_INT >= 33) {
        ctx.registerReceiver(r, filter, Context.RECEIVER_EXPORTED)
      } else {
        @Suppress("UnspecifiedRegisterReceiverFlag")
        ctx.registerReceiver(r, filter)
      }
      receiver = r
    }

    OnDestroy {
      receiver?.let { r -> try { context?.unregisterReceiver(r) } catch (_: Exception) {} }
      receiver = null
    }

    Function("getVolume") { state() }

    Function("setStep") { step: Int ->
      val am = audio ?: return@Function state()
      val max = am.getStreamMaxVolume(AudioManager.STREAM_MUSIC)
      var target = step.coerceIn(0, max)
      if (ceiling >= 0) target = target.coerceAtMost(ceiling)
      am.setStreamVolume(AudioManager.STREAM_MUSIC, target, 0)
      state()
    }

    // Pass -1 to remove the ceiling.
    Function("setCeiling") { step: Int ->
      ceiling = step
      enforce()
      state()
    }
  }
}
