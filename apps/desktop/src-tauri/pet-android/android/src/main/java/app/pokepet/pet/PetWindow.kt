package app.pokepet.pet

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.graphics.Canvas
import android.graphics.PixelFormat
import android.graphics.RectF
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import kotlin.math.hypot
import kotlin.math.roundToInt

/**
 * A floating window the size of the pet that follows it around, so the pet can be picked
 * up while the rest of the screen keeps working as normal. Used by the over-apps pet and,
 * on the home screen, by the wallpaper (a wallpaper can't take a drag without the launcher
 * also swiping pages or opening the app drawer).
 *
 * Tap it to say hi, drag it to carry it (let go and it drops, or flies if flicked), and
 * long-press it to open PokePet. Needs "Display over other apps".
 */
internal class PetWindow(private val ctx: Context, private val scene: PetScene) {
    private val wm = ctx.getSystemService(Context.WINDOW_SERVICE) as WindowManager
    private val handler = Handler(Looper.getMainLooper())
    private val view = PetView(ctx)
    private val bounds = RectF()
    private var stageWidth = 0f
    private var attached = false
    private val params = WindowManager.LayoutParams(
        1, 1,
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
        else @Suppress("DEPRECATION") WindowManager.LayoutParams.TYPE_PHONE,
        BASE_FLAGS,
        PixelFormat.TRANSLUCENT,
    ).apply { gravity = Gravity.TOP or Gravity.START }

    val isShowing get() = attached

    /** Shows the window (if Android allows it). Returns whether it's showing. */
    fun show(stageWidth: Float): Boolean {
        this.stageWidth = stageWidth
        if (attached) return true
        if (!Settings.canDrawOverlays(ctx)) return false
        return try {
            place(force = true)
            wm.addView(view, params)
            attached = true
            true
        } catch (e: Exception) {
            false
        }
    }

    fun hide() {
        if (!attached) return
        attached = false
        view.cancelGesture()
        try {
            wm.removeViewImmediate(view)
        } catch (e: Exception) {
            // Already gone (the permission was taken away, say).
        }
    }

    /** Call once per frame after the scene moved: keeps the window on the pet and redraws it. */
    fun frame(stageWidth: Float) {
        this.stageWidth = stageWidth
        if (!attached) return
        place(force = false)
        view.invalidate()
    }

    /** Moves and sizes the window to cover just the pet (and its speech bubble while talking). */
    private fun place(force: Boolean) {
        val touchable = scene.hasPet
        if (touchable) scene.bounds(bounds, stageWidth) else bounds.set(0f, 0f, 1f, 1f)
        val x = bounds.left.roundToInt()
        val y = bounds.top.roundToInt()
        val w = maxOf(1, bounds.width().roundToInt())
        val h = maxOf(1, bounds.height().roundToInt())
        val flags = if (touchable) BASE_FLAGS else BASE_FLAGS or WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE
        if (!force && params.x == x && params.y == y && params.width == w && params.height == h && params.flags == flags) return
        params.x = x
        params.y = y
        params.width = w
        params.height = h
        params.flags = flags
        if (attached) {
            try {
                wm.updateViewLayout(view, params)
            } catch (e: Exception) {
                attached = false
            }
        }
    }

    private fun openApp() {
        ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.let {
            ctx.startActivity(it.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
    }

    /** Draws the scene shifted so the window's corner lines up with the pet. Touches use screen coordinates. */
    @SuppressLint("ViewConstructor")
    private inner class PetView(context: Context) : View(context) {
        private var pressX = 0f
        private var pressY = 0f
        private var pressed = false
        private var dragging = false
        private val dragThreshold = 8 * resources.displayMetrics.density
        private val longPress = Runnable {
            if (pressed && !dragging) {
                pressed = false
                openApp()
            }
        }

        fun cancelGesture() {
            handler.removeCallbacks(longPress)
            if (dragging) scene.brainOrNull?.drop(SystemClock.uptimeMillis())
            pressed = false
            dragging = false
        }

        override fun onDraw(canvas: Canvas) {
            canvas.save()
            canvas.translate(-params.x.toFloat(), -params.y.toFloat())
            scene.draw(canvas, stageWidth)
            canvas.restore()
        }

        @SuppressLint("ClickableViewAccessibility")
        override fun onTouchEvent(e: MotionEvent): Boolean {
            val brain = scene.brainOrNull ?: return false
            when (e.actionMasked) {
                MotionEvent.ACTION_DOWN -> {
                    pressX = e.rawX
                    pressY = e.rawY
                    pressed = true
                    dragging = false
                    handler.postDelayed(longPress, LONG_PRESS_MS)
                }
                MotionEvent.ACTION_MOVE -> {
                    if (!pressed) return true
                    if (!dragging && hypot(e.rawX - pressX, e.rawY - pressY) > dragThreshold) {
                        dragging = true
                        handler.removeCallbacks(longPress)
                        brain.pickUp(pressX, pressY, e.eventTime)
                    }
                    if (dragging) brain.carry(e.rawX, e.rawY, e.eventTime)
                }
                MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
                    handler.removeCallbacks(longPress)
                    if (pressed) {
                        if (dragging) brain.drop(e.eventTime) else if (e.actionMasked == MotionEvent.ACTION_UP) brain.poke()
                    }
                    pressed = false
                    dragging = false
                }
            }
            return true
        }
    }

    private companion object {
        const val LONG_PRESS_MS = 600L
        const val BASE_FLAGS = WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
            WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN or
            WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS
    }
}
