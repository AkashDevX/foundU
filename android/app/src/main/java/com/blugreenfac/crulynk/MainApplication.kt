package com.blugreenfac.crulynk

import android.app.Application
import com.facebook.react.PackageList
import com.facebook.react.ReactApplication
import com.facebook.react.ReactHost
import com.facebook.react.ReactNativeApplicationEntryPoint.loadReactNative
import com.facebook.react.defaults.DefaultReactHost.getDefaultReactHost
import com.blugreenfac.crulynk.chat.ChatPushChannels
import com.blugreenfac.crulynk.location.LocationMonitorPackage
import com.blugreenfac.crulynk.shift.ShiftReminderPackage

class MainApplication : Application(), ReactApplication {

  override val reactHost: ReactHost by lazy {
    getDefaultReactHost(
      context = applicationContext,
      packageList =
        PackageList(this).packages.apply {
          add(LocationMonitorPackage())
          add(ShiftReminderPackage())
        },
    )
  }

  override fun onCreate() {
    super.onCreate()
    ChatPushChannels.ensure(this)
    loadReactNative(this)
  }
}
