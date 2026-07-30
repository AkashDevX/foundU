package com.blugreenfac.crulynk.shift

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class ShiftReminderReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      ACTION_CLEAR -> {
        ShiftReminderScheduler.cancelScheduled(context, clearNotification = true)
      }
      ACTION_WATCHDOG -> {
        ShiftReminderScheduler.onWatchdog(context)
      }
      ACTION_ARM_TEST -> {
        val seconds = intent.getIntExtra(EXTRA_TEST_DELAY_SECONDS, -1)
          .takeIf { it > 0 }
          ?: intent.getIntExtra("delay_sec", 45)
        ShiftReminderScheduler.armTestReminder(context, seconds)
      }
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      "android.intent.action.QUICKBOOT_POWERON",
      -> {
        ShiftReminderScheduler.rescheduleFromStorage(context)
      }
      else -> {
        val title = intent?.getStringExtra(EXTRA_TITLE)?.trim().orEmpty()
          .ifEmpty { "Shift coming soon" }
        val body = intent?.getStringExtra(EXTRA_BODY)?.trim().orEmpty()
          .ifEmpty { "Your assigned shift is almost here." }
        val alertMessage = intent?.getStringExtra(EXTRA_ALERT_MESSAGE)?.trim().orEmpty()
          .ifEmpty { body }
        val expiresAtMs = intent?.getLongExtra(EXTRA_EXPIRES_AT_MS, 0L)
          ?.takeIf { it > System.currentTimeMillis() }
          ?: (System.currentTimeMillis() + 60_000L)
        val threshold = intent?.getIntExtra(EXTRA_THRESHOLD_MIN, 0) ?: 0

        if (expiresAtMs <= System.currentTimeMillis()) {
          ShiftReminderScheduler.cancelScheduled(context, clearNotification = true)
          return
        }

        // Broadcast backup: post shade notification. Do not force-launch UI here
        // (AlarmClock Activity path already handles waking the app).
        ShiftReminderNotifier.post(
          context = context,
          title = title,
          body = body,
          notificationId = ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
          expiresAtMs = expiresAtMs,
          alertMessage = alertMessage,
        )

        if (threshold > 0) {
          context.getSharedPreferences("foundu_shift_reminder_schedule_v1", Context.MODE_PRIVATE)
            .edit()
            .putBoolean("watchdog_fired_$threshold", true)
            .apply()
        }
      }
    }
  }

  companion object {
    const val EXTRA_TITLE = "title"
    const val EXTRA_BODY = "body"
    const val EXTRA_ALERT_MESSAGE = "alert_message"
    const val EXTRA_NOTIFICATION_ID = "notification_id"
    const val EXTRA_EXPIRES_AT_MS = "expires_at_ms"
    const val EXTRA_THRESHOLD_MIN = "threshold_min"
    const val EXTRA_ALARM_REQUEST_CODE = "alarm_request_code"

    const val ACTION_FIRE = "com.blugreenfac.crulynk.shift.FIRE_REMINDER"
    const val ACTION_CLEAR = "com.blugreenfac.crulynk.shift.CLEAR_REMINDER"
    const val ACTION_WATCHDOG = "com.blugreenfac.crulynk.shift.WATCHDOG"
    const val ACTION_ARM_TEST = "com.blugreenfac.crulynk.shift.ARM_TEST"
    const val EXTRA_TEST_DELAY_SECONDS = "test_delay_seconds"

    const val PREFS = "foundu_shift_reminders"
    const val KEY_PENDING_TITLE = "pending_title"
    const val KEY_PENDING_MESSAGE = "pending_message"

    fun firedKey(notificationId: Int): String = "fired_$notificationId"
  }
}
