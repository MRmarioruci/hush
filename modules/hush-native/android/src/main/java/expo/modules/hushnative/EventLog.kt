package expo.modules.hushnative

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Append-only log of what happened while listening (no audio). One JSON object per line.
 * Written natively so nothing is missed while the screen is locked; the app moves the lines
 * into its own storage with [take] and rolls old nights up into summaries.
 */
object EventLog {
  private const val NAME = "hush-events.jsonl"
  private var file: File? = null

  fun init(context: Context) {
    if (file == null) file = File(context.applicationContext.filesDir, NAME)
  }

  @Synchronized
  fun add(type: String, fields: Map<String, Any> = emptyMap()) {
    val f = file ?: return
    val o = JSONObject().put("type", type).put("t", System.currentTimeMillis())
    for ((k, v) in fields) o.put(k, v)
    try {
      f.appendText(o.toString() + "\n")
      // The app empties this every minute; if it ever can't, keep only the newest part.
      if (f.length() > 1_000_000) f.writeText(f.readLines().takeLast(3000).joinToString("\n", postfix = "\n"))
    } catch (_: Exception) {}
  }

  /** Returns everything logged so far and empties the log. */
  @Synchronized
  fun take(): String {
    val f = file ?: return ""
    if (!f.exists()) return ""
    return try { f.readText().also { f.writeText("") } } catch (_: Exception) { "" }
  }
}
