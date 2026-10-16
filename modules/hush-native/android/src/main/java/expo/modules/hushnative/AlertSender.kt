package expo.modules.hushnative

import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Sends alerts to the paired parent phones through Expo's push service.
 * Runs in native code so alerts still go out while the screen is locked.
 */
object AlertSender {
  /** Uploads bytes with a POST (Firebase Storage's simple upload). Blocking; call off the main thread. */
  fun upload(url: String, bytes: ByteArray, contentType: String): Pair<Boolean, String> = try {
    val conn = (URL(url).openConnection() as HttpURLConnection).apply {
      requestMethod = "POST"
      connectTimeout = 15000
      readTimeout = 30000
      doOutput = true
      setRequestProperty("Content-Type", contentType)
      setFixedLengthStreamingMode(bytes.size)
    }
    conn.outputStream.use { it.write(bytes) }
    val code = conn.responseCode
    val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
    conn.disconnect()
    (code in 200..299) to (if (code in 200..299) text else "HTTP $code $text")
  } catch (e: Exception) {
    false to (e.message ?: "Network error")
  }

  private const val URL_PUSH = "https://exp.host/--/api/v2/push/send"

  fun send(tokens: List<String>, body: String, data: Map<String, Any>, onDone: ((Boolean, String) -> Unit)? = null) =
    sendEach(tokens.map { it to body }, data, onDone)

  /** One message per phone, each with its own text (every parent gets their own language). */
  fun sendEach(messagesFor: List<Pair<String, String>>, data: Map<String, Any>, onDone: ((Boolean, String) -> Unit)? = null) {
    if (messagesFor.isEmpty()) { onDone?.invoke(false, "No parent phones are paired yet"); return }
    Thread {
      try {
        val messages = JSONArray()
        for ((token, body) in messagesFor) {
          messages.put(JSONObject().apply {
            put("to", token)
            put("title", "hush")
            put("body", body)
            // Crying (and a stopped monitor) ring like an alarm; the rest are normal notifications.
            val alarm = data["type"] in setOf("cry", "stopped", "test")
            put("sound", if (alarm) "alert.wav" else "default")
            put("priority", "high")
            put("channelId", if (alarm) "baby-alarm-2" else "cry-alerts")
            // iPhones: crying breaks through Focus (needs the time-sensitive entitlement).
            put("interruptionLevel", if (alarm) "time-sensitive" else "active")
            put("data", JSONObject(data))
          })
        }
        val conn = (URL(URL_PUSH).openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"
          connectTimeout = 10000
          readTimeout = 10000
          doOutput = true
          setRequestProperty("Content-Type", "application/json")
          setRequestProperty("Accept", "application/json")
        }
        conn.outputStream.use { it.write(messages.toString().toByteArray()) }
        val code = conn.responseCode
        val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        onDone?.invoke(code in 200..299 && !text.contains("\"status\":\"error\""), text)
      } catch (e: Exception) {
        Log.w("HushCry", "Alert failed", e)
        onDone?.invoke(false, e.message ?: "Network error")
      }
    }.start()
  }
}
