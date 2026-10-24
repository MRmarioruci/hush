package expo.modules.hushnative

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject

/**
 * Keeps the family in sync while hush is closed or asleep in the background:
 * - every room report from another phone is saved here as it arrives (the app reads them when it
 *   opens, so nothing a phone said while this one was closed is lost);
 * - who this phone is and who its family is, so a fresh process woken by a push can still answer
 *   "what's your room doing?" honestly.
 */
object RoomStore {
  private const val PREFS = "hush-rooms"

  private fun prefs(c: Context) = c.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

  fun save(context: Context, body: JSONObject) {
    val from = body.optString("from").ifEmpty { return }
    try {
      val p = prefs(context)
      val prev = p.getString("r:$from", null)?.let { runCatching { JSONObject(it) }.getOrNull() }
      if (prev != null && prev.optLong("at") > body.optLong("at")) return // an older report arriving late
      body.put("got", System.currentTimeMillis())
      p.edit().putString("r:$from", body.toString()).apply()
    } catch (_: Exception) {}
  }

  /** Every saved report: { token: report }. */
  fun all(context: Context): String {
    val out = JSONObject()
    try { for ((k, v) in prefs(context).all) if (k.startsWith("r:") && v is String) out.put(k.substring(2), JSONObject(v)) } catch (_: Exception) {}
    return out.toString()
  }

  fun saveMe(context: Context) {
    try {
      val arr = JSONArray()
      for (t in CryEngine.targets) arr.put(JSONObject(t as Map<*, *>))
      prefs(context).edit()
        .putString("me", CryEngine.myToken).putString("myName", CryEngine.myName)
        .putString("baby", CryEngine.babyName).putString("targets", arr.toString()).apply()
    } catch (_: Exception) {}
  }

  /** A fresh process (woken by a push): who we are and who may ask. */
  fun restoreMe(context: Context) {
    if (CryEngine.targets.isNotEmpty() && CryEngine.myToken.isNotEmpty()) return
    try {
      val p = prefs(context)
      if (CryEngine.myToken.isEmpty()) CryEngine.myToken = p.getString("me", "") ?: ""
      if (CryEngine.myName.isEmpty()) CryEngine.myName = p.getString("myName", "") ?: ""
      p.getString("baby", null)?.let { if (it.isNotEmpty()) CryEngine.babyName = it }
      if (CryEngine.targets.isEmpty()) {
        val arr = JSONArray(p.getString("targets", "[]"))
        CryEngine.targets = (0 until arr.length()).map { i ->
          val o = arr.getJSONObject(i)
          o.keys().asSequence().associateWith { o.optString(it) }
        }
      }
    } catch (_: Exception) {}
  }
}
