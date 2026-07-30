package com.blugreenfac.crulynk.shift

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.BitmapFactory
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.blugreenfac.crulynk.MainActivity
import com.blugreenfac.crulynk.R

internal object ShiftReminderNotifier {
    const val CHANNEL_ID = "com.blugreenfac.crulynk.shift_reminders_v5"
  const val ACTIVE_NOTIFICATION_ID = 2200

  fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    listOf(
      "com.blugreenfac.crulynk.shift_reminders",
      "com.blugreenfac.crulynk.shift_reminders_v2",
      "com.blugreenfac.crulynk.shift_reminders_v3",
      "com.blugreenfac.crulynk.shift_reminders_v4",
    ).forEach { manager.deleteNotificationChannel(it) }

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Shift reminders",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "CruLynk alerts when your assigned shift is coming up"
      enableVibration(true)
      enableLights(true)
      lightColor = ContextCompat.getColor(context, R.color.crulynk_navy)
      setShowBadge(true)
      lockscreenVisibility = Notification.VISIBILITY_PUBLIC
      setBypassDnd(true)
    }
    manager.createNotificationChannel(channel)
  }

  /**
   * @return true when the OS accepted the notification (app notifications enabled).
   */
  fun post(
    context: Context,
    title: String,
    body: String,
    notificationId: Int,
    expiresAtMs: Long,
    alertMessage: String? = null,
  ): Boolean {
    ensureChannel(context)

    val openAppIntent = PendingIntent.getActivity(
      context,
      notificationId,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_TITLE, title)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_MESSAGE, alertMessage ?: body)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_BODY, body)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS, expiresAtMs)
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val appName = context.getString(R.string.app_name)
    val largeIcon = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)
    val brandColor = ContextCompat.getColor(context, R.color.crulynk_navy)
    val timeoutMs = (expiresAtMs - System.currentTimeMillis()).coerceAtLeast(5_000L)

    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
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
      .setContentIntent(openAppIntent)
      // High-importance heads-up popup in the shade. Keep until shift start (timeoutAfter),
      // but do not use ongoing — Samsung suppresses heads-up for ongoing notifications.
      .setAutoCancel(false)
      .setOnlyAlertOnce(false)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_ALARM)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setDefaults(Notification.DEFAULT_ALL)
      .setVibrate(longArrayOf(0, 300, 150, 300))
      .setColor(brandColor)
      .setTicker("$appName: $title")
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)
      .setTimeoutAfter(timeoutMs)
      .setOngoing(false)
      .setLocalOnly(false)
      .setNumber(1)

    val enabled = NotificationManagerCompat.from(context).areNotificationsEnabled()
    if (enabled) {
      NotificationManagerCompat.from(context).notify(notificationId, builder.build())
    }

    val prefs = context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
    val editor = prefs.edit()
      .putString(ShiftReminderReceiver.KEY_PENDING_TITLE, title)
      .putString(
        ShiftReminderReceiver.KEY_PENDING_MESSAGE,
        if (!alertMessage.isNullOrBlank()) alertMessage else body,
      )
    if (enabled) {
      editor.putBoolean(ShiftReminderReceiver.firedKey(notificationId), true)
    }
    editor.apply()

    return enabled
  }

  fun cancel(context: Context, notificationId: Int) {
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    manager.cancel(notificationId)
  }

  fun cancelAllActive(context: Context) {
    cancel(context, ACTIVE_NOTIFICATION_ID)
  }

  fun clearDeliveryFlags(context: Context) {
    context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
      .edit()
      .clear()
      .apply()
  }
}
