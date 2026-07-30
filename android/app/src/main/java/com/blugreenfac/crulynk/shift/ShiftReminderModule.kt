package com.blugreenfac.crulynk.shift

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import androidx.core.app.NotificationManagerCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import com.facebook.react.bridge.ReadableMap
import com.facebook.react.bridge.ReadableType
import com.facebook.react.bridge.WritableMap

class ShiftReminderModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "ShiftReminder"

  @ReactMethod
  fun isAvailable(promise: Promise) {
    promise.resolve(true)
  }

  @ReactMethod
  fun areNotificationsEnabled(promise: Promise) {
    try {
      promise.resolve(NotificationManagerCompat.from(context).areNotificationsEnabled())
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_ENABLED_CHECK_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun canScheduleExactAlarms(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        promise.resolve(true)
        return
      }
      val alarmManager =
        context.getSystemService(Context.ALARM_SERVICE) as android.app.AlarmManager
      promise.resolve(alarmManager.canScheduleExactAlarms())
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_EXACT_ALARM_CHECK_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openExactAlarmSettings(promise: Promise) {
    try {
      val intent = Intent().apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
          action = Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM
          data = Uri.parse("package:${context.packageName}")
        } else {
          action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
          data = Uri.fromParts("package", context.packageName, null)
        }
      }
      context.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_OPEN_EXACT_ALARM_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun showNow(
    title: String,
    body: String,
    notificationId: Int,
    expiresAtMs: Double,
    promise: Promise,
  ) {
    try {
      val safeTitle = title.trim().ifEmpty { "Shift coming soon" }
      val safeBody = body.trim().ifEmpty { "Your assigned shift is almost here." }
      val expireAt = expiresAtMs.toLong().takeIf { it > System.currentTimeMillis() }
        ?: (System.currentTimeMillis() + 60_000L)

      Handler(Looper.getMainLooper()).post {
        ShiftReminderNotifier.post(
          context = context,
          title = safeTitle,
          body = safeBody,
          notificationId = if (notificationId == 0) {
            ShiftReminderNotifier.ACTIVE_NOTIFICATION_ID
          } else {
            notificationId
          },
          expiresAtMs = expireAt,
        )
      }

      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_SHOW_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun scheduleReminders(reminders: ReadableArray, promise: Promise) {
    try {
      val now = System.currentTimeMillis()
      val parsed = mutableListOf<ShiftReminderScheduler.Reminder>()

      for (i in 0 until reminders.size()) {
        val item = reminders.getMap(i) ?: continue
        val title = readString(item, "title")
        val body = readString(item, "body")
        val alertMessage = readString(item, "alertMessage")
        val triggerAtMs = readLong(item, "triggerAtMs")
        val expiresAtMs = readLong(item, "expiresAtMs")
        val thresholdMin = readInt(item, "thresholdMin").takeIf { it > 0 }
          ?: inferThreshold(triggerAtMs, expiresAtMs)
        if (title.isEmpty() || body.isEmpty()) continue
        if (expiresAtMs > 0L && expiresAtMs <= now) continue
        // Allow near-term triggers so background delivery still works after swipe-away.
        val safeTrigger = if (triggerAtMs <= now + 2_000L) now + 5_000L else triggerAtMs
        if (safeTrigger >= expiresAtMs && expiresAtMs > 0L) continue

        parsed.add(
          ShiftReminderScheduler.Reminder(
            thresholdMin = thresholdMin,
            title = title,
            body = body,
            alertMessage = alertMessage.ifEmpty { body },
            triggerAtMs = safeTrigger,
            expiresAtMs = expiresAtMs,
            alarmRequestCode = ShiftReminderScheduler.alarmRequestCodeForThreshold(thresholdMin),
          ),
        )
      }

      ShiftReminderScheduler.saveAndSchedule(context, parsed)
      promise.resolve(parsed.size)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_SCHEDULE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancelReminders(notificationIds: ReadableArray, promise: Promise) {
    try {
      ShiftReminderScheduler.cancelScheduled(context, clearNotification = true)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_CANCEL_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancelActive(promise: Promise) {
    try {
      ShiftReminderNotifier.cancelAllActive(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_CANCEL_ACTIVE_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun wasDelivered(notificationId: Int, promise: Promise) {
    try {
      val prefs = context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
      promise.resolve(prefs.getBoolean(ShiftReminderReceiver.firedKey(notificationId), false))
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_WAS_DELIVERED_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun openNotificationSettings(promise: Promise) {
    try {
      // Prefer the dedicated app-notification screen so the master toggle is obvious.
      val intent = Intent().apply {
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          action = Settings.ACTION_APP_NOTIFICATION_SETTINGS
          putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName)
          putExtra("android.provider.extra.APP_PACKAGE", context.packageName)
          putExtra("app_package", context.packageName)
          putExtra("app_uid", context.applicationInfo.uid)
        } else {
          action = Settings.ACTION_APPLICATION_DETAILS_SETTINGS
          data = Uri.fromParts("package", context.packageName, null)
        }
      }
      context.startActivity(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_OPEN_SETTINGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        promise.resolve(true)
        return
      }
      val power = context.getSystemService(Context.POWER_SERVICE) as android.os.PowerManager
      if (power.isIgnoringBatteryOptimizations(context.packageName)) {
        promise.resolve(true)
        return
      }
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
        data = Uri.parse("package:${context.packageName}")
        flags = Intent.FLAG_ACTIVITY_NEW_TASK
      }
      context.startActivity(intent)
      promise.resolve(false)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_BATTERY_OPT_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun armTestReminder(delaySeconds: Int, promise: Promise) {
    try {
      ShiftReminderScheduler.armTestReminder(context, delaySeconds)
      promise.resolve(delaySeconds)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_ARM_TEST_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun clearDeliveryFlags(promise: Promise) {
    try {
      ShiftReminderNotifier.clearDeliveryFlags(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_CLEAR_FLAGS_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun consumePendingAlert(promise: Promise) {
    try {
      val prefs = context.getSharedPreferences(ShiftReminderReceiver.PREFS, Context.MODE_PRIVATE)
      val title = prefs.getString(ShiftReminderReceiver.KEY_PENDING_TITLE, null)
      val message = prefs.getString(ShiftReminderReceiver.KEY_PENDING_MESSAGE, null)
      if (title.isNullOrBlank() || message.isNullOrBlank()) {
        promise.resolve(null)
        return
      }
      prefs.edit()
        .remove(ShiftReminderReceiver.KEY_PENDING_TITLE)
        .remove(ShiftReminderReceiver.KEY_PENDING_MESSAGE)
        .apply()
      val map: WritableMap = Arguments.createMap()
      map.putString("title", title)
      map.putString("message", message)
      promise.resolve(map)
    } catch (error: Exception) {
      promise.reject("SHIFT_REMINDER_CONSUME_PENDING_FAILED", error.message, error)
    }
  }

  private fun inferThreshold(triggerAtMs: Long, expiresAtMs: Long): Int {
    val minutes = ((expiresAtMs - triggerAtMs) / 60_000L).toInt()
    return when {
      minutes <= 15 -> 15
      minutes <= 30 -> 30
      else -> 60
    }
  }

  private fun readString(map: ReadableMap, key: String): String {
    if (!map.hasKey(key) || map.isNull(key)) return ""
    return when (map.getType(key)) {
      ReadableType.String -> map.getString(key)?.trim().orEmpty()
      ReadableType.Number -> map.getDouble(key).toString()
      else -> ""
    }
  }

  private fun readLong(map: ReadableMap, key: String): Long {
    if (!map.hasKey(key) || map.isNull(key)) return 0L
    return when (map.getType(key)) {
      ReadableType.Number -> map.getDouble(key).toLong()
      ReadableType.String -> map.getString(key)?.toLongOrNull() ?: 0L
      else -> 0L
    }
  }

  private fun readInt(map: ReadableMap, key: String): Int {
    if (!map.hasKey(key) || map.isNull(key)) return 0
    return when (map.getType(key)) {
      ReadableType.Number -> map.getDouble(key).toInt()
      ReadableType.String -> map.getString(key)?.toIntOrNull() ?: 0
      else -> 0
    }
  }
}
