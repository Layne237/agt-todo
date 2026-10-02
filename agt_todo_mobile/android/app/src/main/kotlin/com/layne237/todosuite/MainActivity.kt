package com.layne237.todosuite

import android.app.NotificationManager
import android.content.Context
import android.os.Build
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)

        // Small helpers the plugins don't expose (used by the alarm status banner).
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "agt_todo/system").setMethodCallHandler { call, result ->
            when (call.method) {
                // Android 14+: full-screen alarms need a user-granted permission.
                "canUseFullScreenIntent" -> {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
                        result.success(manager.canUseFullScreenIntent())
                    } else {
                        result.success(true)
                    }
                }
                else -> result.notImplemented()
            }
        }
    }
}
