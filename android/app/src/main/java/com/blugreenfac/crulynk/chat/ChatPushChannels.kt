package com.blugreenfac.crulynk.chat

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.os.Build

object ChatPushChannels {
  const val CHANNEL_ID = "chat_messages"

  fun ensure(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java) ?: return
    val existing = manager.getNotificationChannel(CHANNEL_ID)
    if (existing != null) {
      existing.lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
      existing.enableVibration(true)
      existing.setShowBadge(true)
      manager.createNotificationChannel(existing)
      return
    }

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Chat messages",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "New messages in CruLynk chat"
      enableVibration(true)
      enableLights(true)
      setShowBadge(true)
      lockscreenVisibility = android.app.Notification.VISIBILITY_PUBLIC
    }
    manager.createNotificationChannel(channel)
  }
}
