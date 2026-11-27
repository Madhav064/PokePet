package app.pokepet.pet

import android.view.Choreographer

/**
 * Runs `frame(dtMs)` in step with the screen's refresh, on the main thread. While the pet
 * moves (`frame` returns true) that's every refresh, for smooth motion; while it stands
 * still, a few times a second is plenty for its sprite frames and saves battery.
 */
internal class FrameLoop(private val frame: (dtMs: Long) -> Boolean) {
    private val choreographer = Choreographer.getInstance()
    private var running = false
    private var lastNanos = 0L

    private val callback = object : Choreographer.FrameCallback {
        override fun doFrame(frameTimeNanos: Long) {
            if (!running) return
            val dt = if (lastNanos == 0L) 16L else ((frameTimeNanos - lastNanos) / 1_000_000).coerceIn(0, 100)
            lastNanos = frameTimeNanos
            val fast = frame(dt)
            if (!running) return
            if (fast) choreographer.postFrameCallback(this) else choreographer.postFrameCallbackDelayed(this, IDLE_DELAY_MS)
        }
    }

    val isRunning get() = running

    fun start() {
        if (running) return
        running = true
        lastNanos = 0L
        choreographer.postFrameCallback(callback)
    }

    fun stop() {
        running = false
        choreographer.removeFrameCallback(callback)
    }

    private companion object {
        const val IDLE_DELAY_MS = 50L
    }
}
