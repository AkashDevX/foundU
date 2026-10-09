package com.blugreenfac.crulynk.shift

import android.app.AlarmManager
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
import org.json.JSONArray
import org.json.JSONObject

/**
 * AlarmClock reminders for the meal-break window. Stored separately from shift
 * reminders so arming a break alert does not cancel shift alarms.
 */
internal object BreakWindowAlarm {
  private const val PREFS = "foundu_break_window_alarms_v1"
  private const val KEY_PAYLOAD = "payload"
  const val ACTION_FIRE = "com.blugreenfac.crulynk.shift.FIRE_BREAK_REMINDER"
  private const val CHANNEL_ID = "com.blugreenfac.crulynk.break_reminders_v1"

  data class Reminder(
    val title: String,
    val body: String,
    val triggerAtMs: Long,
    val notificationId: Int,
  )

  fun saveAndSchedule(context: Context, reminders: List<Reminder>) {
    cancel(context, clearNotification = false)
    if (reminders.isEmpty()) return

    val array = JSONArray()
    reminders.forEach { reminder ->
      array.put(
        JSONObject()
          .put("title", reminder.title)
          .put("body", reminder.body)
          .put("triggerAtMs", reminder.triggerAtMs)
          .put("notificationId", reminder.notificationId),
      )
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_PAYLOAD, JSONObject().put("reminders", array).toString())
      .apply()

    scheduleFromStorage(context)
  }

  fun rescheduleFromStorage(context: Context) {
    scheduleFromStorage(context)
  }

  fun cancel(context: Context, clearNotification: Boolean) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    readReminders(context).forEach { reminder ->
      alarmManager.cancel(broadcastPendingIntent(context, reminder, reminder.notificationId))
      alarmManager.cancel(broadcastPendingIntent(context, reminder, reminder.notificationId + 100))
      if (clearNotification) {
        NotificationManagerCompat.from(context).cancel(reminder.notificationId)
      }
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
  }

  fun deliver(context: Context, intent: Intent) {
    val title = intent.getStringExtra(ShiftReminderReceiver.EXTRA_TITLE)?.trim().orEmpty()
      .ifEmpty { "Break window soon" }
    val body = intent.getStringExtra(ShiftReminderReceiver.EXTRA_BODY)?.trim().orEmpty()
    val notificationId = intent.getIntExtra(ShiftReminderReceiver.EXTRA_NOTIFICATION_ID, 2310)
    if (body.isEmpty()) return
    post(context, title, body, notificationId)
  }

  private fun scheduleFromStorage(context: Context) {
    val now = System.currentTimeMillis()
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    readReminders(context).forEach { reminder ->
      if (reminder.triggerAtMs <= now + 2_000L) return@forEach
      setAlarmClock(alarmManager, reminder.triggerAtMs, broadcastPendingIntent(context, reminder, reminder.notificationId), context)
      setExactBackup(
        alarmManager,
        reminder.triggerAtMs + 1_500L,
        broadcastPendingIntent(context, reminder, reminder.notificationId + 100),
      )
    }
  }

  private fun readReminders(context: Context): List<Reminder> {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY_PAYLOAD, null)
      ?: return emptyList()
    return try {
      val reminders = JSONObject(raw).optJSONArray("reminders") ?: JSONArray()
      buildList {
        for (i in 0 until reminders.length()) {
          val item = reminders.getJSONObject(i)
          val title = item.optString("title", "").trim()
          val body = item.optString("body", "").trim()
          val triggerAtMs = item.optLong("triggerAtMs", 0L)
          val notificationId = item.optInt("notificationId", 0)
          if (title.isEmpty() || body.isEmpty() || triggerAtMs <= 0L || notificationId <= 0) continue
          add(Reminder(title, body, triggerAtMs, notificationId))
        }
      }
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun post(context: Context, title: String, body: String, notificationId: Int) {
    ensureChannel(context)
    val openAppIntent = PendingIntent.getActivity(
      context,
      notificationId,
      Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_SINGLE_TOP or
          Intent.FLAG_ACTIVITY_CLEAR_TOP
      },
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val appName = context.getString(R.string.app_name)
    val largeIcon = BitmapFactory.decodeResource(context.resources, R.mipmap.ic_launcher)
    val brandColor = ContextCompat.getColor(context, R.color.crulynk_navy)
    val builder = NotificationCompat.Builder(context, CHANNEL_ID)
      .setSmallIcon(R.drawable.ic_stat_shift_reminder)
      .setLargeIcon(largeIcon)
      .setContentTitle(title)
      .setContentText(body)
      .setSubText(appName)
      .setStyle(NotificationCompat.BigTextStyle().setBigContentTitle(title).bigText(body).setSummaryText(appName))
      .setContentIntent(openAppIntent)
      .setAutoCancel(true)
      .setOnlyAlertOnce(true)
      .setPriority(NotificationCompat.PRIORITY_MAX)
      .setCategory(NotificationCompat.CATEGORY_REMINDER)
      .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
      .setDefaults(Notification.DEFAULT_ALL)
      .setColor(brandColor)
      .setWhen(System.currentTimeMillis())
      .setShowWhen(true)

    if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
      NotificationManagerCompat.from(context).notify(notificationId, builder.build())
    }
  }

  private fun ensureChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Break reminders",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "CruLynk alerts when your meal break window is opening"
      enableVibration(true)
    }
    manager.createNotificationChannel(channel)
  }

  private fun broadcastPendingIntent(context: Context, reminder: Reminder, requestCode: Int): PendingIntent {
    val intent = Intent(context, ShiftReminderReceiver::class.java).apply {
      action = ACTION_FIRE
      putExtra(ShiftReminderReceiver.EXTRA_TITLE, reminder.title)
      putExtra(ShiftReminderReceiver.EXTRA_BODY, reminder.body)
      putExtra(ShiftReminderReceiver.EXTRA_NOTIFICATION_ID, reminder.notificationId)
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun setAlarmClock(
    alarmManager: AlarmManager,
    triggerAtMs: Long,
    operation: PendingIntent,
    context: Context,
  ) {
    val showIntent = PendingIntent.getActivity(
      context,
      9400 + (operation.hashCode() and 0x0fff),
      Intent(context, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAtMs, showIntent), operation)
    } catch (_: Exception) {
      setExactBackup(alarmManager, triggerAtMs, operation)
    }
  }

  private fun setExactBackup(alarmManager: AlarmManager, triggerAtMs: Long, operation: PendingIntent) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
        alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, operation)
      } else {
        @Suppress("DEPRECATION")
        alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, operation)
      }
    } catch (_: SecurityException) {
      try {
        alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, operation)
      } catch (_: Exception) {
        /* give up */
      }
    }
  }
}
