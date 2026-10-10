package com.blugreenfac.crulynk.training

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.SimpleViewManager
import com.facebook.react.uimanager.ThemedReactContext
import com.facebook.react.uimanager.ViewManager
import com.facebook.react.uimanager.annotations.ReactProp

class TrainingVideoViewManager : SimpleViewManager<TrainingVideoView>() {
  override fun getName(): String = "TrainingVideoView"

  override fun createViewInstance(reactContext: ThemedReactContext): TrainingVideoView {
    return TrainingVideoView(reactContext)
  }

  @ReactProp(name = "source")
  fun setSource(view: TrainingVideoView, source: String?) {
    view.setSource(source)
  }

  @ReactProp(name = "authorization")
  fun setAuthorization(view: TrainingVideoView, authorization: String?) {
    view.setAuthorization(authorization)
  }

  @ReactProp(name = "company")
  fun setCompany(view: TrainingVideoView, company: String?) {
    view.setCompany(company)
  }

  override fun onDropViewInstance(view: TrainingVideoView) {
    view.release()
    super.onDropViewInstance(view)
  }

  @ReactProp(name = "paused", defaultBoolean = false)
  fun setPaused(view: TrainingVideoView, paused: Boolean) {
    view.setPaused(paused)
  }

  override fun getExportedCustomDirectEventTypeConstants(): MutableMap<String, Any> {
    return mutableMapOf(
      "onPlaybackError" to mapOf("registrationName" to "onPlaybackError"),
    )
  }
}

class TrainingVideoPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
    return emptyList()
  }

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
    return listOf(TrainingVideoViewManager())
  }
}
