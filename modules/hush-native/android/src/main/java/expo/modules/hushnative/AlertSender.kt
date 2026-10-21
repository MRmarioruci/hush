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

  /** A silent message (no notification): room status for the parents' phones. */
  fun sendData(tokens: List<String>, data: Map<String, Any>) {
    if (tokens.isEmpty()) return
    Thread {
      try {
        val messages = JSONArray()
        for (token in tokens) messages.put(JSONObject().apply {
          put("to", token)
          put("priority", "high")
          put("_contentAvailable", true)
          put("data", JSONObject(data).put("_id", System.nanoTime().toString(36)))
        })
        val conn = (URL(URL_PUSH).openConnection() as HttpURLConnection).apply {
          requestMethod = "POST"; connectTimeout = 10000; readTimeout = 10000; doOutput = true
          setRequestProperty("Content-Type", "application/json")
        }
        conn.outputStream.use { it.write(messages.toString().toByteArray()) }
        val code = conn.responseCode
        val text = (if (code < 400) conn.inputStream else conn.errorStream)?.bufferedReader()?.use { it.readText() } ?: ""
        conn.disconnect()
        noteDead(tokens, text)
      } catch (_: Exception) {}
    }.start()
  }

  /** Phones whose push address no longer works (app removed, data cleared): Expo says DeviceNotRegistered. */
  private val dead = java.util.Collections.synchronizedSet(mutableSetOf<String>())

  /** Tickets come back in the order the messages were sent. Dead addresses stop getting alerts at once. */
  fun noteDead(sentTo: List<String>, response: String) {
    try {
      val data = JSONObject(response).optJSONArray("data") ?: return
      for (i in 0 until minOf(data.length(), sentTo.size)) {
        val err = data.optJSONObject(i)?.optJSONObject("details")?.optString("error")
        if (err == "DeviceNotRegistered") {
          dead.add(sentTo[i])
          CryEngine.targets = CryEngine.targets.filter { it["token"] != sentTo[i] }
          Diag.add("push address gone: …${sentTo[i].takeLast(6)}")
        }
      }
    } catch (_: Exception) {}
  }

  /** For the app: dead addresses seen since last asked (it removes those phones from the family). */
  fun takeDead(): List<String> = synchronized(dead) { dead.toList().also { dead.clear() } }

  /** Which notification a message replaces: one per baby's room, its clips, its sleep notes, and tests. */
  fun topicOf(data: Map<String, Any>): String? {
    val from = (data["from"] as? String).orEmpty().takeLast(12).ifEmpty { "room" }
    return when (data["type"]) {
      "cry", "stopped", "battery" -> "hush-room-$from"
      "ack" -> "hush-room-" + (data["room"] as? String).orEmpty().takeLast(12)
      "clip" -> "hush-clip-$from"
      "sleep" -> "hush-sleep-$from"
      "test" -> "hush-test"
      else -> null
    }
  }

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
            // …except crying someone is already on ("I'm on it"): a normal notification then.
            val alarm = data["type"] in setOf("cry", "stopped", "test") && data["quiet"] != true
            put("sound", if (alarm) "alert.wav" else "default")
            put("priority", "high")
            put("channelId", if (alarm) "baby-alarm-3" else "hush-info-2")
            // iPhones: crying breaks through Focus (needs the time-sensitive entitlement).
            put("interruptionLevel", if (alarm) "time-sensitive" else "active")
            // A "Listen" button on crying alerts (registered by the parent's app).
            if (data["type"] == "cry") put("categoryId", "hush-cry")
            put("data", JSONObject(data).put("_id", System.nanoTime().toString(36)))
            // One notification per topic, replaced instead of stacking: "tag" on Android, "collapseId" on iPhones.
            topicOf(data)?.let { put("tag", it); put("collapseId", it) }
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
        noteDead(messagesFor.map { it.first }, text)
        onDone?.invoke(code in 200..299 && !text.contains("\"status\":\"error\""), text)
      } catch (e: Exception) {
        Log.w("HushCry", "Alert failed", e)
        onDone?.invoke(false, e.message ?: "Network error")
      }
    }.start()
  }
}
