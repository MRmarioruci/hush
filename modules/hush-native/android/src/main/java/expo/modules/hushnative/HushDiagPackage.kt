package expo.modules.hushnative

import android.app.Activity
import android.app.ActivityManager
import android.app.Application
import android.content.Context
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import expo.modules.core.BasePackage
import expo.modules.core.interfaces.ApplicationLifecycleListener
import expo.modules.core.interfaces.ReactActivityLifecycleListener
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * A small diagnostics log (no personal data) for problems that can't be seen from outside:
 * when the app opened, whether the screen ever got past the splash, and why Android ended
 * the app last time. Shared from Settings (long-press the version).
 */
object Diag {
  private const val NAME = "hush-diag.txt"
  private const val MAX = 120
  private var file: File? = null
  private val fmt = SimpleDateFormat("MM-dd HH:mm:ss", Locale.US)

  fun init(context: Context) {
    if (file == null) file = File(context.applicationContext.filesDir, NAME)
  }

  @Synchronized
  fun add(line: String) {
    val f = file ?: return
    try {
      val lines = (if (f.exists()) f.readLines() else emptyList()).takeLast(MAX - 1) + "${fmt.format(Date())} $line"
      f.writeText(lines.joinToString("\n") + "\n")
    } catch (_: Exception) {}
  }

  /** Everything worth knowing, as text to share. */
  fun report(context: Context): String {
    val sb = StringBuilder()
    sb.append("Android ${Build.VERSION.RELEASE} (SDK ${Build.VERSION.SDK_INT}) · ${Build.MANUFACTURER} ${Build.MODEL}\n\n")
    if (Build.VERSION.SDK_INT >= 30) {
      sb.append("Last exits:\n")
      try {
        val am = context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        for (e in am.getHistoricalProcessExitReasons(null, 0, 6)) {
          sb.append("- ${fmt.format(Date(e.timestamp))} reason=${e.reason} status=${e.status} importance=${e.importance} ${e.description ?: ""}\n")
          if (e.reason == android.app.ApplicationExitInfo.REASON_ANR) {
            val trace = runCatching { e.traceInputStream?.bufferedReader()?.use { it.readText() } }.getOrNull()
            if (trace != null) {
              // The main thread's stack is what matters.
              val i = trace.indexOf("\"main\"")
              sb.append(trace.substring(maxOf(0, i), minOf(trace.length, maxOf(0, i) + 4000))).append("\n")
            }
          }
        }
      } catch (ex: Exception) { sb.append("(unavailable: ${ex.message})\n") }
      sb.append("\n")
    }
    sb.append("Log:\n")
    try { file?.takeIf { it.exists() }?.let { sb.append(it.readText()) } } catch (_: Exception) {}
    return sb.toString()
  }

  /* ---------- the splash screen watchdog ---------- */

  private fun splashKept(): Boolean? = runCatching {
    val c = Class.forName("expo.modules.splashscreen.SplashScreenManager")
    val f = c.getDeclaredField("keepSplashScreenOnScreen").apply { isAccessible = true }
    f.getBoolean(c.getDeclaredField("INSTANCE").get(null))
  }.getOrNull()

  private fun hideSplash() = runCatching {
    val c = Class.forName("expo.modules.splashscreen.SplashScreenManager")
    c.getMethod("hide").invoke(c.getDeclaredField("INSTANCE").get(null))
  }.isSuccess

  /** The React host's state, read by reflection (this module doesn't link React Native). */
  fun hostState(activity: Activity): String = runCatching {
    val host = activity.application.javaClass.getMethod("getReactHost").invoke(activity.application) ?: return@runCatching "host=null"
    val state = host.javaClass.getMethod("getLifecycleState").invoke(host)
    val ctx = host.javaClass.getMethod("getCurrentReactContext").invoke(host)
    "host=$state context=${ctx != null}"
  }.getOrDefault("host=?")

  /** Opening hush: if the splash is still up after a few seconds, note why and take it down. */
  fun watch(activity: Activity, what: String) {
    add("$what ${hostState(activity)} splash=${splashKept()}")
    Handler(Looper.getMainLooper()).postDelayed({
      if (activity.isFinishing || activity.isDestroyed) return@postDelayed
      if (splashKept() == true) {
        add("splash stuck after 6s ${hostState(activity)} → hide=${hideSplash()}")
      }
    }, 6000)
  }
}

class HushDiagPackage : BasePackage() {
  override fun createApplicationLifecycleListeners(context: Context?): List<ApplicationLifecycleListener> =
    listOf(object : ApplicationLifecycleListener {
      override fun onCreate(application: Application?) {
        application ?: return
        Diag.init(application)
        Diag.add("process start")
      }
    })

  override fun createReactActivityLifecycleListeners(activityContext: Context?): List<ReactActivityLifecycleListener> =
    listOf(object : ReactActivityLifecycleListener {
      override fun onCreate(activity: Activity?, savedInstanceState: Bundle?) {
        activity ?: return
        Diag.init(activity)
        Diag.watch(activity, if (savedInstanceState != null) "activity recreated" else "activity created")
      }
      override fun onResume(activity: Activity?) { activity?.let { Diag.add("resume ${Diag.hostState(it)}") } }
      override fun onPause(activity: Activity?) { Diag.add("pause") }
      override fun onDestroy(activity: Activity?) { Diag.add("activity destroyed finishing=${activity?.isFinishing}") }
    })
}
