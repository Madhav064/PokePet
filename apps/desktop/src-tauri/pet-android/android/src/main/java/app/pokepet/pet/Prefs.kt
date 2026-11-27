package app.pokepet.pet

import android.content.Context
import android.content.SharedPreferences
import android.provider.Settings
import java.io.File

/** Settings shared by the app, the wallpaper pet and the over-apps pet. */
internal object Prefs {
    private const val NAME = "pokepet_pet"

    /** Folder where the app keeps collection.json. The app sets it on every start. */
    const val DATA_DIR = "dataDir"

    /** The user turned on "Walk over my apps". */
    const val OVER_APPS = "overApps"

    /** Bumped whenever the wallpaper background changes, so the wallpaper reloads it. */
    const val BACKGROUND_VERSION = "backgroundVersion"

    fun of(ctx: Context): SharedPreferences = ctx.getSharedPreferences(NAME, Context.MODE_PRIVATE)

    fun dataDir(ctx: Context): File? = of(ctx).getString(DATA_DIR, null)?.let(::File)

    fun overAppsWanted(ctx: Context): Boolean = of(ctx).getBoolean(OVER_APPS, false)

    /** "Walk over my apps" is on, and Android still lets us draw over other apps. */
    fun overAppsActive(ctx: Context): Boolean = overAppsWanted(ctx) && Settings.canDrawOverlays(ctx)

    /** The photo the user picked for behind the pet on the home screen, if any. */
    fun backgroundFile(ctx: Context): File = File(ctx.filesDir, "wallpaper-background.jpg")
}
