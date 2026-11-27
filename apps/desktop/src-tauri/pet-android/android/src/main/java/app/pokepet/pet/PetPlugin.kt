package app.pokepet.pet

import android.app.Activity
import android.app.WallpaperManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.ImageDecoder
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import android.provider.Settings
import androidx.activity.result.ActivityResult
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import kotlin.math.max

@InvokeArg
class ConfigureArgs {
    lateinit var dataDir: String
}

@InvokeArg
class UpdateArgs {
    lateinit var url: String
}

@InvokeArg
class OverAppsArgs {
    var on: Boolean = false
}

/**
 * What the PokePet app (its Rust side, see src-tauri/src/phone.rs) can ask of the phone:
 * set the pet as the wallpaper, turn "Walk over my apps" on or off, and pick the photo
 * behind the pet. Every command resolves with the current status.
 */
@TauriPlugin
class PetPlugin(private val activity: Activity) : Plugin(activity) {
    private val ctx: Context get() = activity.applicationContext

    private fun currentStatus(): JSObject {
        val wallpaper = WallpaperManager.getInstance(ctx).wallpaperInfo
        return JSObject().apply {
            put("wallpaperSet", wallpaper?.packageName == ctx.packageName)
            put("overApps", Prefs.overAppsActive(ctx))
            put("canPickUp", Settings.canDrawOverlays(ctx))
            put("hasBackground", Prefs.backgroundFile(ctx).exists())
        }
    }

    /** Called by the app on every start: where collection.json lives. */
    @Command
    fun configure(invoke: Invoke) {
        val args = invoke.parseArgs(ConfigureArgs::class.java)
        Prefs.of(ctx).edit().putString(Prefs.DATA_DIR, args.dataDir).apply()
        OverlayService.sync(ctx)
        invoke.resolve(currentStatus())
    }

    @Command
    fun status(invoke: Invoke) = invoke.resolve(currentStatus())

    /**
     * The space taken by the status bar and the navigation bar, in CSS px. The app is drawn
     * edge to edge and the WebView doesn't report these to CSS, so the page asks.
     */
    @Command
    fun insets(invoke: Invoke) {
        activity.runOnUiThread {
            val root = ViewCompat.getRootWindowInsets(activity.window.decorView)
            val bars = root?.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
            val density = activity.resources.displayMetrics.density
            invoke.resolve(JSObject().apply {
                put("top", (bars?.top ?: 0) / density)
                put("bottom", (bars?.bottom ?: 0) / density)
            })
        }
    }

    /** Opens Android's wallpaper preview for the pet, where the user taps "Set wallpaper". */
    @Command
    fun setWallpaper(invoke: Invoke) {
        val intent = Intent(WallpaperManager.ACTION_CHANGE_LIVE_WALLPAPER).putExtra(
            WallpaperManager.EXTRA_LIVE_WALLPAPER_COMPONENT,
            ComponentName(ctx, PetWallpaperService::class.java),
        )
        try {
            startActivityForResult(invoke, intent, "afterSettingsScreen")
        } catch (e: Exception) {
            // Some phones don't support previewing one wallpaper: open the general picker.
            startActivityForResult(invoke, Intent(WallpaperManager.ACTION_LIVE_WALLPAPER_CHOOSER), "afterSettingsScreen")
        }
    }

    @Command
    fun setOverApps(invoke: Invoke) {
        val on = invoke.parseArgs(OverAppsArgs::class.java).on
        Prefs.of(ctx).edit().putBoolean(Prefs.OVER_APPS, on).apply()
        if (on && !Settings.canDrawOverlays(ctx)) {
            // Android's own screen for "Display over other apps"; we check the answer when they come back.
            val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
            startActivityForResult(invoke, intent, "afterSettingsScreen")
            return
        }
        OverlayService.sync(ctx)
        invoke.resolve(currentStatus())
    }

    /**
     * Lets the pet be picked up on the home screen: it then floats in a small window there,
     * which needs "Display over other apps". Opens Android's screen for that.
     */
    @Command
    fun allowPickUp(invoke: Invoke) {
        if (Settings.canDrawOverlays(ctx)) return invoke.resolve(currentStatus())
        val intent = Intent(Settings.ACTION_MANAGE_OVERLAY_PERMISSION, Uri.parse("package:${ctx.packageName}"))
        startActivityForResult(invoke, intent, "afterSettingsScreen")
    }

