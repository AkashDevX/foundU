package com.blugreenfac.crulynk

import android.content.Intent
import android.os.Bundle
import com.blugreenfac.crulynk.shift.ShiftReminderNotifier
import com.blugreenfac.crulynk.shift.ShiftReminderReceiver
import com.blugreenfac.crulynk.shift.ShiftReminderScheduler
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  override fun getMainComponentName(): String = "foundU"

  override fun createReactActivityDelegate(): ReactActivityDelegate =
    DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    handleShiftReminderIntent(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    setIntent(intent)
    handleShiftReminderIntent(intent)
  }

  private fun handleShiftReminderIntent(intent: Intent?) {
    if (intent == null) return
    val title = intent.getStringExtra(EXTRA_SHIFT_REMINDER_TITLE)?.trim().orEmpty()
    if (title.isEmpty()) return

    val expiresAtMs = intent.getLongExtra(EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS, 0L)
    // Stale alarm after shift start (or under 15 minutes left): never revive popups.
    if (!ShiftReminderScheduler.isReminderPopupWindowOpen(expiresAtMs)) {
      ShiftReminderScheduler.cancelScheduled(this, clearNotification = true)
      intent.removeExtra(EXTRA_SHIFT_REMINDER_TITLE)
      intent.removeExtra(EXTRA_SHIFT_REMINDER_MESSAGE)
      intent.removeExtra(EXTRA_SHIFT_REMINDER_BODY)
      return
    }

    val message = intent.getStringExtra(EXTRA_SHIFT_REMINDER_MESSAGE)?.trim().orEmpty()
      .ifEmpty { intent.getStringExtra(EXTRA_SHIFT_REMINDER_BODY)?.trim().orEmpty() }
      .ifEmpty { "Your assigned shift is coming up soon." }
    val body = intent.getStringExtra(EXTRA_SHIFT_REMINDER_BODY)?.trim().orEmpty()
      .ifEmpty { message }
    val threshold = intent.getIntExtra(EXTRA_SHIFT_REMINDER_THRESHOLD, 0)

    ShiftReminderNotifier.post(
      context = this,
      title = title,
      body = body,
      notificationId = ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
      expiresAtMs = expiresAtMs,
      alertMessage = message,
      thresholdMin = threshold,
    )

    // Prevent repeat handling on rotation / recreate.
    intent.removeExtra(EXTRA_SHIFT_REMINDER_TITLE)
    intent.removeExtra(EXTRA_SHIFT_REMINDER_MESSAGE)
    intent.removeExtra(EXTRA_SHIFT_REMINDER_BODY)
  }

  companion object {
    const val EXTRA_SHIFT_REMINDER_TITLE = "shift_reminder_title"
    const val EXTRA_SHIFT_REMINDER_MESSAGE = "shift_reminder_message"
    const val EXTRA_SHIFT_REMINDER_BODY = "shift_reminder_body"
    const val EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS = "shift_reminder_expires_at_ms"
    const val EXTRA_SHIFT_REMINDER_THRESHOLD = "shift_reminder_threshold"
  }
}
