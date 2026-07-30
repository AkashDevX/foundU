package com.blugreenfac.crulynk.shift

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.blugreenfac.crulynk.MainActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists shift reminder alarms and schedules them with [AlarmManager.setAlarmClock].
 *
 * The AlarmClock PendingIntent targets [MainActivity] so Android will wake the UI even after
 * the app is swiped away from Recents. A BroadcastReceiver is also armed as a backup to post
 * the status-bar notification.
 */
internal object ShiftReminderScheduler {
  private const val PREFS = "foundu_shift_reminder_schedule_v1"
  private const val KEY_PAYLOAD = "payload"
  private const val WATCHDOG_REQUEST_CODE = 2299
  private const val CLEAR_REQUEST_CODE = 2298
  private const val WATCHDOG_INTERVAL_MS = 5 * 60_000L

  data class Reminder(
    val thresholdMin: Int,
    val title: String,
    val body: String,
    val alertMessage: String,
    val triggerAtMs: Long,
    val expiresAtMs: Long,
    val alarmRequestCode: Int,
  )

  fun saveAndSchedule(context: Context, reminders: List<Reminder>) {
    // Do not preserve old fired flags across a fresh schedule — they blocked re-delivery.
    cancelScheduled(context, clearNotification = false)
    ShiftReminderNotifier.clearDeliveryFlags(context)
    if (reminders.isEmpty()) {
      context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
      return
    }

    val expiresAtMs = reminders.maxOf { it.expiresAtMs }
    val array = JSONArray()
    reminders.forEach { reminder ->
      array.put(
        JSONObject()
          .put("thresholdMin", reminder.thresholdMin)
          .put("title", reminder.title)
          .put("body", reminder.body)
          .put("alertMessage", reminder.alertMessage)
          .put("triggerAtMs", reminder.triggerAtMs)
          .put("expiresAtMs", reminder.expiresAtMs)
          .put("alarmRequestCode", reminder.alarmRequestCode),
      )
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .clear()
      .putString(
        KEY_PAYLOAD,
        JSONObject()
          .put("expiresAtMs", expiresAtMs)
          .put("reminders", array)
          .toString(),
      )
      .apply()

    scheduleFromPayload(context)
  }

  fun rescheduleFromStorage(context: Context) {
    scheduleFromPayload(context)
  }

  fun cancelScheduled(context: Context, clearNotification: Boolean) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val raw = prefs.getString(KEY_PAYLOAD, null)
    if (raw != null) {
      try {
        val payload = JSONObject(raw)
        val reminders = payload.optJSONArray("reminders") ?: JSONArray()
        for (i in 0 until reminders.length()) {
          val item = reminders.getJSONObject(i)
          val code = item.optInt("alarmRequestCode", 0)
          if (code == 0) continue
          val reminder = Reminder(
            thresholdMin = item.optInt("thresholdMin", 0),
            title = item.optString("title", " "),
            body = item.optString("body", " "),
            alertMessage = item.optString("alertMessage", " "),
            triggerAtMs = item.optLong("triggerAtMs", 0L),
            expiresAtMs = item.optLong("expiresAtMs", 0L),
            alarmRequestCode = code,
          )
          alarmManager.cancel(activityPendingIntent(context, reminder, code))
          alarmManager.cancel(broadcastPendingIntent(context, reminder, code))
          alarmManager.cancel(broadcastPendingIntent(context, reminder, code + 5000))
        }
      } catch (_: Exception) {
        /* ignore corrupt cache */
      }
    }
    alarmManager.cancel(watchdogPendingIntent(context))
    alarmManager.cancel(clearPendingIntent(context))
    prefs.edit().clear().apply()
    if (clearNotification) {
      ShiftReminderNotifier.cancelAllActive(context)
    }
  }

