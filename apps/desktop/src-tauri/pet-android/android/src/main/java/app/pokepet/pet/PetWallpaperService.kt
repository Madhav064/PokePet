package app.pokepet.pet

import android.app.KeyguardManager
import android.app.WallpaperManager
import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Rect
import android.graphics.Shader
import android.os.Build
import android.os.Bundle
import android.provider.Settings
import android.service.wallpaper.WallpaperService
import android.view.SurfaceHolder

/**
 * The pet on the home screen and lock screen. Being a live wallpaper, Android only
 * shows it there, so the pet is out of the way the moment you open an app, and it's
 * paused (no drawing, no battery) whenever it's hidden.
 *
 * It stands just above the dock and strolls around there. Tap it to say hi; tap an empty
 * spot of the home screen to call it over. If PokePet may "Display over other apps", the
 * pet on the home screen is drawn in a small floating window instead (PetWindow), so it
 * can also be picked up and dropped anywhere; the wallpaper then shows just the backdrop.
 */
class PetWallpaperService : WallpaperService() {
    override fun onCreateEngine(): Engine = PetEngine()

    private inner class PetEngine : Engine(), SharedPreferences.OnSharedPreferenceChangeListener {
        private val ctx: Context get() = this@PetWallpaperService
        private val density = resources.displayMetrics.density
        private lateinit var scene: PetScene
        private var window: PetWindow? = null
        private val loop = FrameLoop(::frame)
        private var width = 0
        private var height = 0
        private var background: Bitmap? = null
        private var visible = false
        private var counting = false
        /** The wallpaper needs drawing even if nothing moved (new backdrop, the pet left it). */
        private var dirty = true
        private val keyguard = getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager

        override fun onCreate(surfaceHolder: SurfaceHolder) {
            super.onCreate(surfaceHolder)
            scene = PetScene(ctx, "wallpaper", density)
            // The preview in the wallpaper picker stays a plain picture.
            if (!isPreview) window = PetWindow(ctx, scene)
            Prefs.of(ctx).registerOnSharedPreferenceChangeListener(this)
        }

        override fun onDestroy() {
            loop.stop()
            window?.hide()
            setCounting(false)
            Prefs.of(ctx).unregisterOnSharedPreferenceChangeListener(this)
            scene.release()
            background?.recycle()
            super.onDestroy()
        }

        override fun onSurfaceChanged(holder: SurfaceHolder, format: Int, w: Int, h: Int) {
            super.onSurfaceChanged(holder, format, w, h)
            width = w
            height = h
            rebuildBackground()
            scene.setStage(w.toFloat(), groundY(), h.toFloat())
            dirty = true
            frame(0)
        }

        override fun onSurfaceDestroyed(holder: SurfaceHolder) {
            visible = false
            loop.stop()
            window?.hide()
            setCounting(false)
            super.onSurfaceDestroyed(holder)
        }

        override fun onVisibilityChanged(visible: Boolean) {
            this.visible = visible
            if (visible) {
                dirty = true
                loop.start()
            } else {
                // An app opened (or the screen went off): the floating pet goes too.
                loop.stop()
                window?.hide()
                setCounting(false)
            }
        }

        override fun onSharedPreferenceChanged(prefs: SharedPreferences, key: String?) {
            if (key == Prefs.BACKGROUND_VERSION) {
                rebuildBackground()
                dirty = true
                frame(0)
            }
        }

        /** Launchers send a tap command when you tap an empty part of the home screen. */
        override fun onCommand(action: String?, x: Int, y: Int, z: Int, extras: Bundle?, resultRequested: Boolean): Bundle? {
            if (action == WallpaperManager.COMMAND_TAP && (drawPetHere() || floatPet())) {
                val brain = scene.brainOrNull
                if (brain != null) {
                    if (brain.contains(x.toFloat(), y.toFloat(), inset = 0f)) brain.poke() else brain.goTo(x.toFloat())
                }
            }
            return super.onCommand(action, x, y, z, extras, resultRequested)
        }

        /**
         * On the home screen (not the lock screen, where Android hides floating windows), the
         * pet floats if it may, so it can be picked up. With "Walk over my apps" on, the
         * over-apps pet already covers the home screen, so this one stays out of the way.
         */
        private fun floatPet() = window != null && !keyguard.isKeyguardLocked && !Prefs.overAppsActive(ctx) &&
            Settings.canDrawOverlays(ctx)

        /** Whether the wallpaper itself draws the pet. */
        private fun drawPetHere() = !floatPet() && (!Prefs.overAppsActive(ctx) || keyguard.isKeyguardLocked)

        /** The wallpaper preview in the system picker never counts towards evolving. */
        private fun setCounting(on: Boolean) {
            if (on == counting) return
            counting = on
            if (on) scene.start() else scene.stop()
        }

        /**
         * The pet stands just above the dock (the bottom row of apps). Launchers put the dock
         * a little above the navigation bar, with a search bar below it on some phones.
         */
        private fun groundY(): Float {
            val navId = resources.getIdentifier("navigation_bar_height", "dimen", "android")
            val nav = if (navId > 0) resources.getDimensionPixelSize(navId) else 0
            return height - nav - DOCK_CLEARANCE_DP * density
        }

        /** One frame: move the pet, then draw it on the wallpaper or in its floating window. Returns whether it moves. */
        private fun frame(dt: Long): Boolean {
            if (width == 0 || height == 0) return false
            val floating = visible && floatPet()
            val drawPet = drawPetHere()
            setCounting(visible && (floating || drawPet) && !isPreview)
            scene.update(dt)

            val w = window
            if (floating && w != null) {
                if (!w.isShowing) {
                    w.show(width.toFloat())
                    dirty = true // the pet has left the wallpaper: redraw it without
                }
                w.frame(width.toFloat())
            } else if (w?.isShowing == true) {
                w.hide()
                dirty = true
            }
            if (dirty || drawPet) drawWallpaper(drawPet && !floating)
            return scene.moving || scene.talking
        }

        private fun drawWallpaper(withPet: Boolean) {
            val holder = surfaceHolder
            val canvas: Canvas = try {
                (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) holder.lockHardwareCanvas() else holder.lockCanvas())
                    ?: return
            } catch (e: Exception) {
                return
            }
            try {
                background?.let { canvas.drawBitmap(it, 0f, 0f, null) }
                if (withPet) scene.draw(canvas, width.toFloat())
                dirty = false
            } finally {
                holder.unlockCanvasAndPost(canvas)
            }
        }

