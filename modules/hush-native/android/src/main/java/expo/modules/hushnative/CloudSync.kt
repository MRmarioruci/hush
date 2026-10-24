package expo.modules.hushnative

import android.content.Context
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder

/**
 * Writes this phone's live state (baby monitor on/off, white noise, battery) into the family's
 * room in Firestore from the native side, so it stays right while hush sleeps in the background,
 * the screen is locked, or the app was closed. Uses the anonymous sign-in the app made (its refresh
 * token), over Firestore's REST API. See src/cloud.ts for the room's layout.
 */
object CloudSync {
  private const val PREFS = "hush-cloud"
  @Volatile private var idToken = ""
  @Volatile private var idTokenUntil = 0L
  private val lock = Any()
  // One write at a time, in order: a late "listening" must never land after "stopped".
  private val queue = java.util.concurrent.Executors.newSingleThreadExecutor()

  fun configure(context: Context, apiKey: String, projectId: String, room: String, phone: String, refreshToken: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
      .putString("apiKey", apiKey).putString("project", projectId).putString("room", room)
      .putString("phone", phone).putString("refresh", refreshToken).apply()
    synchronized(lock) { idToken = ""; idTokenUntil = 0L }
  }

  fun clear(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  /** Merge these fields into this phone's document. Runs on its own thread; never throws. */
  fun writePhone(context: Context, fields: Map<String, Any?>) {
    val app = context.applicationContext
    queue.execute {
      try { write(app, fields) } catch (e: Exception) { Diag.add("cloud write failed: ${e.javaClass.simpleName}: ${e.message?.take(120)}") }
    }
  }

  private fun write(context: Context, fields: Map<String, Any?>) {
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val apiKey = p.getString("apiKey", "") ?: ""
    val project = p.getString("project", "") ?: ""
    val room = p.getString("room", "") ?: ""
    val phone = p.getString("phone", "") ?: ""
    if (apiKey.isEmpty() || project.isEmpty() || room.isEmpty() || phone.isEmpty()) return
    val token = token(context, apiKey) ?: return
    val body = JSONObject()
    val values = JSONObject()
    val mask = StringBuilder()
    for ((k, v) in fields) {
      val value = when (v) {
        null -> JSONObject().put("nullValue", JSONObject.NULL)
        is Boolean -> JSONObject().put("booleanValue", v)
        is Int -> JSONObject().put("integerValue", v.toString())
        is Long -> JSONObject().put("integerValue", v.toString())
        is Double -> JSONObject().put("doubleValue", v)
        is Float -> JSONObject().put("doubleValue", v.toDouble())
        else -> JSONObject().put("stringValue", v.toString())
      }
      values.put(k, value)
      mask.append(if (mask.isEmpty()) "?" else "&").append("updateMask.fieldPaths=").append(URLEncoder.encode(k, "UTF-8"))
    }
    body.put("fields", values)
    val url = "https://firestore.googleapis.com/v1/projects/$project/databases/(default)/documents/families/$room/phones/$phone$mask"
    val c = URL(url).openConnection() as HttpURLConnection
    try {
      c.requestMethod = "PATCH"
      c.connectTimeout = 15000; c.readTimeout = 15000
      c.doOutput = true
      c.setRequestProperty("Content-Type", "application/json")
      c.setRequestProperty("Authorization", "Bearer $token")
      c.outputStream.use { it.write(body.toString().toByteArray()) }
      val code = c.responseCode
      if (code == 401 || code == 403) synchronized(lock) { idTokenUntil = 0L }
      if (code !in 200..299) Diag.add("cloud write $code: ${c.errorStream?.bufferedReader()?.readText()?.take(160)}")
    } finally { c.disconnect() }
  }

  /** A fresh sign-in token from the refresh token (they last an hour). */
  private fun token(context: Context, apiKey: String): String? = synchronized(lock) {
    if (idToken.isNotEmpty() && System.currentTimeMillis() < idTokenUntil) return idToken
    val p = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val refresh = p.getString("refresh", "") ?: ""
    if (refresh.isEmpty()) return null
    val c = URL("https://securetoken.googleapis.com/v1/token?key=$apiKey").openConnection() as HttpURLConnection
    try {
      c.requestMethod = "POST"
      c.connectTimeout = 15000; c.readTimeout = 15000
      c.doOutput = true
      c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
      c.setRequestProperty("X-Android-Package", context.packageName)
      c.outputStream.use { it.write("grant_type=refresh_token&refresh_token=${URLEncoder.encode(refresh, "UTF-8")}".toByteArray()) }
      if (c.responseCode !in 200..299) {
        Diag.add("cloud token ${c.responseCode}: ${c.errorStream?.bufferedReader()?.readText()?.take(160)}")
        return null
      }
      val j = JSONObject(c.inputStream.bufferedReader().readText())
      idToken = j.optString("id_token")
      idTokenUntil = System.currentTimeMillis() + (j.optString("expires_in", "3600").toLongOrNull() ?: 3600L) * 1000L - 5 * 60_000L
      j.optString("refresh_token").takeIf { it.isNotEmpty() && it != refresh }?.let { p.edit().putString("refresh", it).apply() }
      return idToken.ifEmpty { null }
    } finally { c.disconnect() }
  }
}
