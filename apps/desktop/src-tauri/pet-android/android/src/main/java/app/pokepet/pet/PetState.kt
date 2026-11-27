package app.pokepet.pet

import android.content.Context
import android.os.SystemClock
import org.json.JSONObject
import java.io.File

/** The pet to show: as the app last saved it, plus what the phone has added since. */
internal data class ShownPet(val id: String, val species: String, val onScreenMs: Long)

internal data class Evolution(val id: String, val from: String, val to: String)

/**
 * What the pet on the phone is and how long it has been on screen.
 *
 * The app's Rust side owns collection.json (src-tauri/src/collection.rs); nothing here
 * ever writes it, so the two can never overwrite each other. Instead this side keeps
 * its own file, phone-time.json, which only it writes:
 *
 *   { "screenMs": { "<pet id>": total ms on screen on the phone (only ever grows) },
 *     "evolved":  { "<pet id>": { "from": "bulbasaur", "to": "ivysaur" } } }
 *
 * The app folds that in whenever it runs (Collection::fold_phone_time), and records in
 * collection.json's "phoneCreditedMs" how much of each total it has already counted.
 *
 * The wallpaper and the over-apps pet both run in the app's process and share this object,
 * so time when both are showing is only counted once.
 */
internal object PetState {
    /** A longer gap between ticks means the phone slept; don't count it. */
    private const val MAX_TICK_GAP_MS = 15_000L
    private const val SAVE_EVERY_MS = 30_000L

    private val showing = mutableSetOf<String>()
    private var lastTick = 0L
    private var lastSave = 0L
    private var dirty = false

    private var loadedFrom: File? = null
    private val screenMs = mutableMapOf<String, Long>()
    private val evolved = mutableMapOf<String, Pair<String, String>>()

    private var collectionStamp = Pair(-1L, -1L)
    private var collection: JSONObject? = null

    // ---- the pet ----------------------------------------------------------------

    @Synchronized
    fun shownPet(ctx: Context): ShownPet? {
        ensureLoaded(ctx)
        val c = readCollection(ctx) ?: return null
        if (c.isNull("active")) return null
        val id = c.getString("active")
        val pets = c.optJSONArray("pets") ?: return null
        val pet = (0 until pets.length()).map { pets.getJSONObject(it) }.firstOrNull { it.optString("id") == id }
            ?: return null
        var species = pet.getString("species")
        evolved[id]?.let { (from, to) -> if (species == from) species = to }
        val credited = c.optJSONObject("phoneCreditedMs")?.optLong(id, 0L) ?: 0L
        val extra = maxOf(0L, (screenMs[id] ?: 0L) - credited)
        return ShownPet(id, species, pet.optLong("onScreenMs", 0L) + extra)
    }

    /** Evolves the pet on screen if it has had enough time there. Returns what happened, if anything. */
    @Synchronized
    fun maybeEvolve(ctx: Context, pack: Pack): Evolution? {
        val pet = shownPet(ctx) ?: return null
        val into = pack.readyToEvolveInto(pet.species, pet.onScreenMs).randomOrNull() ?: return null
        // Evolving twice before the app runs again: record the whole step, from what the app
        // last saved straight to the newest form, so the app can still apply it.
        val saved = evolved[pet.id]?.takeIf { it.second == pet.species }?.first ?: pet.species
        evolved[pet.id] = saved to into
        dirty = true
        save(ctx)
        return Evolution(pet.id, pet.species, into)
    }

    // ---- the clock ----------------------------------------------------------------

    /** A pet started showing (`source` is "wallpaper" or "overlay"). */
    @Synchronized
    fun show(ctx: Context, source: String) {
        ensureLoaded(ctx)
        if (showing.isEmpty()) lastTick = SystemClock.elapsedRealtime()
        showing += source
    }

    /** A pet stopped showing. Banks the time so far. */
    @Synchronized
    fun hide(ctx: Context, source: String) {
        if (source !in showing) return
        tick(ctx)
        showing -= source
        if (showing.isEmpty()) save(ctx)
    }

    /** Credits the time since the last tick to the pet on screen. Call about once a second while showing. */
    @Synchronized
    fun tick(ctx: Context) {
        if (showing.isEmpty()) return
        val now = SystemClock.elapsedRealtime()
        val dt = now - lastTick
        lastTick = now
        if (dt <= 0 || dt > MAX_TICK_GAP_MS) return
        val id = shownPet(ctx)?.id ?: return
        screenMs[id] = (screenMs[id] ?: 0L) + dt
        dirty = true
        if (now - lastSave >= SAVE_EVERY_MS) save(ctx)
    }

    // ---- files --------------------------------------------------------------------

    private fun phoneTimeFile(ctx: Context) = Prefs.dataDir(ctx)?.let { File(it, "phone-time.json") }

    private fun ensureLoaded(ctx: Context) {
        val file = phoneTimeFile(ctx) ?: return
        if (file == loadedFrom) return
        loadedFrom = file
        screenMs.clear()
        evolved.clear()
        val json = try {
            JSONObject(file.readText())
        } catch (e: Exception) {
            return
        }
        json.optJSONObject("screenMs")?.let { s -> s.keys().forEach { screenMs[it] = s.optLong(it, 0L) } }
        json.optJSONObject("evolved")?.let { e ->
            e.keys().forEach { id ->
                val step = e.optJSONObject(id) ?: return@forEach
                evolved[id] = step.optString("from") to step.optString("to")
            }
        }
    }

    private fun readCollection(ctx: Context): JSONObject? {
        val file = Prefs.dataDir(ctx)?.let { File(it, "collection.json") } ?: return null
        val stamp = file.lastModified() to file.length()
        if (stamp != collectionStamp) {
            collectionStamp = stamp
            collection = try {
                JSONObject(file.readText())
            } catch (e: Exception) {
                null
            }
        }
        return collection
    }

    private fun save(ctx: Context) {
        lastSave = SystemClock.elapsedRealtime()
        if (!dirty) return
        val file = phoneTimeFile(ctx) ?: return
        // Forget evolutions the app has already applied (or that no longer fit the pet).
        val c = readCollection(ctx)
        val pets = c?.optJSONArray("pets")
        if (pets != null) {
            val speciesById = (0 until pets.length()).associate {
                val p = pets.getJSONObject(it)
                p.optString("id") to p.optString("species")
            }
            evolved.entries.removeAll { (id, step) -> speciesById[id] != step.first }
        }
        val json = JSONObject()
            .put("screenMs", JSONObject(screenMs as Map<*, *>))
            .put("evolved", JSONObject().apply {
                evolved.forEach { (id, step) -> put(id, JSONObject().put("from", step.first).put("to", step.second)) }
            })
        try {
            file.parentFile?.mkdirs()
            val tmp = File(file.path + ".tmp")
            tmp.writeText(json.toString())
            if (!tmp.renameTo(file)) {
                file.delete()
                tmp.renameTo(file)
            }
            dirty = false
        } catch (e: Exception) {
            // Try again on the next save.
        }
    }
}