        /** The user's photo (cropped to fill the screen), or PokePet's own dark backdrop. */
        private fun rebuildBackground() {
            if (width == 0 || height == 0) return
            val out = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
            val canvas = Canvas(out)
            val photo = Prefs.backgroundFile(ctx).takeIf { it.exists() }?.let { BitmapFactory.decodeFile(it.path) }
            if (photo != null) {
                val scale = maxOf(width.toFloat() / photo.width, height.toFloat() / photo.height)
                val w = (width / scale).toInt()
                val h = (height / scale).toInt()
                val left = (photo.width - w) / 2
                val top = (photo.height - h) / 2
                canvas.drawBitmap(photo, Rect(left, top, left + w, top + h), Rect(0, 0, width, height), Paint(Paint.FILTER_BITMAP_FLAG))
                photo.recycle()
            } else {
                val sky = Paint().apply {
                    shader = LinearGradient(0f, 0f, 0f, height.toFloat(), SKY_TOP, SKY_BOTTOM, Shader.TileMode.CLAMP)
                }
                canvas.drawRect(0f, 0f, width.toFloat(), height.toFloat(), sky)
            }
            background?.recycle()
            background = out
        }
    }

    private companion object {
        /** How far above the navigation bar the pet's feet are: just clear of the dock's icons. */
        const val DOCK_CLEARANCE_DP = 166f
        const val SKY_TOP = 0xFF20242C.toInt() // PokePet's dark theme (packages/ui/src/theme.css)
        const val SKY_BOTTOM = 0xFF0E1014.toInt()
    }
}
