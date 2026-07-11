package com.silgapp2.app;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.firebase.messaging.FirebaseMessaging;

import java.util.Iterator;

@CapacitorPlugin(
    name = "SilgappPush",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
)
public class SilgappPushPlugin extends Plugin {
    private static SilgappPushPlugin activeInstance;
    private static JSObject pendingNotificationData;

    @Override
    public void load() {
        super.load();
        activeInstance = this;
        JSObject pending = getPendingNotificationData(false);
        if (pending != null) {
            notifyListeners("nativeNotificationOpened", pending, true);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (activeInstance == this) {
            activeInstance = null;
        }
        super.handleOnDestroy();
    }

    public static SilgappPushPlugin getActiveInstance() {
        return activeInstance;
    }

    public static void handleNotificationIntent(Intent intent, String source) {
        JSObject data = extractNotificationData(intent, source);
        if (data == null) return;

        synchronized (SilgappPushPlugin.class) {
            pendingNotificationData = data;
        }

        SilgappFirebaseMessagingService.stopUrgentCourseAlert();

        SilgappPushPlugin plugin = activeInstance;
        if (plugin != null) {
            plugin.notifyListeners("nativeNotificationOpened", data, true);
        }
    }

    private static JSObject extractNotificationData(Intent intent, String source) {
        if (intent == null) return null;
        Bundle extras = intent.getExtras();
        if (extras == null || extras.isEmpty()) return null;

        JSObject data = new JSObject();
        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            if (value != null) {
                data.put(key, String.valueOf(value));
            }
        }

        boolean hasNotificationPayload =
            data.has("course_id") ||
            data.has("notification_id") ||
            data.has("conversation_id") ||
            data.has("type");

        if (!hasNotificationPayload) return null;

        data.put("source", source);
        data.put("native_intent", true);
        return data;
    }

    private static synchronized JSObject getPendingNotificationData(boolean consume) {
        if (pendingNotificationData == null) return null;
        JSObject copy = new JSObject();
        try {
            Iterator<String> keys = pendingNotificationData.keys();
            while (keys.hasNext()) {
                String key = keys.next();
                copy.put(key, pendingNotificationData.get(key));
            }
        } catch (Exception ignored) {}
        if (consume) {
            pendingNotificationData = null;
        }
        return copy;
    }

    public void emitNotificationTapped(JSObject data) {
        notifyListeners("nativeNotificationOpened", data, true);
        notifyListeners("silgapp:notification-tapped", data, true);
    }

    @PluginMethod
    public void checkNotificationPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("platform", "android");

        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            result.put("receive", "granted");
            call.resolve(result);
            return;
        }

        result.put("receive", getPermissionState("notifications").toString().toLowerCase());
        call.resolve(result);
    }

    @PluginMethod
    public void requestNotificationPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || getPermissionState("notifications") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("receive", "granted");
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("notifications", call, "notificationPermissionCallback");
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("receive", getPermissionState("notifications").toString().toLowerCase());
        call.resolve(result);
    }

    @PluginMethod
    public void getToken(PluginCall call) {
        FirebaseMessaging.getInstance().setAutoInitEnabled(true);
        FirebaseMessaging.getInstance().getToken().addOnCompleteListener(task -> {
            if (!task.isSuccessful()) {
                Exception exception = task.getException();
                call.reject(exception != null ? exception.getMessage() : "Firebase getToken failed");
                return;
            }

            JSObject result = new JSObject();
            result.put("token", task.getResult());
            result.put("platform", "android");
            call.resolve(result);
        });
    }

    @PluginMethod
    public void getLaunchNotificationData(PluginCall call) {
        JSObject data = getPendingNotificationData(true);
        JSObject result = new JSObject();
        result.put("hasData", data != null);
        if (data != null) {
            result.put("data", data);
        }
        call.resolve(result);
    }

    @PluginMethod
    public void checkPendingNotification(PluginCall call) {
        JSObject data = getPendingNotificationData(true);
        if (data != null) {
            data.put("hasPending", true);
            call.resolve(data);
        } else {
            JSObject empty = new JSObject();
            empty.put("hasPending", false);
            call.resolve(empty);
        }
    }

    @PluginMethod
    public void openNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        }
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void stopUrgentCourseAlert(PluginCall call) {
        SilgappFirebaseMessagingService.stopUrgentCourseAlert();
        call.resolve();
    }

    @PluginMethod
    public void startUrgentCourseAlert(PluginCall call) {
        String courseId = call.getString("courseId", "");
        if (courseId == null || courseId.trim().isEmpty()) {
            call.reject("courseId requis pour lancer une alerte course");
            return;
        }

        String notificationId = call.getString("notificationId", "");
        String title = call.getString("title", "Nouvelle course SILGAPP");
        String body = call.getString("body", "Une course est disponible. Ouvrez l'app pour accepter.");
        long durationMs = call.getLong("durationMs", 60000L);
        long intervalMs = call.getLong("intervalMs", 5000L);
        boolean showNotification = call.getBoolean("showNotification", false);

        SilgappFirebaseMessagingService.startUrgentCourseAlertFromPlugin(
            getContext(),
            title,
            body,
            courseId,
            notificationId,
            durationMs,
            intervalMs,
            showNotification
        );
        call.resolve();
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject result = new JSObject();
            result.put("granted", true);
            result.put("reason", "not_applicable");
            call.resolve(result);
            return;
        }

        try {
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            String packageName = getContext().getPackageName();
            boolean alreadyIgnoring = pm != null && pm.isIgnoringBatteryOptimizations(packageName);

            if (alreadyIgnoring) {
                JSObject result = new JSObject();
                result.put("granted", true);
                result.put("reason", "already_ignored");
                call.resolve(result);
                return;
            }

            Intent intent = new Intent();
            intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
            intent.setData(Uri.parse("package:" + packageName));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);

            JSObject result = new JSObject();
            result.put("granted", false);
            result.put("reason", "dialog_shown");
            call.resolve(result);
        } catch (Exception error) {
            JSObject result = new JSObject();
            result.put("granted", false);
            result.put("reason", "error");
            result.put("error", error.getMessage() != null ? error.getMessage() : "unknown");
            call.resolve(result);
        }
    }

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject result = new JSObject();
            result.put("ignoring", true);
            call.resolve(result);
            return;
        }

        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("ignoring", ignoring);
        call.resolve(result);
    }

    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        Intent intent = new Intent();
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        intent.setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.coloros.safecenter", "com.coloros.safecenter.startupapp.StartupAppListActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartActivityManagerActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.tecno.foundation", "com.tecno.foundation.activity.PermissionActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.infinix.safezone", "com.infinix.safezone.activity.PermissionActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible d'ouvrir les parametres Autostart");
        }
    }

    private boolean tryStartActivity(Intent intent, PluginCall call) {
        try {
            getContext().startActivity(intent);
            call.resolve();
            return true;
        } catch (Exception ignored) {
            return false;
        }
    }
}
