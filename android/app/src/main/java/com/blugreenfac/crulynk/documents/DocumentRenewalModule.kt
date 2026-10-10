package com.blugreenfac.crulynk.documents

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class DocumentRenewalModule(private val context: ReactApplicationContext) :
  ReactContextBaseJavaModule(context) {

  init {
    DocumentRenewalNotifier.setOpenListener {
      try {
        context
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("documentRenewalOpen", null)
      } catch (_: Exception) {
        /* JS may not be listening yet; consumeOpenRequest covers cold start */
      }
    }
  }

  override fun getName(): String = "DocumentRenewal"

  override fun invalidate() {
    DocumentRenewalNotifier.setOpenListener(null)
    super.invalidate()
  }

  @ReactMethod
  fun syncReminder(documentsJson: String, promise: Promise) {
    try {
      DocumentRenewalScheduler.sync(context, documentsJson)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("DOCUMENT_RENEWAL_SYNC_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun cancelReminders(promise: Promise) {
    try {
      DocumentRenewalScheduler.cancel(context)
      promise.resolve(null)
    } catch (error: Exception) {
      promise.reject("DOCUMENT_RENEWAL_CANCEL_FAILED", error.message, error)
    }
  }

  @ReactMethod
  fun consumeOpenRequest(promise: Promise) {
    promise.resolve(DocumentRenewalNotifier.consumeOpenRequested())
  }
}
