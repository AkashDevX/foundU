package com.blugreenfac.crulynk.training

import android.graphics.Color
import android.graphics.Matrix
import android.graphics.SurfaceTexture
import android.media.AudioAttributes
import android.media.MediaPlayer
import android.util.Log
import android.view.Surface
import android.view.TextureView
import android.widget.FrameLayout
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.WritableMap
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.UIManagerHelper
import com.facebook.react.uimanager.events.Event
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.net.InetSocketAddress
import java.net.Socket
import kotlin.concurrent.thread
import kotlin.math.min

/**
 * Plays a training video inside the slide. The file is saved locally first.
 * Streaming the signed URL makes Android request a byte range the server
 * cannot return, so the player reports that the video is unreadable.
 */
class TrainingVideoView(private val reactContext: ThemedReactContext) :
  FrameLayout(reactContext), TextureView.SurfaceTextureListener {

  private val textureView = TextureView(reactContext)
  private var mediaPlayer: MediaPlayer? = null
  private var outputSurface: Surface? = null
  private var pendingUrl: String? = null
  private var authorization: String? = null
  private var company: String? = null
  private var readyPath: String? = null
  private var readyForUrl: String? = null
  private var downloadingUrl: String? = null
  private var playGeneration = 0
  private var acceptingErrors = false
  private var wantPaused = false
  private var videoWidth = 0
  private var videoHeight = 0

  init {
    setBackgroundColor(Color.BLACK)
    textureView.surfaceTextureListener = this
    addView(textureView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setSource(url: String?) {
    pendingUrl = url?.trim().orEmpty().ifEmpty { null }
    post { begin() }
  }

  fun setAuthorization(value: String?) {
    authorization = value?.trim().orEmpty().ifEmpty { null }
    post { begin() }
  }

  fun setCompany(value: String?) {
    company = value?.trim().orEmpty().ifEmpty { null }
    post { begin() }
  }

  fun setPaused(paused: Boolean) {
    wantPaused = paused
    val player = mediaPlayer ?: return
    try {
      if (paused) {
        if (player.isPlaying) player.pause()
      } else if (!player.isPlaying) {
        player.start()
      }
    } catch (_: IllegalStateException) {
      // The player was released between the tap and this call.
    }
  }

  fun release() {
    playGeneration += 1
    downloadingUrl = null
    releasePlayer()
  }

  override fun onSurfaceTextureAvailable(surface: SurfaceTexture, width: Int, height: Int) {
    attachPlayer()
    begin()
  }

  override fun onSurfaceTextureSizeChanged(surface: SurfaceTexture, width: Int, height: Int) {
    applyFit()
  }

  override fun onSurfaceTextureDestroyed(surface: SurfaceTexture): Boolean {
    releasePlayer()
    return true
  }

  override fun onSurfaceTextureUpdated(surface: SurfaceTexture) = Unit

  private fun begin() {
    val url = pendingUrl ?: return
    if ((url.contains("/training/blocks/") && url.contains("/file")) &&
      (authorization.isNullOrBlank() || company.isNullOrBlank())
    ) {
      return
    }
    if (url == readyForUrl && readyPath != null) {
      attachPlayer()
      return
    }
    if (url == downloadingUrl) return
    downloadingUrl = url
    readyPath = null
    readyForUrl = null
    releasePlayer()
    val generation = ++playGeneration
    val authHeader = authorization
    val companySlug = company
    thread(name = "training-video") {
      try {
        val path = if (url.startsWith("http://") || url.startsWith("https://")) {
          downloadToCache(url, authHeader, companySlug).absolutePath
        } else {
          url
        }
        post {
          if (generation != playGeneration) return@post
          downloadingUrl = null
          readyPath = path
          readyForUrl = url
          attachPlayer()
        }
      } catch (error: Exception) {
        Log.e(TAG, "Could not save the training video", error)
        post {
          if (generation != playGeneration) return@post
          downloadingUrl = null
          emitError()
        }
      }
    }
  }

  private fun downloadToCache(url: String, authHeader: String?, companySlug: String?): File {
    val file = File(context.cacheDir, "training-video-${stableName(url)}.mp4")
    val partial = File(file.absolutePath + ".part")
    if (file.exists()) file.delete()
    if (partial.exists()) partial.delete()
    // A single download of the whole file loses the final bytes on the emulator,
    // so the player saves the video in small pieces that arrive intact.
    val chunkSize = 256 * 1024
    var offset = 0L
    var total = Long.MAX_VALUE
    try {
      FileOutputStream(partial).use { output ->
        while (offset < total) {
          val piece = downloadRange(url, authHeader, companySlug, offset, offset + chunkSize - 1)
          if (piece.from != offset) throw java.io.IOException("Video piece was out of order")
          total = piece.total
          output.write(piece.data)
          offset += piece.data.size
        }
      }
      if (partial.length() != total || !isMp4(partial)) {
        partial.delete()
        throw java.io.IOException("Video download was incomplete")
      }
      if (!partial.renameTo(file)) {
        partial.copyTo(file, overwrite = true)
        partial.delete()
      }
      Log.i(TAG, "Saved training video ${file.length()} bytes")
      return file
    } catch (error: Exception) {
      partial.delete()
      throw error
    }
  }

  private fun downloadRange(
    url: String,
    authHeader: String?,
    companySlug: String?,
    start: Long,
    end: Long,
  ): VideoPiece {
    var last: Exception? = null
    repeat(3) {
      try {
        return fetchRange(url, authHeader, companySlug, start, end)
      } catch (error: Exception) {
        last = error
      }
    }
    throw last ?: java.io.IOException("Video piece failed")
  }

  private fun fetchRange(
    url: String,
    authHeader: String?,
    companySlug: String?,
    start: Long,
    end: Long,
  ): VideoPiece {
    val first = readSocketRange(url, authHeader, companySlug, start, end)
    if (first.data.isEmpty()) throw java.io.IOException("Video piece was empty")
    var data = first.data
    var guard = 0
    val expected = (first.to - first.from + 1).toInt()
    while (data.size < expected && guard < 6) {
      guard++
      val tail = readSocketRange(url, authHeader, companySlug, first.from + data.size, first.to)
      if (tail.data.isEmpty() || tail.from != first.from + data.size) {
        throw java.io.IOException("Video piece was short")
      }
      data += tail.data
    }
    if (data.size != expected) throw java.io.IOException("Video piece was short")
    return VideoPiece(first.from, first.total, data)
  }

  /**
   * OkHttp and HttpURLConnection abort when the emulator drops the last few
   * bytes of a local response. A raw socket keeps whatever arrived.
   */
  private fun readSocketRange(
    url: String,
    authHeader: String?,
    companySlug: String?,
    start: Long,
    end: Long,
  ): SocketPiece {
    val parsed = java.net.URI(url)
    val host = parsed.host ?: throw java.io.IOException("Video address was invalid")
    val port = if (parsed.port > 0) parsed.port else 80
    val path = parsed.rawPath + if (parsed.rawQuery.isNullOrEmpty()) "" else "?${parsed.rawQuery}"
    val socket = Socket()
    socket.connect(InetSocketAddress(host, port), 20_000)
    socket.soTimeout = 30_000
    socket.use { sock ->
      val request = buildString {
        append("GET $path HTTP/1.1\r\n")
        append("Host: $host:$port\r\n")
        append("Accept: video/mp4, application/octet-stream, */*\r\n")
        append("Accept-Encoding: identity\r\n")
        append("Connection: close\r\n")
        append("Range: bytes=$start-$end\r\n")
        if (!authHeader.isNullOrBlank()) append("Authorization: $authHeader\r\n")
        if (!companySlug.isNullOrBlank()) append("X-Company-Slug: $companySlug\r\n")
        append("\r\n")
      }
      sock.getOutputStream().apply {
        write(request.toByteArray(Charsets.US_ASCII))
        flush()
      }
      val input = sock.getInputStream()
      val headerBytes = ByteArrayOutputStream()
      while (headerBytes.size() < 4 || !headerBytes.toByteArray().takeLast(4).toByteArray().contentEquals(HEADER_END)) {
        val next = input.read()
        if (next < 0) throw java.io.IOException("Video piece headers ended early")
        headerBytes.write(next)
        if (headerBytes.size() > 16_384) throw java.io.IOException("Video piece headers were too large")
      }
      val headerText = headerBytes.toString(Charsets.ISO_8859_1)
      val status = headerText.lineSequence().firstOrNull()?.trim().orEmpty()
      if (!status.startsWith("HTTP/1.1 206") && !status.startsWith("HTTP/1.0 206")) {
        throw java.io.IOException("Video piece failed with status $status")
      }
      val match = RANGE_HEADER.find(headerText)
        ?: throw java.io.IOException("Video piece was missing its range")
      val from = match.groupValues[1].toLong()
      val to = match.groupValues[2].toLong()
      val total = match.groupValues[3].toLong()
      val length = CONTENT_LENGTH.find(headerText)?.groupValues?.get(1)?.toInt()
        ?: (to - from + 1).toInt()
      val body = ByteArray(length)
      var read = 0
      while (read < length) {
        val count = input.read(body, read, length - read)
        if (count < 0) break
        read += count
      }
      return SocketPiece(from, to, total, if (read == length) body else body.copyOf(read))
    }
  }

  private fun attachPlayer() {
    val path = readyPath ?: return
    if (mediaPlayer != null) return
    val texture = textureView.surfaceTexture ?: return
    val surface = Surface(texture)
    outputSurface = surface
    val player = MediaPlayer()
    mediaPlayer = player
    acceptingErrors = true
    player.setAudioAttributes(
      AudioAttributes.Builder()
        .setUsage(AudioAttributes.USAGE_MEDIA)
        .setContentType(AudioAttributes.CONTENT_TYPE_MOVIE)
        .build(),
    )
    player.setOnVideoSizeChangedListener { _, width, height ->
      videoWidth = width
      videoHeight = height
      applyFit()
    }
    player.setOnPreparedListener {
      applyFit()
      Log.i(TAG, "Training video ready")
      if (wantPaused) it.pause() else it.start()
    }
    player.setOnErrorListener { _, what, extra ->
      Log.e(TAG, "MediaPlayer error $what $extra")
      if (acceptingErrors) emitError()
      true
    }
    try {
      FileInputStream(path).use { input ->
        player.setDataSource(input.fd)
      }
      player.setSurface(surface)
      player.prepareAsync()
    } catch (error: Exception) {
      Log.e(TAG, "Could not start the saved video", error)
      emitError()
    }
  }

  private fun applyFit() {
    val viewWidth = textureView.width.toFloat()
    val viewHeight = textureView.height.toFloat()
    if (viewWidth == 0f || viewHeight == 0f || videoWidth == 0 || videoHeight == 0) return
    val scaleX = viewWidth / videoWidth
    val scaleY = viewHeight / videoHeight
    val scale = min(scaleX, scaleY)
    val matrix = Matrix()
    matrix.setScale(scale / scaleX, scale / scaleY, viewWidth / 2f, viewHeight / 2f)
    textureView.setTransform(matrix)
  }

  private fun emitError() {
    if (id == NO_ID) return
    val dispatcher = UIManagerHelper.getEventDispatcherForReactTag(reactContext, id) ?: return
    dispatcher.dispatchEvent(PlaybackErrorEvent(UIManagerHelper.getSurfaceId(this), id))
  }

  private fun releasePlayer() {
    acceptingErrors = false
    mediaPlayer?.let { player ->
      player.setOnErrorListener(null)
      player.setOnPreparedListener(null)
      try {
        player.release()
      } catch (_: IllegalStateException) {
        // Already released.
      }
    }
    mediaPlayer = null
    outputSurface?.release()
    outputSurface = null
  }

  private fun isMp4(file: File): Boolean {
    if (!file.exists() || file.length() < 12) return false
    val head = ByteArray(12)
    FileInputStream(file).use { input ->
      if (input.read(head) < 8) return false
    }
    return head[4] == 'f'.code.toByte() &&
      head[5] == 't'.code.toByte() &&
      head[6] == 'y'.code.toByte() &&
      head[7] == 'p'.code.toByte()
  }

  private fun stableName(url: String): String {
    val hash = url.hashCode().toUInt().toString(16)
    return hash
  }

  companion object {
    private const val TAG = "TrainingVideo"
    private val RANGE_HEADER = Regex("""bytes (\d+)-(\d+)/(\d+)""")
    private val CONTENT_LENGTH = Regex("""(?i)Content-Length: (\d+)""")
    private val HEADER_END = byteArrayOf(13, 10, 13, 10)
  }
}

private data class VideoPiece(val from: Long, val total: Long, val data: ByteArray)

private data class SocketPiece(val from: Long, val to: Long, val total: Long, val data: ByteArray)

private class PlaybackErrorEvent(surfaceId: Int, viewTag: Int) : Event<PlaybackErrorEvent>(surfaceId, viewTag) {
  override fun getEventName(): String = "onPlaybackError"

  override fun getEventData(): WritableMap = Arguments.createMap()
}
