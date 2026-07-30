package com.blugreenfac.crulynk

import android.content.Intent
import android.os.Bundle
import com.blugreenfac.crulynk.shift.ShiftReminderNotifier
import com.blugreenfac.crulynk.shift.ShiftReminderReceiver
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

    val message = intent.getStringExtra(EXTRA_SHIFT_REMINDER_MESSAGE)?.trim().orEmpty()
      .ifEmpty { intent.getStringExtra(EXTRA_SHIFT_REMINDER_BODY)?.trim().orEmpty() }
      .ifEmpty { "Your assigned shift is coming up soon." }
    val body = intent.getStringExtra(EXTRA_SHIFT_REMINDER_BODY)?.trim().orEmpty()
      .ifEmpty { message }
    val expiresAtMs = intent.getLongExtra(EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS, 0L)
      .takeIf { it > System.currentTimeMillis() }
      ?: (System.currentTimeMillis() + 30 * 60_000L)

    // Always post/refresh the system tray notification first.
    ShiftReminderNotifier.post(
      context = this,
      title = title,
      body = body,
      notificationId = ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID,
      expiresAtMs = expiresAtMs,
      alertMessage = message,
    )

    // Ensure JS SweetAlert can pick this up if the user opens the app.
    getSharedPreferences(ShiftReminderReceiver.PREFS, MODE_PRIVATE)
      .edit()
      .putString(ShiftReminderReceiver.KEY_PENDING_TITLE, title)
      .putString(ShiftReminderReceiver.KEY_PENDING_MESSAGE, message)
      .apply()

    // Prevent repeat handling on rotation / recreate.
    intent.removeExtra(EXTRA_SHIFT_REMINDER_TITLE)
    intent.removeExtra(EXTRA_SHIFT_REMINDER_MESSAGE)
    intent.removeExtra(EXTRA_SHIFT_REMINDER_BODY)

    // Yield immediately so the heads-up / shade popup stays visible instead of
    // feeling like an in-app-only alert after AlarmClock wakes the process.
    window.decorView.post {
      moveTaskToBack(true)
    }
  }

  companion object {
    const val EXTRA_SHIFT_REMINDER_TITLE = "shift_reminder_title"
    const val EXTRA_SHIFT_REMINDER_MESSAGE = "shift_reminder_message"
    const val EXTRA_SHIFT_REMINDER_BODY = "shift_reminder_body"
    const val EXTRA_SHIFT_REMINDER_EXPIRES_AT_MS = "shift_reminder_expires_at_ms"
    const val EXTRA_SHIFT_REMINDER_THRESHOLD = "shift_reminder_threshold"
  }
}
