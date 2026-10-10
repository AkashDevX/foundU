package com.blugreenfac.crulynk.documents

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import com.blugreenfac.crulynk.MainActivity
import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/**
 * One local alarm per day at 09:00 until the renewed document list is cleared.
 * If the app is opened after 09:00 and today's reminder has not fired, it posts immediately.
 */
internal object DocumentRenewalScheduler {
  private const val PREFS = "foundu_document_renewal_v1"
  private const val KEY_ITEMS = "items"
  private const val KEY_FINGERPRINT = "fingerprint"
  private const val KEY_LAST_NOTIFIED = "last_notified_ymd"
  private const val KEY_HAS_DOCS = "has_docs"
  private const val WINDOW_DAYS = 30
  private const val REQUEST_CODE = 3101

  const val ACTION_FIRE = "com.blugreenfac.crulynk.documents.FIRE_RENEWAL"

  fun sync(context: Context, documentsJson: String) {
    val due = dueItems(documentsJson)
    if (due.isEmpty()) {
      cancel(context)
      return
    }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val fingerprint = fingerprintFor(due)
    val previous = prefs.getString(KEY_FINGERPRINT, null)
    prefs.edit()
      .putString(KEY_ITEMS, JSONArray().apply { due.forEach { put(it) } }.toString())
      .putString(KEY_FINGERPRINT, fingerprint)
      .putBoolean(KEY_HAS_DOCS, true)
      .apply()
    val copy = reminderCopy(due) ?: return
    if (previous != null && previous != fingerprint && prefs.getString(KEY_LAST_NOTIFIED, null) == todayKey()) {
      DocumentRenewalNotifier.post(context, copy.first, copy.second)
    }
    ensureScheduled(context, postIfMissedToday = true)
  }