    @ActivityCallback
    fun afterSettingsScreen(invoke: Invoke, result: ActivityResult) {
        // Turning "Walk over my apps" on but not allowing it leaves it off.
        if (!Settings.canDrawOverlays(ctx)) Prefs.of(ctx).edit().putBoolean(Prefs.OVER_APPS, false).apply()
        OverlayService.sync(ctx)
        invoke.resolve(currentStatus())
    }

    /** The download link of the update being installed, while Android asks for permission. */
    private var pendingUpdate: String? = null

    /**
     * Downloads a new PokePet APK and opens Android's install screen. The first time, Android
     * asks the user to allow PokePet to install apps; we carry on when they come back.
     */
    @Command
    fun installUpdate(invoke: Invoke) {
        val url = invoke.parseArgs(UpdateArgs::class.java).url
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.packageManager.canRequestPackageInstalls()) {
            pendingUpdate = url
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${ctx.packageName}"))
            startActivityForResult(invoke, intent, "afterInstallPermission")
            return
        }
        downloadAndInstall(invoke, url)
    }

    @ActivityCallback
    fun afterInstallPermission(invoke: Invoke, result: ActivityResult) {
        val url = pendingUpdate
        pendingUpdate = null
        if (url == null || (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !ctx.packageManager.canRequestPackageInstalls())) {
            return invoke.reject("PokePet wasn't allowed to install the update.")
        }
        downloadAndInstall(invoke, url)
    }

    private fun downloadAndInstall(invoke: Invoke, url: String) {
        Thread {
            try {
                val apk = Updates.download(ctx, url)
                activity.runOnUiThread {
                    Updates.install(activity, apk)
                    invoke.resolve()
                }
            } catch (e: Exception) {
                invoke.reject("Couldn't download the update. Check your connection and try again.")
            }
        }.start()
    }

    /** Lets the user pick a photo to show behind the pet. No storage permission needed. */
    @Command
    fun pickBackground(invoke: Invoke) {
        val intent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Intent(MediaStore.ACTION_PICK_IMAGES).setType("image/*")
        } else {
            Intent(Intent.ACTION_GET_CONTENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE)
        }
        startActivityForResult(invoke, intent, "afterPhotoPicked")
    }

    @ActivityCallback
    fun afterPhotoPicked(invoke: Invoke, result: ActivityResult) {
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) return invoke.resolve(currentStatus())
        Thread {
            try {
                saveBackground(uri)
                invoke.resolve(currentStatus())
            } catch (e: Exception) {
                invoke.reject("Couldn't use that photo.")
            }
        }.start()
    }

    @Command
    fun clearBackground(invoke: Invoke) {
        Prefs.backgroundFile(ctx).delete()
        bumpBackground()
        invoke.resolve(currentStatus())
    }

    /** Copies the photo into the app, shrunk to about screen size, so it still works if the original is deleted. */
    private fun saveBackground(uri: Uri) {
        val metrics = ctx.resources.displayMetrics
        val longest = max(metrics.widthPixels, metrics.heightPixels)
        val bitmap: Bitmap = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // ImageDecoder also turns camera photos the right way up.
            ImageDecoder.decodeBitmap(ImageDecoder.createSource(ctx.contentResolver, uri)) { decoder, info, _ ->
                val scale = longest.toFloat() / max(info.size.width, info.size.height)
                if (scale < 1f) decoder.setTargetSize((info.size.width * scale).toInt(), (info.size.height * scale).toInt())
                decoder.allocator = ImageDecoder.ALLOCATOR_SOFTWARE
            }
        } else {
            val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
            ctx.contentResolver.openInputStream(uri)?.use { BitmapFactory.decodeStream(it, null, bounds) }
            var sample = 1
            while (max(bounds.outWidth, bounds.outHeight) / (sample * 2) >= longest) sample *= 2
            ctx.contentResolver.openInputStream(uri)?.use {
                BitmapFactory.decodeStream(it, null, BitmapFactory.Options().apply { inSampleSize = sample })
            } ?: error("unreadable photo")
        }
        Prefs.backgroundFile(ctx).outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 90, it) }
        bitmap.recycle()
        bumpBackground()
    }

    private fun bumpBackground() {
        val prefs = Prefs.of(ctx)
        prefs.edit().putInt(Prefs.BACKGROUND_VERSION, prefs.getInt(Prefs.BACKGROUND_VERSION, 0) + 1).apply()
    }
}
