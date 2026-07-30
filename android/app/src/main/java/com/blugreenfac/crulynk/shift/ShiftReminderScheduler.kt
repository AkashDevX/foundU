package com.blugreenfac.crulynk.shift

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.PowerManager
import com.blugreenfac.crulynk.MainActivity
import org.json.JSONArray
import org.json.JSONObject

/**
 * Persists shift reminder alarms and schedules them with [AlarmManager.setAlarmClock].
 *
 * Primary delivery is AlarmClock -> Broadcast (posts the shade notification even after
 * Recents swipe). Exact activity + broadcast backups cover OEM quirks.
 */
internal object ShiftReminderScheduler {
  private const val PREFS = "foundu_shift_reminder_schedule_v1"
  private const val KEY_PAYLOAD = "payload"
  private const val KEY_FINGERPRINT = "fingerprint"
  private const val WATCHDOG_REQUEST_CODE = 2299
  private const val CLEAR_REQUEST_CODE = 2298
  private const val WATCHDOG_INTERVAL_MS = 90_000L

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
    val fingerprint = fingerprintFor(reminders)
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val existing = prefs.getString(KEY_FINGERPRINT, null)

    // Same schedule: do not cancel (that race drops alarms if the process dies mid-write).
    // Still re-apply AlarmClock entries in case the OEM dropped them after Recents swipe.
    if (reminders.isNotEmpty() && existing == fingerprint && prefs.getString(KEY_PAYLOAD, null) != null) {
      scheduleFromPayload(context)
      return
    }

