package app.pokepet.pet

import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sign
import kotlin.math.sqrt
import kotlin.random.Random

/**
 * The pet's "brain" on the phone: what it does and where it is. Based on the desktop pet's
 * behaviour (apps/desktop/src/overlay/behaviour.ts), minus the mouse-only parts, plus a
 * casual stroll now and then so a phone's home screen feels alive.
 *
 * Positions are in px: (x, y) is the pet's top-left on a stage `stageWidth` wide. The pet
 * stands with its feet on `groundY`; it can be carried anywhere down to `floorY` (the
 * bottom of the screen) and drops (or hops back up) to the ground when let go.
 */
internal class PetBrain(
    private val atlas: Atlas,
    private val petWidth: Float,
    private val petHeight: Float,
    private var stageWidth: Float,
    private var groundLine: Float,
    private var floorLine: Float = groundLine,
    startX: Float? = null,
) {
    enum class Mode { IDLE, REACT, WALK, HELD, FALL, LAND }

    var x = 0f
        private set
    var y = 0f
        private set
    var mode = Mode.IDLE
        private set
    var animation = "idle"
        private set

    private var vx = 0f
    private var vy = 0f
    private var timeLeft = 0L
    private var targetX = 0f
    private var walkSpeed = 0f
    /** Walking because it was called over (waves on arrival) rather than strolling. */
    private var called = false
    private var grabDx = 0f
    private var grabDy = 0f
    // Where the finger was recently, to throw the pet with the finger's speed.
    private var lastCarryX = 0f
    private var lastCarryY = 0f
    private var lastCarryAt = 0L

    // Same feel as the desktop pet (2600 px/s² for a 104 px tall pet), at any screen density.
    private val gravity = petHeight * 25f
    private val maxFallSpeed = petHeight * 21f
    private val runSpeed = petWidth * 1.6f
    private val strollSpeed = petWidth * 0.9f
    private val maxThrow = petHeight * 14f

    private val maxX get() = max(0f, stageWidth - petWidth)
    private val groundY get() = max(0f, groundLine - petHeight)
    private val floorY get() = max(groundY, floorLine - petHeight)

    init {
        x = clampX(startX ?: Random.nextFloat() * maxX)
        y = groundY
        rest()
    }

    private fun clampX(v: Float) = min(max(0f, v), maxX)
    private fun between(lo: Long, hi: Long) = lo + (Random.nextDouble() * (hi - lo)).toLong()
    private fun loopMs(anim: String) = atlas.animation(anim).loopMs

    private fun enter(mode: Mode, anim: String, ms: Long = Long.MAX_VALUE) {
        this.mode = mode
        animation = anim
        timeLeft = ms
    }

    /** What to do next on the ground: mostly idle, now and then a stroll or a trick. */
    private fun rest() {
        val r = Random.nextDouble()
        when {
            r < 0.40 -> enter(Mode.IDLE, "idle", between(3000, 7000))
            r < 0.55 -> enter(Mode.IDLE, "waiting", between(2500, 5000))
            r < 0.88 -> stroll()
            else -> {
                val trick = IDLE_TRICKS.random()
                enter(Mode.IDLE, trick, loopMs(trick) * 2)
            }
        }
    }

    /** A short walk to a spot nearby, turning back at the screen edges. */
    private fun stroll() {
        val distance = petWidth * (0.8f + Random.nextFloat() * 2.5f)
        var to = x + if (Random.nextBoolean()) distance else -distance
        if (to < 0f || to > maxX) to = x - (to - x) // no room that way: go the other way
        walk(clampX(to), strollSpeed, called = false)
    }

    private fun walk(to: Float, speed: Float, called: Boolean) {
        targetX = to
        walkSpeed = speed
        this.called = called
        if (abs(targetX - x) < 2) return if (called) poke() else enter(Mode.IDLE, "idle", between(2000, 4000))
        enter(Mode.WALK, if (targetX > x) "running-right" else "running-left")
    }

    // ---- things the user does -----------------------------------------------------

    fun contains(px: Float, py: Float, inset: Float = 0.1f): Boolean =
        px >= x + petWidth * inset && px <= x + petWidth * (1 - inset) &&
            py >= y + petHeight * inset && py <= y + petHeight

    /** A tap on the pet: it reacts happily. */
    fun poke() {
        if (mode == Mode.HELD || mode == Mode.FALL) return
        val reaction = REACTIONS.random()
        enter(Mode.REACT, reaction, loopMs(reaction) * 2)
    }

    /** A tap somewhere else: the pet runs over there along the ground and stays. */
    fun goTo(px: Float) {
        if (mode == Mode.HELD || mode == Mode.FALL) return
        walk(clampX(px - petWidth / 2), runSpeed, called = true)
    }

    /** Finger down on the pet and moved: pick it up. (px, py) is the finger; `now` is in ms. */
    fun pickUp(px: Float, py: Float, now: Long) {
        grabDx = px - x
        grabDy = py - y
        vx = 0f
        vy = 0f
        lastCarryX = px
        lastCarryY = py
        lastCarryAt = now
        enter(Mode.HELD, "running")
    }

    fun carry(px: Float, py: Float, now: Long) {
        if (mode != Mode.HELD) return
        val dt = (now - lastCarryAt) / 1000f
        if (dt > 0.004f) {
            // Smoothed finger speed, so a flick throws the pet and a slow release just drops it.
            vx = vx * 0.4f + (px - lastCarryX) / dt * 0.6f
            vy = vy * 0.4f + (py - lastCarryY) / dt * 0.6f
            lastCarryX = px
            lastCarryY = py
            lastCarryAt = now
        }
        x = clampX(px - grabDx)
        y = min(max(0f, py - grabDy), floorY)
    }

    /** Let go: it flies on with the finger's speed and drops to the ground (or hops up onto it). */
    fun drop(now: Long) {
        if (mode != Mode.HELD) return
        if (now - lastCarryAt > 80) { vx = 0f; vy = 0f } // the finger had stopped
        vx = vx.coerceIn(-maxThrow, maxThrow)
        vy = vy.coerceIn(-maxThrow, maxThrow)
        if (y > groundY + 1) {
            // Let go below the ground (over the dock): hop back up onto it.
            vy = min(vy, -sqrt(2 * gravity * (y - groundY + petHeight * 0.35f)))
        } else if (y >= groundY - 1 && vy >= 0f) {
            return land()
        }
        enter(Mode.FALL, "jumping")
    }

    /** It just evolved: a happy jump. */
    fun celebrate() {
        if (mode == Mode.HELD || mode == Mode.FALL) return
        enter(Mode.REACT, "jumping", loopMs("jumping") * 3)
    }

    private fun land() {
        y = groundY
        vx = 0f
        vy = 0f
        enter(Mode.LAND, "jumping", loopMs("jumping"))
    }

    // ---- simulation -----------------------------------------------------------------

    /** The screen changed size (or rotated): keep the pet on the new ground. */
    fun resize(width: Float, ground: Float, floor: Float = ground) {
        stageWidth = width
        groundLine = ground
        floorLine = floor
        x = clampX(x)
        targetX = clampX(targetX)
        y = if (mode != Mode.HELD && mode != Mode.FALL) groundY else min(y, floorY)
    }

    /** Whether it's moving, so the screen should redraw at full speed. */
    val moving get() = mode == Mode.WALK || mode == Mode.FALL || mode == Mode.HELD

    /** Advance by `dt` ms. */
    fun update(dt: Long) {
        val s = dt / 1000f
        when (mode) {
            Mode.WALK -> {
                val step = walkSpeed * s
                val d = targetX - x
                if (abs(d) <= step) {
                    x = targetX
                    if (called) enter(Mode.IDLE, "waving", loopMs("waving") * 2) else rest() // "here I am!"
                } else {
                    x += sign(d) * step
                }
            }
            Mode.FALL -> {
                vy = min(vy + gravity * s, maxFallSpeed)
                vx *= (1f - min(1f, 0.9f * s)) // a little air drag
                x += vx * s
                if (x <= 0f || x >= maxX) { x = clampX(x); vx = -vx * 0.45f } // bounce off the screen edges
                val wasAbove = y <= groundY
                y += vy * s
                if (vy > 0f && wasAbove && y >= groundY) land()
                else if (y > floorY) { y = floorY; vy = min(vy, 0f) }
            }
            Mode.HELD -> Unit
            else -> {
                timeLeft -= dt
                if (timeLeft <= 0) rest()
            }
        }
    }

    private companion object {
        val IDLE_TRICKS = listOf("waving", "review", "jumping")
        val REACTIONS = listOf("jumping", "waving")
    }
}
