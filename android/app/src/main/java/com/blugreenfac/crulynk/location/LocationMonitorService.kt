package com.blugreenfac.crulynk.location

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.blugreenfac.crulynk.MainActivity

class LocationMonitorService : Service() {
  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
          @Suppress("DEPRECATION")
          stopForeground(true)
        }
        stopSelf()
        return START_NOT_STICKY
      }
      else -> {
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification())
        return START_STICKY
      }
    }
  }

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "Work site monitoring",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Monitors your location while you are clocked in"
      setShowBadge(false)
    }
    getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification {
    val openAppIntent = PendingIntent.getActivity(
      this,
      0,
      Intent(this, MainActivity::class.java),
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    return NotificationCompat.Builder(this, CHANNEL_ID)
      .setContentTitle("Clocked in")
      .setContentText("Monitoring work site location")
      .setSmallIcon(android.R.drawable.ic_menu_mylocation)
      .setContentIntent(openAppIntent)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .build()
  }

  companion object {
    const val CHANNEL_ID = "com.blugreenfac.crulynk.location_monitor"
    const val NOTIFICATION_ID = 1001
    const val ACTION_START = "com.blugreenfac.crulynk.location.START"
    const val ACTION_STOP = "com.blugreenfac.crulynk.location.STOP"
  }
}
