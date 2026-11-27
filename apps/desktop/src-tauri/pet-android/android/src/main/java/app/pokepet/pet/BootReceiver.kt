package app.pokepet.pet

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/** Brings the over-apps pet back after a restart or an update, if it was on. The wallpaper comes back by itself. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Intent.ACTION_BOOT_COMPLETED || intent.action == Intent.ACTION_MY_PACKAGE_REPLACED) {
            OverlayService.sync(context)
        }
    }
}
