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
   * @return true when the OS accepted a new notification post.
   */
  fun post(
    context: Context,
    title: String,
    body: String,
    notificationId: Int,
    expiresAtMs: Long,
    alertMessage: String? = null,
    thresholdMin: Int = 0,
  ): Boolean {
    // After shift start, or under 15 minutes remaining: never popup again.
    if (!ShiftReminderScheduler.isReminderPopupWindowOpen(expiresAtMs)) {
      cancelAllActive(context)
      clearPendingAlert(context)
      return false
    }

    // Each threshold may alert at most once (blocks AlarmClock + backup + watchdog spam).
    if (thresholdMin > 0 && hasDeliveredThreshold(context, thresholdMin)) {
      return true
    }

    ensureChannel(context)

    val openAppIntent = PendingIntent.getActivity(
      context,
      notificationId,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
        // Open app only — do not re-trigger reminder extras after shift window closes.
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val appName = context.getString(R.string.app_name)
    val largeIcon = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)
    val brandColor = ContextCompat.getColor(context, R.color.crulynk_navy)
    // Keep tray at most until the under-15 silence window (or shift start, whichever first).
    val silenceAtMs = ShiftReminderScheduler.popupSilenceAtMs(expiresAtMs)
    val timeoutMs = (silenceAtMs - System.currentTimeMillis()).coerceAtLeast(1_000L)

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
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
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
    if (thresholdMin > 0) {
      editor.putBoolean(deliveredThresholdKey(thresholdMin), true)
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
    clearPendingAlert(context)
  }

  fun clearDeliveryFlags(context: Context) {
    context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
      .edit()
      .clear()
      .apply()
  }

  fun clearPendingAlert(context: Context) {
    context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
      .edit()
      .remove(ShiftReminderReceiver.KEY_PENDING_TITLE)
      .remove(ShiftReminderReceiver.KEY_PENDING_MESSAGE)
      .apply()
  }

  fun hasDeliveredThreshold(context: Context, thresholdMin: Int): Boolean {
    if (thresholdMin <= 0) return false
    return context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
      .getBoolean(deliveredThresholdKey(thresholdMin), false)
  }

  fun deliveredThresholdKey(thresholdMin: Int): String = "delivered_threshold_$thresholdMin"
}
