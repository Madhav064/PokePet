package app.pokepet.pet

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffColorFilter
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.Typeface
import android.os.SystemClock

/**
 * One pet on a stage: which pet it is (kept in step with the app every second), what it
 * does (PetBrain), how it looks (frames from its spritesheet), and the evolution flash and
 * speech bubble. The wallpaper and the over-apps pet each own one and only differ in
 * where they draw it and how touches arrive.
 *
 * Stage coordinates are px from the top-left of the screen. The pet stands on the ground
 * line and can be carried down to the floor line (the bottom of the screen).
 */
internal class PetScene(
    private val ctx: Context,
    /** "wallpaper" or "overlay": for the shared clock and to remember where the pet stood. */
    private val source: String,
    density: Float,
) {
    val pack = Pack.get(ctx)
    private val atlas = pack.atlas
    val petHeight = PET_HEIGHT_DP * density
    val petWidth = petHeight * atlas.cellWidth / atlas.cellHeight

    private var brain: PetBrain? = null
    private var species: String? = null
    private var sheet: Bitmap? = null
    private var shownAnimation = ""
    private var animationStart = 0L
    private var lastRefresh = 0L
    private var lastSavedX = 0L

    private var flashStart = 0L
    private var bubbleText: String? = null
    private var bubbleUntil = 0L

    private val spritePaint = Paint().apply { isFilterBitmap = false; isAntiAlias = false }
    private val flashPaint = Paint().apply {
        isFilterBitmap = false
        colorFilter = PorterDuffColorFilter(Color.WHITE, PorterDuff.Mode.SRC_IN)
    }
    private val bubblePaint = Paint(Paint.ANTI_ALIAS_FLAG).apply { color = Color.WHITE }
    private val bubbleBorder = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.argb(60, 0, 0, 0)
        style = Paint.Style.STROKE
        strokeWidth = density
    }
    private val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
        color = Color.rgb(30, 27, 46)
        textSize = 14 * density
        typeface = Typeface.DEFAULT_BOLD
    }
    private val bubblePad = 8 * density
    private val src = Rect()
    private val dst = RectF()

    val hasPet get() = sheet != null && brain != null
    val brainOrNull get() = brain

    /** The stage (screen width, where the ground is, and the screen's bottom) was set up or changed. */
    fun setStage(width: Float, groundY: Float, floorY: Float = groundY) {
        val b = brain
        if (b != null) return b.resize(width, groundY, floorY)
        val saved = Prefs.of(ctx).getFloat("petX_$source", Float.NaN)
        brain = PetBrain(atlas, petWidth, petHeight, width, groundY, floorY, startX = saved.takeIf { !it.isNaN() })
    }

    /** Something is in motion (the pet, its evolution flash), so redraw at full speed. */
    val moving get() = brain?.moving == true || SystemClock.uptimeMillis() - flashStart < FLASH_MS

    fun start() = PetState.show(ctx, source)

    fun stop() {
        PetState.hide(ctx, source)
        brain?.let { Prefs.of(ctx).edit().putFloat("petX_$source", it.x).apply() }
    }

    /** Advance by `dt` ms. Once a second, also catch up with the app and evolve if it's time. */
    fun update(dt: Long) {
        val now = SystemClock.uptimeMillis()
        if (now - lastRefresh >= 1000 || species == null && now - lastRefresh >= 250) {
            lastRefresh = now
            refresh()
        }
        val b = brain ?: return
        b.update(dt)
        if (b.animation != shownAnimation) {
            shownAnimation = b.animation
            animationStart = now
        }
        if (now - lastSavedX > 5000 && b.mode == PetBrain.Mode.IDLE) {
            lastSavedX = now
            Prefs.of(ctx).edit().putFloat("petX_$source", b.x).apply()
        }
    }

    private fun refresh() {
        PetState.tick(ctx)
        val evolution = PetState.maybeEvolve(ctx, pack)
        val next = PetState.shownPet(ctx)?.species
        if (next != species) {
            species = next
            sheet?.recycle()
            sheet = next?.let { pack.spritesheet(ctx, it) }
            if (evolution == null) brain?.poke() // a little hello when a pet arrives
        }
        if (evolution != null) {
            flashStart = SystemClock.uptimeMillis()
            say("${pack.nameOf(evolution.from)} evolved into ${pack.nameOf(evolution.to)}!")
            brain?.celebrate()
        }
    }

    private fun say(text: String) {
        bubbleText = text
        bubbleUntil = SystemClock.uptimeMillis() + 6000
    }

    /** Whether a speech bubble is showing (the over-apps window grows to fit it). */
    val talking get() = bubbleText != null && SystemClock.uptimeMillis() < bubbleUntil

    /** What gets drawn, in stage coordinates: the pet, plus its bubble while talking. */
    fun bounds(out: RectF, stageWidth: Float): RectF {
        val b = brain ?: return out.apply { setEmpty() }
        out.set(b.x, b.y, b.x + petWidth, b.y + petHeight)
        if (talking) out.union(bubbleRect(b, stageWidth))
        return out
    }

    private fun bubbleRect(b: PetBrain, stageWidth: Float): RectF {
        val w = textPaint.measureText(bubbleText ?: "") + bubblePad * 2
        val h = textPaint.textSize + bubblePad * 2
        val left = (b.x + petWidth / 2 - w / 2).coerceIn(0f, maxOf(0f, stageWidth - w))
        val top = b.y + petHeight * 0.1f - h
        return RectF(left, top, left + w, top + h)
    }

    /** Draws the pet. `canvas` is in stage coordinates (translate it first if needed). */
    fun draw(canvas: Canvas, stageWidth: Float) {
        val b = brain ?: return
        val bmp = sheet ?: return
        val anim = atlas.animation(b.animation)
        val now = SystemClock.uptimeMillis()
        val elapsed = (now - animationStart) / anim.frameMs
        val frame = if (anim.once) minOf(elapsed, anim.frames - 1L).toInt() else (elapsed % anim.frames).toInt()
        src.set(
            frame * atlas.cellWidth, anim.row * atlas.cellHeight,
            (frame + 1) * atlas.cellWidth, (anim.row + 1) * atlas.cellHeight,
        )
        dst.set(b.x, b.y, b.x + petWidth, b.y + petHeight)

        canvas.save()
        if (anim.mirror) canvas.scale(-1f, 1f, dst.centerX(), dst.centerY())
        canvas.drawBitmap(bmp, src, dst, spritePaint)
        val flashAge = now - flashStart
        if (flashAge in 0 until FLASH_MS) {
            flashPaint.alpha = (255 * (1 - flashAge.toFloat() / FLASH_MS)).toInt()
            canvas.drawBitmap(bmp, src, dst, flashPaint)
        }
        canvas.restore()

        if (talking) {
            val r = bubbleRect(b, stageWidth)
            val radius = r.height() / 2
            canvas.drawRoundRect(r, radius, radius, bubblePaint)
            canvas.drawRoundRect(r, radius, radius, bubbleBorder)
            canvas.drawText(bubbleText!!, r.left + bubblePad, r.bottom - bubblePad - textPaint.descent() / 2, textPaint)
        }
    }

    fun release() {
        sheet?.recycle()
        sheet = null
    }

    private companion object {
        /** How tall the pet is on a phone (the desktop pet is 104 px). */
        const val PET_HEIGHT_DP = 100f
        const val FLASH_MS = 1200L
    }
}
