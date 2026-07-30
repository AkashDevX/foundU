package com.blugreenfac.crulynk.location

import android.content.Intent
import android.os.Build
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class LocationMonitorModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  override fun getName(): String = "LocationMonitor"

  @ReactMethod
  fun startMonitoring(promise: Promise) {
    try {
      val intent = Intent(context, LocationMonitorService::class.java).apply {
        action = LocationMonitorService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        context.startForegroundService(intent)
      } else {
        context.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("LOCATION_MONITOR_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopMonitoring(promise: Promise) {
    try {
      val intent = Intent(context, LocationMonitorService::class.java).apply {
        action = LocationMonitorService.ACTION_STOP
      }
      context.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("LOCATION_MONITOR_STOP_FAILED", error.message, error)
    }
  }
}
