package app.pokepet.pet

import android.content.Context
import android.content.Intent
import androidx.core.content.FileProvider
import java.io.File
import java.net.HttpURLConnection
import java.net.URL

/** Its own FileProvider, so it can't clash with the one the app itself declares. */
class UpdateFileProvider : FileProvider()

/**
 * Updating PokePet outside the Play Store: download the new APK from the GitHub release,
 * then hand it to Android's installer, which asks the user to confirm. Because every
 * release is signed with the same key, the update installs over this version and keeps
 * the user's pets.
 */
internal object Updates {
    private const val ALLOWED_HOST = "github.com"

    /** Downloads the APK into the app's cache (on a background thread). Returns the file. */
    fun download(ctx: Context, url: String): File {
        require(URL(url).let { it.protocol == "https" && it.host == ALLOWED_HOST }) { "Not a PokePet download" }
        val dir = File(ctx.cacheDir, "updates").apply { mkdirs() }
        dir.listFiles()?.forEach { it.delete() } // only ever keep the latest
        val out = File(dir, "PokePet.apk")
        // GitHub redirects release downloads to its file servers; follow those (https only).
        var connection = URL(url).openConnection() as HttpURLConnection
        var redirects = 0
        while (true) {
            connection.instanceFollowRedirects = false
            connection.connectTimeout = 15_000
            connection.readTimeout = 30_000
            val code = connection.responseCode
            if (code in 300..399 && redirects < 5) {
                val next = URL(connection.url, connection.getHeaderField("Location"))
                connection.disconnect()
                require(next.protocol == "https") { "Insecure download" }
                connection = next.openConnection() as HttpURLConnection
                redirects++
                continue
            }
            if (code != 200) error("Download failed ($code)")
            break
        }
        connection.inputStream.use { input -> out.outputStream().use { input.copyTo(it) } }
        connection.disconnect()
        return out
    }

    /** Opens Android's "Do you want to update this app?" screen for the downloaded APK. */
    fun install(ctx: Context, apk: File) {
        val uri = FileProvider.getUriForFile(ctx, "${ctx.packageName}.pokepet.updates", apk)
        val intent = Intent(Intent.ACTION_VIEW)
            .setDataAndType(uri, "application/vnd.android.package-archive")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
        ctx.startActivity(intent)
    }
}