  fun onWatchdog(context: Context) {
    val now = System.currentTimeMillis()
    val payload = readPayload(context) ?: return
    val expiresAtMs = payload.optLong("expiresAtMs", 0L)
    if (expiresAtMs <= now) {
      cancelScheduled(context, clearNotification = true)
      return
    }

    val reminders = payload.optJSONArray("reminders") ?: JSONArray()
    var due: JSONObject? = null
    for (i in 0 until reminders.length()) {
      val item = reminders.getJSONObject(i)
      val triggerAtMs = item.optLong("triggerAtMs", 0L)
      val threshold = item.optInt("thresholdMin", 0)
      if (triggerAtMs <= now && threshold > 0) {
        if (due == null || threshold < due.optInt("thresholdMin", Int.MAX_VALUE)) {
          due = item
        }
      }
    }

    if (due != null) {
      val threshold = due.optInt("thresholdMin", 0)
      val firedKey = "watchdog_fired_$threshold"
      val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      // Re-post shade card if it was dismissed; do not force-open the app.
      deliverReminder(
        context = context,
        title = due.optString("title", "Shift coming soon"),
        body = due.optString("body", "Your assigned shift is almost here."),
        alertMessage = due.optString("alertMessage", due.optString("body")),
        expiresAtMs = expiresAtMs,
        launchUi = false,
      )
      if (!prefs.getBoolean(firedKey, false)) {
        prefs.edit().putBoolean(firedKey, true).apply()
      }
    }

    scheduleWatchdog(context, expiresAtMs)
  }

