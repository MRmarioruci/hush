package expo.modules.hushnative

import android.app.PendingIntent
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.service.quicksettings.Tile
import android.service.quicksettings.TileService

/**
 * Quick Settings tile ("hush"): one tap starts or stops the white noise (on a parent's phone:
 * in the baby's room). It opens hush with hush://do/noise, which does the rest.
 */
class HushTileService : TileService() {
  override fun onStartListening() {
    super.onStartListening()
    qsTile?.let {
      it.state = if (CryEngine.roomPlaying) Tile.STATE_ACTIVE else Tile.STATE_INACTIVE
      it.updateTile()
    }
  }

  override fun onClick() {
    super.onClick()
    val intent = Intent(Intent.ACTION_VIEW, Uri.parse("hush://do/noise")).apply {
      setPackage(packageName)
      addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    }
    if (Build.VERSION.SDK_INT >= 34) {
      startActivityAndCollapse(PendingIntent.getActivity(this, 0, intent, PendingIntent.FLAG_IMMUTABLE))
    } else {
      @Suppress("DEPRECATION", "StartActivityAndCollapseDeprecated")
      startActivityAndCollapse(intent)
    }
  }
}
