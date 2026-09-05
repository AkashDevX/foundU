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
    if (existing != null) return

    val channel = NotificationChannel(
      CHANNEL_ID,
      "Chat messages",
      NotificationManager.IMPORTANCE_HIGH,
    ).apply {
      description = "New messages in CruLynk chat"
      enableVibration(true)
    }
    manager.createNotificationChannel(channel)
  }
}