    cancelScheduled(context, clearNotification = false)
    ShiftReminderNotifier.clearDeliveryFlags(context)
    if (reminders.isEmpty()) {
      prefs.edit().clear().apply()
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
    prefs.edit()
      .clear()
      .putString(KEY_FINGERPRINT, fingerprint)
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
          cancelReminderAlarms(alarmManager, context, reminder, code)
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
    } else {
      ShiftReminderNotifier.clearPendingAlert(context)
    }
  }

  fun onWatchdog(context: Context) {
    val wakeLock = acquireBriefWakeLock(context, "crulynk:shift-watchdog")
    try {
      val now = System.currentTimeMillis()
      val payload = readPayload(context) ?: return
      val expiresAtMs = payload.optLong("expiresAtMs", 0L)

      // Shift started, or under 15 minutes left: stop all reminder popups permanently.
      if (!isReminderPopupWindowOpen(expiresAtMs)) {
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
        if (!ShiftReminderNotifier.hasDeliveredThreshold(context, threshold)) {
          deliverReminder(
            context = context,
            title = due.optString("title", "Shift coming soon"),
            body = due.optString("body", "Your assigned shift is almost here."),
            alertMessage = due.optString("alertMessage", due.optString("body")),
            expiresAtMs = expiresAtMs,
            thresholdMin = threshold,
            launchUi = false,
          )
        }
      }

      // Still-future alarms may have been dropped by the OEM — re-arm them.
      scheduleFromPayload(context)
    } finally {
      releaseWakeLock(wakeLock)
    }
  }

  fun deliverReminder(
    context: Context,
    title: String,
    body: String,
    alertMessage: String,
    expiresAtMs: Long,
    thresholdMin: Int = 0,
    launchUi: Boolean,
  ) {
    if (!isReminderPopupWindowOpen(expiresAtMs)) {
      cancelScheduled(context, clearNotification = true)
      return
    }

    val posted = ShiftReminderNotifier.post(
      context = context,
      title = title,
      body = body,
      notificationId = ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
      expiresAtMs = expiresAtMs,
      alertMessage = alertMessage,
      thresholdMin = thresholdMin,
    )

    if (launchUi || !posted) {
      if (!isReminderPopupWindowOpen(expiresAtMs)) return
      val launch = Intent(context, MainActivity::class.java).apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK or
          Intent.FLAG_ACTIVITY_CLEAR_TOP or
          Intent.FLAG_ACTIVITY_SINGLE_TOP
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_TITLE, title)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_MESSAGE, alertMessage.ifBlank { body })
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_BODY, body)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS, expiresAtMs)
        putExtra(MainActivity.EXTRA_SHIFT_REMINDER_THRESHOLD, thresholdMin)
      }
      try {
        context.startActivity(launch)
      } catch (_: Exception) {
        /* background start may still be blocked on some OEMs */
      }
    }
  }

  /**
   * Popup reminders are allowed only while at least 15 minutes remain before shift start.
   * After that (and after shift start) all reminder popups must stop.
   */
  fun isReminderPopupWindowOpen(expiresAtMs: Long, now: Long = System.currentTimeMillis()): Boolean {
    if (expiresAtMs <= 0L) return false
    if (now >= expiresAtMs) return false
    return now < popupSilenceAtMs(expiresAtMs)
  }

  /** Moment when under-15-minutes silence begins (15 minutes before shift start). */
  fun popupSilenceAtMs(expiresAtMs: Long): Long = expiresAtMs - 15L * 60_000L + 30_000L

  private fun scheduleFromPayload(context: Context) {
    val payload = readPayload(context) ?: return
    val now = System.currentTimeMillis()
    val expiresAtMs = payload.optLong("expiresAtMs", 0L)
    if (!isReminderPopupWindowOpen(expiresAtMs, now)) {
      cancelScheduled(context, clearNotification = true)
      return
    }

    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val reminders = payload.optJSONArray("reminders") ?: JSONArray()
    for (i in 0 until reminders.length()) {
      val item = reminders.getJSONObject(i)
      val triggerAtMs = item.optLong("triggerAtMs", 0L)
      val code = item.optInt("alarmRequestCode", 0)
      val threshold = item.optInt("thresholdMin", 0)
      if (code == 0 || triggerAtMs <= now + 2_000L) continue
      if (triggerAtMs >= expiresAtMs) continue
      // Do not arm alarms that would fire after the under-15 silence window begins.
      if (triggerAtMs > popupSilenceAtMs(expiresAtMs)) continue
      if (ShiftReminderNotifier.hasDeliveredThreshold(context, threshold)) continue

      val reminder = Reminder(
        thresholdMin = threshold,
        title = item.optString("title"),
        body = item.optString("body"),
        alertMessage = item.optString("alertMessage"),
        triggerAtMs = triggerAtMs,
        expiresAtMs = expiresAtMs,
        alarmRequestCode = code,
      )

      // Primary: AlarmClock -> Broadcast posts shade notification (survives Recents).
      setAlarmClock(
        alarmManager,
        triggerAtMs,
        broadcastPendingIntent(context, reminder, code),
        context,
      )
      // Single exact backup (deduped in Notifier so it will not re-alert).
      setExactBackup(
        alarmManager,
        triggerAtMs + 1_500L,
        broadcastPendingIntent(context, reminder, code + 5000),
      )
    }

    // Clear tray / schedule once we enter under-15 silence (or at shift start as fallback).
    val silenceAt = popupSilenceAtMs(expiresAtMs)
    val clearAt = if (silenceAt > now + 2_000L) silenceAt else expiresAtMs
    setAlarmClock(alarmManager, clearAt, clearPendingIntent(context), context)
    scheduleWatchdog(context, clearAt)
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

  private fun cancelReminderAlarms(
    alarmManager: AlarmManager,
    context: Context,
    reminder: Reminder,
    code: Int,
  ) {
    alarmManager.cancel(broadcastPendingIntent(context, reminder, code))
    alarmManager.cancel(broadcastPendingIntent(context, reminder, code + 5000))
    alarmManager.cancel(activityPendingIntent(context, reminder, code))
    alarmManager.cancel(activityPendingIntent(context, reminder, code + 7000))
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

  private fun fingerprintFor(reminders: List<Reminder>): String {
    if (reminders.isEmpty()) return "empty"
    return reminders
      .sortedBy { it.alarmRequestCode }
      .joinToString("|") {
        "${it.alarmRequestCode}:${it.triggerAtMs}:${it.expiresAtMs}:${it.thresholdMin}"
      }
  }

  private fun acquireBriefWakeLock(context: Context, tag: String): PowerManager.WakeLock? {
    return try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, tag).apply {
        setReferenceCounted(false)
        acquire(15_000L)
      }
    } catch (_: Exception) {
      null
    }
  }

  private fun releaseWakeLock(wakeLock: PowerManager.WakeLock?) {
    try {
      if (wakeLock?.isHeld == true) wakeLock.release()
    } catch (_: Exception) {
      /* ignore */
    }
  }

  fun alarmRequestCodeForThreshold(thresholdMin: Int): Int = 2100 + thresholdMin
}
