package app.pokepet.pet

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.ServiceInfo
import android.content.res.Configuration
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.provider.Settings
import android.util.DisplayMetrics
import android.view.WindowManager
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat

/**
 * The pet over other apps, for people who turn on "Walk over my apps" (off by default).
 *
 * The pet lives in a small floating window that follows it around (PetWindow), so the
 * rest of the screen keeps working as normal.
 *
 * Android only allows this as a foreground service, which shows a quiet notification.
 */
class OverlayService : Service() {
    private lateinit var wm: WindowManager
    private lateinit var scene: PetScene
    private lateinit var window: PetWindow
    private val loop = FrameLoop(::step)
    private var stageWidth = 0f
    private var counting = false

    /** Stop everything while the screen is off; pick up again when it comes back on. */
    private val screenReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            when (intent.action) {
                Intent.ACTION_SCREEN_OFF -> pause()
                Intent.ACTION_SCREEN_ON -> resume()
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        startInForeground()
        if (!Settings.canDrawOverlays(this)) {
            stopSelf()
            return
        }
        wm = getSystemService(Context.WINDOW_SERVICE) as WindowManager
        scene = PetScene(this, "overlay", resources.displayMetrics.density)
        window = PetWindow(this, scene)
        setUpStage()
        window.show(stageWidth)
        registerReceiver(screenReceiver, IntentFilter().apply {
            addAction(Intent.ACTION_SCREEN_OFF)
            addAction(Intent.ACTION_SCREEN_ON)
        })
        val power = getSystemService(Context.POWER_SERVICE) as PowerManager
        if (power.isInteractive) resume()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onDestroy() {
        if (::window.isInitialized) {
            pause()
            unregisterReceiver(screenReceiver)
            window.hide()
            scene.release()
        }
        super.onDestroy()
    }

    override fun onConfigurationChanged(newConfig: Configuration) {
        super.onConfigurationChanged(newConfig)
        if (::window.isInitialized) setUpStage()
    }

    private fun resume() = loop.start()

    private fun pause() {
        loop.stop()
        setCounting(false)
    }

    private fun setCounting(on: Boolean) {
        if (on == counting) return
        counting = on
        if (on) scene.start() else scene.stop()
    }

    /** The stage is the whole screen; the ground is just above the navigation bar. */
    private fun setUpStage() {
        val (w, h) = screenSize()
        val navId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
        val nav = if (navId > 0) resources.getDimensionPixelSize(navId) else 0
        stageWidth = w.toFloat()
        scene.setStage(stageWidth, (h - nav).toFloat(), h.toFloat())
    }

    private fun screenSize(): Pair<Int, Int> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val b = wm.currentWindowMetrics.bounds
            return b.width() to b.height()
        }
        val m = DisplayMetrics()
        @Suppress("DEPRECATION")
        wm.defaultDisplay.getRealMetrics(m)
        return m.widthPixels to m.heightPixels
    }

    private fun step(dt: Long): Boolean {
        if (!Prefs.overAppsActive(this)) {
            // Turned off (or the permission was taken away) while we weren't looking.
            stopSelf()
            return false
        }
        scene.update(dt)
        setCounting(scene.hasPet)
        if (!window.isShowing) window.show(stageWidth)
        window.frame(stageWidth)
        return scene.moving
    }

    private fun startInForeground() {
        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            manager.createNotificationChannel(
                NotificationChannel(CHANNEL, getString(R.string.pokepet_overlay_channel), NotificationManager.IMPORTANCE_MIN),
            )
        }
        val open = packageManager.getLaunchIntentForPackage(packageName)?.let {
            PendingIntent.getActivity(this, 0, it, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
        }
        val notification: Notification = NotificationCompat.Builder(this, CHANNEL)
            .setSmallIcon(R.drawable.pokepet_notification)
            .setContentTitle(getString(R.string.pokepet_overlay_notification))
            .setContentText(getString(R.string.pokepet_overlay_notification_text))
            .setContentIntent(open)
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build()
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE)
        } else {
            startForeground(NOTIFICATION_ID, notification)
        }
    }

    companion object {
        private const val CHANNEL = "pokepet-overlay"
        private const val NOTIFICATION_ID = 7001

        /** Starts or stops the over-apps pet to match the setting. */
        fun sync(ctx: Context) {
            val intent = Intent(ctx, OverlayService::class.java)
            if (Prefs.overAppsActive(ctx)) ContextCompat.startForegroundService(ctx, intent) else ctx.stopService(intent)
        }
    }
}
