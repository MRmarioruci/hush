package expo.modules.hushnative

import android.content.Context

/** hush's moon (generated from assets/notification-icon.png by expo-notifications), not the launcher icon,
 *  which Android draws as a plain square in the status bar. */
internal object NotifIcon {
  const val COLOR = 0xFFFFD68C.toInt()
  fun small(c: Context): Int {
    val id = c.resources.getIdentifier("notification_icon", "drawable", c.packageName)
    return if (id != 0) id else c.applicationInfo.icon
  }
}
