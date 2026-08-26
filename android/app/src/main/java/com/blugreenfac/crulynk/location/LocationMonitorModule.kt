package com.blugreenfac.crulynk.location

import android.Manifest
import android.content.ComponentName
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Process
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.PermissionAwareActivity
import com.facebook.react.modules.core.PermissionListener

class LocationMonitorModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "LocationMonitor"

  @ReactMethod
  fun startMonitoring(promise: Promise) {
    try {
      val intent = Intent(reactContext, LocationMonitorService::class.java).apply {
        action = LocationMonitorService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        reactContext.startForegroundService(intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("LOCATION_MONITOR_START_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun stopMonitoring(promise: Promise) {
    try {
      val intent = Intent(reactContext, LocationMonitorService::class.java).apply {
        action = LocationMonitorService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("LOCATION_MONITOR_STOP_FAILED", error.message, error)
    }
  }

  /**
   * Requests ACCESS_BACKGROUND_LOCATION through the current Activity.
   * On Android 11+ this opens the Location / "Allow all the time" UI.
   */
  @ReactMethod
  fun requestBackgroundLocation(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
        promise.resolve(true)
        return
      }

      if (
        ContextCompat.checkSelfPermission(
          reactContext,
          Manifest.permission.ACCESS_BACKGROUND_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
      ) {
        promise.resolve(true)
        return
      }

      val fineGranted =
        ContextCompat.checkSelfPermission(
          reactContext,
          Manifest.permission.ACCESS_FINE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED
      val coarseGranted =
        ContextCompat.checkSelfPermission(
          reactContext,
          Manifest.permission.ACCESS_COARSE_LOCATION,
        ) == PackageManager.PERMISSION_GRANTED

      if (!fineGranted && !coarseGranted) {
        promise.reject("FOREGROUND_REQUIRED", "Foreground location must be granted first")
        return
      }

      val activity = reactContext.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current activity")
        return
      }
      if (activity !is PermissionAwareActivity) {
        promise.reject("NO_PERMISSION_ACTIVITY", "Activity cannot request permissions")
        return
      }

      val listener =
        PermissionListener { requestCode, _, grantResults ->
          if (requestCode != REQUEST_BACKGROUND_LOCATION) {
            return@PermissionListener false
          }
          val granted =
            grantResults.isNotEmpty() &&
              grantResults[0] == PackageManager.PERMISSION_GRANTED
          promise.resolve(granted)
          true
        }

      activity.requestPermissions(
        arrayOf(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
        REQUEST_BACKGROUND_LOCATION,
        listener,
      )
    } catch (error: Exception) {
      promise.reject("REQUEST_BACKGROUND_LOCATION_FAILED", error.message, error)
    }
  }

  /**
   * Opens this app's Location permission page (Allow all the time / While using).
   * Never opens general App Info.
   */
  @ReactMethod
  fun openLocationPermissionScreen(promise: Promise) {
    try {
      val activity = reactContext.currentActivity
      if (activity == null) {
        promise.reject("NO_ACTIVITY", "No current activity")
        return
      }

      val packageName = reactContext.packageName

      fun tryStart(intent: Intent): Boolean {
        return try {
          activity.startActivity(intent)
          true
        } catch (_: Exception) {
          false
        }
      }

      fun baseIntent(permissionName: String): Intent {
        return Intent(ACTION_MANAGE_APP_PERMISSION).apply {
          addCategory(Intent.CATEGORY_DEFAULT)
          putExtra(EXTRA_PERMISSION_NAME, permissionName)
          putExtra(Intent.EXTRA_PACKAGE_NAME, packageName)
          putExtra(Intent.EXTRA_USER, Process.myUserHandle())
        }
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        // 1) Explicit Permission Controller components (most reliable for Location page).
        for (target in PERMISSION_CONTROLLER_COMPONENTS) {
          for (permissionName in LOCATION_PERMISSION_NAMES) {
            val intent =
              baseIntent(permissionName).apply {
                component = target
              }
            if (tryStart(intent)) {
              promise.resolve("explicit:${target.flattenToString()}:$permissionName")
              return
            }
          }
        }

        // 2) Package-scoped intents.
        for (controller in PERMISSION_CONTROLLER_PACKAGES) {
          for (permissionName in LOCATION_PERMISSION_NAMES) {
            val intent =
              baseIntent(permissionName).apply {
                setPackage(controller)
              }
            if (tryStart(intent)) {
              promise.resolve("package:$controller:$permissionName")
              return
            }
          }
        }

        // 3) Let the system resolve — but refuse App Info handlers.
        val pm = reactContext.packageManager
        for (permissionName in LOCATION_PERMISSION_NAMES) {
          val intent = baseIntent(permissionName)
          val resolved = intent.resolveActivity(pm)
          if (resolved != null && !isAppInfoComponent(resolved.packageName, resolved.className)) {
            if (tryStart(intent)) {
              promise.resolve("default:$permissionName")
              return
            }
          }
        }

        // 4) Location permission group.
        for (controller in PERMISSION_CONTROLLER_PACKAGES) {
          val groupIntent =
            Intent(ACTION_MANAGE_APP_PERMISSION).apply {
              addCategory(Intent.CATEGORY_DEFAULT)
              putExtra(EXTRA_PERMISSION_GROUP_NAME, "android.permission-group.LOCATION")
              putExtra(Intent.EXTRA_PACKAGE_NAME, packageName)
              putExtra(Intent.EXTRA_USER, Process.myUserHandle())
              setPackage(controller)
            }
          if (tryStart(groupIntent)) {
            promise.resolve("group:$controller")
            return
          }
        }
      }

      promise.reject(
        "LOCATION_PERMISSION_SCREEN_UNAVAILABLE",
        "Could not open Location permission screen on this device",
      )
    } catch (error: Exception) {
      promise.reject("OPEN_LOCATION_PERMISSION_FAILED", error.message, error)
    }
  }

  companion object {
    private const val REQUEST_BACKGROUND_LOCATION = 19283
    private const val ACTION_MANAGE_APP_PERMISSION = "android.intent.action.MANAGE_APP_PERMISSION"
    private const val EXTRA_PERMISSION_NAME = "android.intent.extra.PERMISSION_NAME"
    private const val EXTRA_PERMISSION_GROUP_NAME = "android.intent.extra.PERMISSION_GROUP_NAME"

    private val LOCATION_PERMISSION_NAMES =
      arrayOf(
        Manifest.permission.ACCESS_FINE_LOCATION,
        Manifest.permission.ACCESS_BACKGROUND_LOCATION,
        Manifest.permission.ACCESS_COARSE_LOCATION,
      )

    private val PERMISSION_CONTROLLER_PACKAGES =
      arrayOf(
        "com.google.android.permissioncontroller",
        "com.android.permissioncontroller",
        "com.samsung.android.permissioncontroller",
      )

    private val PERMISSION_CONTROLLER_COMPONENTS =
      arrayOf(
        ComponentName(
          "com.google.android.permissioncontroller",
          "com.android.permissioncontroller.permission.ui.ManagePermissionsActivity",
        ),
        ComponentName(
          "com.android.permissioncontroller",
          "com.android.permissioncontroller.permission.ui.ManagePermissionsActivity",
        ),
        ComponentName(
          "com.samsung.android.permissioncontroller",
          "com.android.permissioncontroller.permission.ui.ManagePermissionsActivity",
        ),
        // Newer handheld variants on some builds.
        ComponentName(
          "com.google.android.permissioncontroller",
          "com.android.permissioncontroller.permission.ui.handheld.AppPermissionActivity",
        ),
        ComponentName(
          "com.android.permissioncontroller",
          "com.android.permissioncontroller.permission.ui.handheld.AppPermissionActivity",
        ),
      )

    private fun isAppInfoComponent(packageName: String, className: String): Boolean {
      val cls = className.lowercase()
      if (
        cls.contains("installedappdetails") ||
        cls.contains("appinfobase") ||
        cls.contains("applicationsettings")
      ) {
        return true
      }
      if (packageName == "com.android.settings" && !cls.contains("permission")) {
        return true
      }
      return false
    }
  }
}
