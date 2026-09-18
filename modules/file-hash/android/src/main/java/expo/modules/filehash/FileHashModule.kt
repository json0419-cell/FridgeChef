package expo.modules.filehash

import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.net.URI
import java.security.MessageDigest

private const val READ_BUFFER_BYTES = 64 * 1024
private const val PROGRESS_THROTTLE_MS = 100L

class InvalidFileUriException(uri: String) :
  CodedException("Only file:// URIs can be hashed, received: $uri")

class FileNotReadableException(path: String) :
  CodedException("File cannot be read: $path")

/**
 * Streams a file through the platform SHA-256 digest.
 *
 * The JS implementation is a tight 32-bit loop, and Hermes has no JIT, so hashing the multi-gigabyte
 * embedding model in JS takes minutes. `MessageDigest` runs at disk speed instead.
 */
class FileHashModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("FileHash")

    Events("onProgress")

    AsyncFunction("sha256FileAsync") { uri: String ->
      val file = resolveFile(uri)
      val digest = MessageDigest.getInstance("SHA-256")
      val buffer = ByteArray(READ_BUFFER_BYTES)
      var hashedBytes = 0L
      var lastEventAt = 0L

      file.inputStream().use { input ->
        while (true) {
          val read = input.read(buffer)
          if (read <= 0) {
            break
          }

          digest.update(buffer, 0, read)
          hashedBytes += read

          val now = System.currentTimeMillis()
          if (now - lastEventAt >= PROGRESS_THROTTLE_MS) {
            lastEventAt = now
            sendProgress(uri, hashedBytes)
          }
        }
      }

      sendProgress(uri, hashedBytes)
      toHex(digest.digest())
    }
  }

  private fun sendProgress(uri: String, hashedBytes: Long) {
    sendEvent("onProgress", mapOf("uri" to uri, "hashedBytes" to hashedBytes.toDouble()))
  }
}

private fun resolveFile(uri: String): File {
  if (!uri.startsWith("file://")) {
    throw InvalidFileUriException(uri)
  }

  val file = try {
    File(URI(uri))
  } catch (_: IllegalArgumentException) {
    throw InvalidFileUriException(uri)
  }

  if (!file.isFile || !file.canRead()) {
    throw FileNotReadableException(file.path)
  }

  return file
}

private fun toHex(bytes: ByteArray): String {
  val hex = StringBuilder(bytes.size * 2)
  for (byte in bytes) {
    val value = byte.toInt() and 0xff
    hex.append(HEX_DIGITS[value ushr 4])
    hex.append(HEX_DIGITS[value and 0x0f])
  }
  return hex.toString()
}

private const val HEX_DIGITS = "0123456789abcdef"
