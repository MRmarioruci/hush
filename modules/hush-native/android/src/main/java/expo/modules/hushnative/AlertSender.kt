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
  private const val URL_PUSH = "https://exp.host/--/api/v2/push/send"

  fun send(tokens: List<String>, body: String, data: Map<String, Any>, onDone: ((Boolean, String) -> Unit)? = null) {
    if (tokens.isEmpty()) { onDone?.invoke(false, "No parent phones are paired yet"); return }
    Thread {
      try {
        val messages = JSONArray()
        for (token in tokens) {
          messages.put(JSONObject().apply {
            put("to", token)
            put("title", "hush")
            put("body", body)
            put("sound", "default")
            put("priority", "high")
            put("channelId", "cry-alerts")
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
