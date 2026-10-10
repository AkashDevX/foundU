package com.blugreenfac.crulynk.documents

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager

class DocumentRenewalReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent?) {
    when (intent?.action) {
      DocumentRenewalScheduler.ACTION_FIRE -> {
        val pending = goAsync()
        val wakeLock = acquireBriefWakeLock(context)
        try {
          DocumentRenewalScheduler.onFire(context)
        } finally {
          try {
            if (wakeLock?.isHeld == true) wakeLock.release()
          } catch (_: Exception) {
            /* ignore */
          }
          pending.finish()
        }
      }
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_LOCKED_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      "android.intent.action.QUICKBOOT_POWERON",
      -> DocumentRenewalScheduler.rescheduleFromStorage(context)
    }
  }

  private fun acquireBriefWakeLock(context: Context): PowerManager.WakeLock? {
    return try {
      val pm = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "crulynk:document-renewal").apply {
        setReferenceCounted(false)
        acquire(15_000L)
      }
    } catch (_: Exception) {
      null
    }
  }
}
