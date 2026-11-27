package app.pokepet.pet

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import org.json.JSONArray
import org.json.JSONObject

/** One row of the spritesheet. Mirrors `AnimationSpec` in packages/core/src/atlas.ts. */
internal class Animation(val row: Int, val frames: Int, val frameMs: Int, val mirror: Boolean, val once: Boolean) {
    /** One full play, in ms. */
    val loopMs: Long get() = frames.toLong() * frameMs
}

internal class Atlas(val cellWidth: Int, val cellHeight: Int, private val animations: Map<String, Animation>) {
    private val fallback = animations["idle"] ?: animations.values.first()
    fun animation(id: String): Animation = animations[id] ?: fallback
}

/** Where a pet sits in its evolution line. Mirrors `EvolutionInfo` in packages/core/src/evolution.ts. */
internal class EvolutionInfo(val stage: Int, val next: List<String>)

/**
 * The pet pack, read from the APK's assets (copied there from public/packs at build time).
 * Evolution rules match packages/core: growth thresholds come from data/growth.json,
 * which scripts/sync-packs.ts writes from GROWTH_THRESHOLDS_MS.
 */
internal class Pack private constructor(
    val atlas: Atlas,
    private val evolution: Map<String, EvolutionInfo>,
    private val thresholdsMs: List<Long>,
    private val names: Map<String, String>,
) {
    fun nameOf(slug: String): String = names[slug] ?: slug.replaceFirstChar { it.uppercase() }

    /** What the pet can turn into once it has had `onScreenMs` on screen, or empty if not yet (or never). */
    fun readyToEvolveInto(species: String, onScreenMs: Long): List<String> {
        val info = evolution[species] ?: return emptyList()
        val at = thresholdsMs.getOrNull(info.stage) ?: return emptyList()
        return if (info.next.isNotEmpty() && onScreenMs >= at) info.next else emptyList()
    }

    fun spritesheet(ctx: Context, species: String): Bitmap? = try {
        ctx.assets.open("$ID/pets/$species/spritesheet.webp").use { input ->
            BitmapFactory.decodeStream(input, null, BitmapFactory.Options().apply { inScaled = false })
        }
    } catch (e: Exception) {
        null
    }

    companion object {
        const val ID = "pokemon"

        @Volatile
        private var cached: Pack? = null

        fun get(ctx: Context): Pack = cached ?: synchronized(this) {
            cached ?: load(ctx.applicationContext).also { cached = it }
        }

        private fun asset(ctx: Context, path: String): String =
            ctx.assets.open("$ID/$path").bufferedReader().use { it.readText() }

        private fun load(ctx: Context): Pack {
            val atlasJson = JSONObject(asset(ctx, "pack.json")).getJSONObject("atlas")
            val anims = atlasJson.getJSONArray("animations")
            val animations = (0 until anims.length()).associate { i ->
                val a = anims.getJSONObject(i)
                a.getString("id") to Animation(
                    row = a.getInt("row"),
                    frames = a.getInt("frames"),
                    frameMs = a.getInt("frameMs"),
                    mirror = a.optBoolean("mirror", false),
                    once = a.optBoolean("once", false),
                )
            }
            val atlas = Atlas(atlasJson.getInt("cellWidth"), atlasJson.getInt("cellHeight"), animations)

            val evoJson = JSONObject(asset(ctx, "data/evolution.json"))
            val evolution = evoJson.keys().asSequence().associateWith { slug ->
                val e = evoJson.getJSONObject(slug)
                EvolutionInfo(e.optInt("stage", 0), e.optJSONArray("next").strings())
            }

            val thresholds = JSONObject(asset(ctx, "data/growth.json")).getJSONArray("thresholdsMs")
            val thresholdsMs = (0 until thresholds.length()).map { thresholds.getLong(it) }

            val index = JSONArray(asset(ctx, "data/index.json"))
            val names = (0 until index.length()).associate { i ->
                val p = index.getJSONObject(i)
                p.getString("slug") to p.optString("name", p.getString("slug"))
            }
            return Pack(atlas, evolution, thresholdsMs, names)
        }

        private fun JSONArray?.strings(): List<String> =
            if (this == null) emptyList() else (0 until length()).map { getString(it) }
    }
}