  fun deliverReminder(
    context: Context,
    title: String,
    body: String,
    alertMessage: String,
    expiresAtMs: Long,
    launchUi: Boolean,
  ) {
    val posted = ShiftReminderNotifier.post(
      context = context,
      title = title,
      body = body,
      notificationId = ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
      expiresAtMs = expiresAtMs,
      alertMessage = alertMessage,
    )

    // Only open the app when the shade notification could not be shown.
    if (launchUi || !posted) {
      val launch = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_TITLE, title)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_MESSAGE, alertMessage.ifBlank { body })
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_BODY, body)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS, expiresAtMs)
      }
      try {
        context.startActivity(launch)
      } catch (_: Exception) {
        /* background start may still be blocked on some OEMs */
      }
    }
  }

  private fun scheduleFromPayload(context: Context) {
    val payload = readPayload(context) ?: return
    val now = System.currentTimeMillis()
    val expiresAtMs = payload.optLong("expiresAtMs", 0L)
    if (expiresAtMs <= now) {
      cancelScheduled(context, clearNotification = true)
      return
    }

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val reminders = payload.optJSONArray("reminders") ?: JSONArray()
    for (i in 0 until reminders.length()) {
      val item = reminders.getJSONObject(i)
      val triggerAtMs = item.optLong("triggerAtMs", 0L)
      val code = item.optInt("alarmRequestCode", 0)
      if (code == 0 || triggerAtMs <= now + 2_000L) continue
      if (triggerAtMs >= expiresAtMs) continue

      val reminder = Reminder(
        thresholdMin = item.optInt("thresholdMin", 0),
        title = item.optString("title"),
        body = item.optString("body"),
        alertMessage = item.optString("alertMessage"),
        triggerAtMs = triggerAtMs,
        expiresAtMs = expiresAtMs,
        alarmRequestCode = code,
      )

      // Primary: AlarmClock -> Activity (reliable on Samsung after Home / Recents).
      // MainActivity posts the shade notification then yields to the launcher.
      setAlarmClock(
        alarmManager,
        triggerAtMs,
        activityPendingIntent(context, reminder, code),
        context,
      )
      // Backup: exact broadcast posts the tray even if the activity path is deferred.
      setExactBackup(
        alarmManager,
        triggerAtMs + 1_500L,
        broadcastPendingIntent(context, reminder, code + 5000),
      )
    }

    setAlarmClock(alarmManager, expiresAtMs, clearPendingIntent(context), context)
    scheduleWatchdog(context, expiresAtMs)
  }

  private fun scheduleWatchdog(context: Context, expiresAtMs: Long) {
    val now = System.currentTimeMillis()
    if (expiresAtMs <= now + 5_000L) return
    val next = (now + WATCHDOG_INTERVAL_MS).coerceAtMost(expiresAtMs)
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    setAlarmClock(alarmManager, next, watchdogPendingIntent(context), context)
  }

  private fun setAlarmClock(
    alarmManager: AlarmManager,
    triggerAtMs: Long,
    operation: PendingIntent,
    context: Context,
  ) {
    val showIntent = PendingIntent.getActivity(
      context,
      9300 + (operation.hashCode() and 0x0fff),
      Intent(context, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAtMs, showIntent), operation)
    } catch (_: Exception) {
      setExactBackup(alarmManager, triggerAtMs, operation)
    }
  }

  private fun setExactBackup(
    alarmManager: AlarmManager,
    triggerAtMs: Long,
    operation: PendingIntent,
  ) {
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

  private fun activityPendingIntent(
    context: Context,
    reminder: Reminder,
    requestCode: Int,
  ): PendingIntent {
    val intent = Intent(context, MainActivity::class.java).apply {
      action = "com.blugreenfac.crulynk.shift.OPEN_REMINDER_$requestCode"
      flags = Intent.FLAG_ACTIVITY_NEW_TASK or
        Intent.FLAG_ACTIVITY_CLEAR_TOP or
        Intent.FLAG_ACTIVITY_SINGLE_TOP
      putExtra(MainActivity.EXTRA_SHIFT_REMINDER_TITLE, reminder.title)
      putExtra(MainActivity.EXTRA_SHIFT_REMINDER_MESSAGE, reminder.alertMessage.ifBlank { reminder.body })
      putExtra(MainActivity.EXTRA_SHIFT_REMINDER_BODY, reminder.body)
      putExtra(MainActivity.EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS, reminder.expiresAtMs)
      putExtra(MainActivity.EXTRA_SHIFT_REMINDER_THRESHOLD, reminder.thresholdMin)
    }
    return PendingIntent.getActivity(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun broadcastPendingIntent(
    context: Context,
    reminder: Reminder,
    requestCode: Int,
  ): PendingIntent {
    val intent = Intent(context, ShiftReminderReceiver::class.java).apply {
      action = ShiftReminderReceiver.ACTION_FIRE
      putExtra(ShiftReminderReceiver.EXTRA_TITLE, reminder.title)
      putExtra(ShiftReminderReceiver.EXTRA_BODY, reminder.body)
      putExtra(ShiftReminderReceiver.EXTRA_ALERT_MESSAGE, reminder.alertMessage)
      putExtra(
        ShiftReminderReceiver.EXTRA_NOTIFICATION_ID,
        ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
      )
      putExtra(ShiftReminderReceiver.EXTRA_EXPIRES_AT_MS, reminder.expiresAtMs)
      putExtra(ShiftReminderReceiver.EXTRA_THRESHOLD_MIN, reminder.thresholdMin)
      putExtra(ShiftReminderReceiver.EXTRA_ALARM_REQUEST_CODE, requestCode)
    }
    return PendingIntent.getBroadcast(
      context,
      requestCode,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun watchdogPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, ShiftReminderReceiver::class.java).apply {
      action = ShiftReminderReceiver.ACTION_WATCHDOG
    }
    return PendingIntent.getBroadcast(
      context,
      WATCHDOG_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun clearPendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, ShiftReminderReceiver::class.java).apply {
      action = ShiftReminderReceiver.ACTION_CLEAR
      putExtra(
        ShiftReminderReceiver.EXTRA_NOTIFICATION_ID,
        ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
      )
    }
    return PendingIntent.getBroadcast(
      context,
      CLEAR_REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun readPayload(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_PAYLOAD, null)
      ?: return null
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      null
    }
  }

  fun alarmRequestCodeForThreshold(thresholdMin: Int): Int = 2100 + thresholdMin

  /** Arms a one-shot demo reminder for QA (AlarmClock + tray), independent of shift API. */
  fun armTestReminder(context: Context, delaySeconds: Int) {
    val delayMs = delaySeconds.coerceIn(5, 600) * 1000L
    val triggerAtMs = System.currentTimeMillis() + delayMs
    val expiresAtMs = triggerAtMs + 30 * 60_000L
    val reminder = Reminder(
      thresholdMin = 15,
      title = "Shift reminder test",
      body = "CruLynk background alert works. This popup was scheduled while the app was armed.",
      alertMessage = "Background shift reminder test succeeded. If you see this after clearing Recents, delivery is working.",
      triggerAtMs = triggerAtMs,
      expiresAtMs = expiresAtMs,
      alarmRequestCode = 2199,
    )
    saveAndSchedule(context, listOf(reminder))
  }
}
