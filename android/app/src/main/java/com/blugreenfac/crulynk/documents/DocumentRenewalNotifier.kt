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
  const val CHANNEL_ID = "com.blugreenfac.crulynk.document_renewals_v2"
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
    manager.deleteNotificationChannel("com.blugreenfac.crulynk.document_renewals")
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Document renewals",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "CruLynk reminders until you upload a renewed document and set the new expiry"
      enableVibration(true)
      vibrationPattern = longArrayOf(0, 300, 150, 300)
      enableLights(true)
      lightColor = ContextCompat.getColor(context, R.color.crulynk_navy)
      setShowBadge(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
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
    val appName = context.getString(R.string.app_name)
    val largeIcon = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)
    val brandColor = ContextCompat.getColor(context, R.color.crulynk_navy)
    val notification = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_shift_reminder)
      .setLargeIcon(largeIcon)
      .setContentTitle(title)
      .setContentText(body)
      .setSubText(appName)
      .setStyle(
        NotificationCompat.BigTextStyle()
          .setBigContentTitle(title)
          .bigText(body)
          .setSummaryText(appName),
      )
      .setColor(brandColor)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setDefaults(Notification.DEFAULT_ALL)
      .setVibrate(longArrayOf(0, 300, 150, 300))
      .setTicker("$appName: $title")
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
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
