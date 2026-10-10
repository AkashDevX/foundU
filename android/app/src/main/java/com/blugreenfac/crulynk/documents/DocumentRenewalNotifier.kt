package com.blugreenfac.crulynk.documents

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.blugreenfac.crulynk.MainActivity
import com.blugreenfac.crulynk.R

internal object DocumentRenewalNotifier {
  const val CHANNEL_ID = "com.blugreenfac.crulynk.document_renewals"
  const val NOTIFICATION_ID = 2400
  const val EXTRA_OPEN = "open_document_renewal"

  @Volatile private var openRequested = false
  @Volatile private var openListener: (() -> Unit)? = null

  fun setOpenListener(listener: (() -> Unit)?) {
    openListener = listener
  }

  fun markOpenRequested() {
    openRequested = true
    openListener?.invoke()
  }

  fun consumeOpenRequested(): Boolean {
    val value = openRequested
    openRequested = false
    return value
  }

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Document renewals",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "Daily reminders until you upload a renewed document and set the new expiry"
      enableVibration(true)
      setShowBadge(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }

  fun post(context: Context, title: String, body: String) {
    ensureChannel(context)
    val openApp = PendingIntent.getActivity(
      context,
      NOTIFICATION_ID,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(EXTRA_OPEN, true)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val largeIcon = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_shift_reminder)
      .setLargeIcon(largeIcon)
      .setContentTitle(title)
      .setContentText(body)
      .setStyle(NotificationCompat.BigTextStyle().bigText(body))
      .setSubText(context.getString(R.string.app_name))
      .setColor(ContextCompat.getColor(context, R.color.crulynk_navy))
      .setPriority(NotificationCompat.PRIORITY_HIGH)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setAutoCancel(true)
      .setOnlyAlertOnce(false)
      .setContentIntent(openApp)
      .build()
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    // Replace the previous day's alert so the countdown (30, 29, 28...) sounds again.
    manager.cancel(NOTIFICATION_ID)
    manager.notify(NOTIFICATION_ID, notification)
  }

  fun cancel(context: Context) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(NOTIFICATION_ID)
  }
}
