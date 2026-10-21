package expo.modules.hushnative

import android.appwidget.AppWidgetManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.MediaPlayer
import org.json.JSONObject

/**
 * The latest "listen in" recording that arrived on this (parent's) phone, kept natively so the
 * home-screen widget learns about it even when hush's screens aren't running, and can play it
 * on the spot.
 */
object ClipStore {
  private const val PREFS = "hush-native"
  private const val KEY = "lastClip"

  fun save(context: Context, body: JSONObject) {
    try {
      val o = JSONObject()
        .put("url", body.optString("url"))
        .put("at", body.optLong("at", System.currentTimeMillis()))
        .put("seconds", body.optInt("seconds", 10))
        .put("error", body.optString("error"))
        .put("auto", body.optBoolean("auto"))
        .put("from", body.optString("from"))
        .put("got", System.currentTimeMillis())
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, o.toString()).apply()
      refreshWidgets(context)
    } catch (_: Exception) {}
  }

  fun last(context: Context): String = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, "") ?: ""

  /** Ask both hush widgets to redraw (their task handler then picks up the new recording). */
  fun refreshWidgets(context: Context) {
    for (name in listOf("Hush", "HushSmall")) {
      try {
        val cn = ComponentName(context.packageName, "${context.packageName}.widget.$name")
        val ids = AppWidgetManager.getInstance(context).getAppWidgetIds(cn)
        if (ids.isEmpty()) continue
        context.sendBroadcast(Intent(AppWidgetManager.ACTION_APPWIDGET_UPDATE).setComponent(cn).putExtra(AppWidgetManager.EXTRA_APPWIDGET_IDS, ids))
      } catch (_: Exception) {}
    }
  }

  /* ---------- playing it from the widget ---------- */
  @Volatile private var player: MediaPlayer? = null

  fun play(url: String, onDone: () -> Unit = {}): Boolean {
    stop()
    return try {
      val p = MediaPlayer()
      p.setAudioAttributes(AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_MEDIA).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
      p.setDataSource(url)
      p.setOnPreparedListener { it.start() }
      p.setOnCompletionListener { stop(); onDone() }
      p.setOnErrorListener { _, _, _ -> stop(); onDone(); true }
      p.prepareAsync()
      player = p
      true
    } catch (_: Exception) { stop(); false }
  }

  fun stop() {
    val p = player ?: return
    player = null
    try { p.stop() } catch (_: Exception) {}
    try { p.release() } catch (_: Exception) {}
  }

  fun isPlaying(): Boolean = try { player?.isPlaying == true } catch (_: Exception) { false }
}
