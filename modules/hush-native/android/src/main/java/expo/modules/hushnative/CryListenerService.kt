package expo.modules.hushnative

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

/** Keeps the mic listening with the screen locked, with a quiet ongoing notification. */
class CryListenerService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= 26 && nm.getNotificationChannel(CHANNEL) == null) {
      nm.createNotificationChannel(
        NotificationChannel(CHANNEL, "Listening for crying", NotificationManager.IMPORTANCE_LOW).apply {
          description = "Shown while hush is listening for your baby"
          setShowBadge(false)
        }
      )
    }
    val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
      PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }
    val builder = if (Build.VERSION.SDK_INT >= 26) Notification.Builder(this, CHANNEL) else @Suppress("DEPRECATION") Notification.Builder(this)
    val notification = builder
      .setSmallIcon(NotifIcon.small(this)).setColor(NotifIcon.COLOR)
      .setContentTitle(CryEngine.txtListenTitle)
      .setContentText(CryEngine.fill(CryEngine.txtListenText))
      .setOngoing(true)
      .setContentIntent(open)
      .build()

    try {
      if (Build.VERSION.SDK_INT >= 29) {
        startForeground(ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE)
      } else {
        startForeground(ID, notification)
      }
    } catch (e: Exception) {
      // Not allowed right now (started from the background, or restarted by the system):
      // stop quietly rather than crash the app and its white noise.
      android.util.Log.w("HushCry", "Microphone service not allowed now", e)
      CryEngine.listener?.invoke("status", mapOf("error" to "background"))
      stopSelf()
      return START_NOT_STICKY
    }
    CryEngine.start(this)
    // Not sticky: a system restart would happen in the background, where Android doesn't allow
    // the microphone, and crash. If it's closed, the parents get the "stopped listening" alert.
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    // The system ended the service (low memory, battery saver) rather than the user.
    if (CryEngine.running) CryEngine.reportUnexpectedStop()
    CryEngine.stop()
    super.onDestroy()
  }

  companion object {
    private const val CHANNEL = "hush-listening"
    private const val ID = 4242
  }
}