  fun cancel(context: Context) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    alarmManager.cancel(firePendingIntent(context))
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply()
    DocumentRenewalNotifier.cancel(context)
  }

  fun rescheduleFromStorage(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(KEY_HAS_DOCS, false)) return
    ensureScheduled(context, postIfMissedToday = true)
  }

  fun onFire(context: Context) {
    val copy = currentCopy(context)
    if (copy == null) {
      cancel(context)
      return
    }
    DocumentRenewalNotifier.post(context, copy.first, copy.second)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_NOTIFIED, todayKey())
      .apply()
    scheduleAt(context, nextNine(afterToday = true))
  }

  private fun ensureScheduled(context: Context, postIfMissedToday: Boolean) {
    val copy = currentCopy(context)
    if (copy == null) {
      cancel(context)
      return
    }
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val todayNine = nextNine(afterToday = false)
    val today = todayKey()
    val last = prefs.getString(KEY_LAST_NOTIFIED, null)
    if (postIfMissedToday && now >= todayNine && last != today) {
      DocumentRenewalNotifier.post(context, copy.first, copy.second)
      prefs.edit().putString(KEY_LAST_NOTIFIED, today).apply()
      scheduleAt(context, nextNine(afterToday = true))
      return
    }
    val trigger = if (now < todayNine) todayNine else nextNine(afterToday = true)
    scheduleAt(context, trigger)
  }

  /** Rebuilds the reminder from stored expiries. Returns null when every document has been renewed. */
  private fun currentCopy(context: Context): Pair<String, String>? {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    if (!prefs.getBoolean(KEY_HAS_DOCS, false)) return null
    val due = dueItems(prefs.getString(KEY_ITEMS, null))
    if (due.isEmpty()) return null
    return reminderCopy(due)
  }

  private fun dueItems(raw: String?): List<JSONObject> {
    if (raw.isNullOrBlank()) return emptyList()
    return try {
      val array = JSONArray(raw)
      val today = startOfToday()
      val due = mutableListOf<JSONObject>()
      for (i in 0 until array.length()) {
        val item = array.optJSONObject(i) ?: continue
        val label = item.optString("label").trim()
        val expiry = item.optString("expiry").trim()
        val days = daysUntil(expiry, today) ?: continue
        if (label.isEmpty() || days > WINDOW_DAYS) continue
        due.add(
          JSONObject()
            .put("label", label)
            .put("expiry", expiry)
            .put("daysUntil", days)
            .put("status", if (days < 0) "expired" else "expiring"),
        )
      }
      due
    } catch (_: Exception) {
      emptyList()
    }
  }

  private fun reminderCopy(items: List<JSONObject>): Pair<String, String>? {
    if (items.isEmpty()) return null
    val sentences = items.joinToString(" ") { reminderSentence(it) }
    val body = "$sentences Open My profile to upload the renewed document and set the new expiry. This reminder repeats every day until you submit it."
    val title = if (items.size == 1) reminderTitle(items[0]) else "Documents need renewing"
    return title to body
  }

  private fun dayWord(days: Int): String = if (Math.abs(days) == 1) "day" else "days"

  private fun reminderSentence(item: JSONObject): String {
    val label = item.optString("label")
    val days = item.optInt("daysUntil")
    return when {
      days < 0 || item.optString("status") == "expired" -> {
        val ago = Math.abs(days)
        "Your $label expired $ago ${dayWord(ago)} ago. Please renew it."
      }
      days == 0 -> "Your $label expires today. Please renew it."
      else -> "Your $label expires in $days ${dayWord(days)}. Please renew it."
    }
  }

  private fun reminderTitle(item: JSONObject): String {
    val label = item.optString("label")
    val days = item.optInt("daysUntil")
    return when {
      days < 0 || item.optString("status") == "expired" -> {
        val ago = Math.abs(days)
        "Your $label expired $ago ${dayWord(ago)} ago"
      }
      days == 0 -> "Your $label expires today"
      else -> "Your $label expires in $days ${dayWord(days)}"
    }
  }

  private fun fingerprintFor(items: List<JSONObject>): String {
    return items.joinToString("|") { "${it.optString("label")}@${it.optString("expiry")}" }.lowercase()
  }

  private fun daysUntil(iso: String, today: Calendar): Int? {
    val parts = iso.split("-")
    if (parts.size != 3) return null
    val year = parts[0].toIntOrNull() ?: return null
    val month = parts[1].toIntOrNull() ?: return null
    val day = parts[2].toIntOrNull() ?: return null
    val expiry = Calendar.getInstance().apply {
      set(Calendar.YEAR, year)
      set(Calendar.MONTH, month - 1)
      set(Calendar.DAY_OF_MONTH, day)
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
    if (expiry.get(Calendar.YEAR) != year || expiry.get(Calendar.MONTH) != month - 1 || expiry.get(Calendar.DAY_OF_MONTH) != day) {
      return null
    }
    return Math.round((expiry.timeInMillis - today.timeInMillis) / 86_400_000.0).toInt()
  }

  private fun startOfToday(): Calendar {
    return Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 0)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
    }
  }

  private fun scheduleAt(context: Context, triggerAtMs: Long) {
    val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
    val operation = firePendingIntent(context)
    val showIntent = PendingIntent.getActivity(
      context,
      REQUEST_CODE + 1,
      Intent(context, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    try {
      alarmManager.setAlarmClock(AlarmManager.AlarmClockInfo(triggerAtMs, showIntent), operation)
    } catch (_: Exception) {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
          alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAtMs, operation)
        } else {
          @Suppress("DEPRECATION")
          alarmManager.setExact(AlarmManager.RTC_WAKEUP, triggerAtMs, operation)
        }
      } catch (_: Exception) {
        /* OEM blocked the alarm; the next app open reschedules it */
      }
    }
  }

  private fun firePendingIntent(context: Context): PendingIntent {
    val intent = Intent(context, DocumentRenewalReceiver::class.java).apply {
      action = ACTION_FIRE
    }
    return PendingIntent.getBroadcast(
      context,
      REQUEST_CODE,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun todayKey(): String {
    val calendar = Calendar.getInstance()
    return "%04d-%02d-%02d".format(
      calendar.get(Calendar.YEAR),
      calendar.get(Calendar.MONTH) + 1,
      calendar.get(Calendar.DAY_OF_MONTH),
    )
  }

  /** Today's 09:00, or tomorrow's 09:00 when [afterToday] is true. */
  private fun nextNine(afterToday: Boolean): Long {
    val calendar = Calendar.getInstance().apply {
      set(Calendar.HOUR_OF_DAY, 9)
      set(Calendar.MINUTE, 0)
      set(Calendar.SECOND, 0)
      set(Calendar.MILLISECOND, 0)
      if (afterToday) {
        add(Calendar.DAY_OF_YEAR, 1)
      }
    }
    return calendar.timeInMillis
  }
}
