package com.silgapp2.app;

import android.Manifest;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
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

@CapacitorPlugin(
    name = "SilgappPush",
    permissions = @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
)
public class SilgappPushPlugin extends Plugin {

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
    public void openNotificationSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            intent = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            intent.putExtra(Settings.EXTRA_APP_PACKAGE, getContext().getPackageName());
        } else {
            intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
            intent.setData(android.net.Uri.parse("package:" + getContext().getPackageName()));
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

    // ── Demander l'exclusion de l'optimisation batterie ──
    // Critique pour Samsung, Xiaomi, Huawei, Tecno, Infinix, Oppo, Vivo
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
            PowerManager pm = (PowerManager) getContext().getSystemService(getContext().POWER_SERVICE);
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

    // ── Vérifier si l'app est exclue de l'optimisation batterie ──
    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            JSObject result = new JSObject();
            result.put("ignoring", true);
            call.resolve(result);
            return;
        }

        PowerManager pm = (PowerManager) getContext().getSystemService(getContext().POWER_SERVICE);
        boolean ignoring = pm != null && pm.isIgnoringBatteryOptimizations(getContext().getPackageName());
        JSObject result = new JSObject();
        result.put("ignoring", ignoring);
        call.resolve(result);
    }

    // ── Ouvrir les paramètres Autostart (Xiaomi, Oppo, Vivo, Tecno, Infinix) ──
    @PluginMethod
    public void openAutoStartSettings(PluginCall call) {
        Intent intent = new Intent();
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);

        // Xiaomi / MIUI
        intent.setClassName("com.miui.securitycenter",
            "com.miui.permcenter.autostart.AutoStartManagementActivity");
        if (tryStartActivity(intent, call)) return;

        // Oppo
        intent.setClassName("com.coloros.safecenter",
            "com.coloros.safecenter.permission.startup.StartupAppListActivity");
        if (tryStartActivity(intent, call)) return;

        intent.setClassName("com.coloros.safecenter",
            "com.coloros.safecenter.startupapp.StartupAppListActivity");
        if (tryStartActivity(intent, call)) return;

        // Vivo
        intent.setClassName("com.vivo.permissionmanager",
            "com.vivo.permissionmanager.activity.BgStartActivityManagerActivity");
        if (tryStartActivity(intent, call)) return;

        // Huawei
        intent.setClassName("com.huawei.systemmanager",
            "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity");
        if (tryStartActivity(intent, call)) return;

        // Samsung
        intent.setClassName("com.samsung.android.lool",
            "com.samsung.android.sm.ui.battery.BatteryActivity");
        if (tryStartActivity(intent, call)) return;

        // Tecno
        intent.setClassName("com.tecno.foundation",
            "com.tecno.foundation.activity.PermissionActivity");
        if (tryStartActivity(intent, call)) return;

        // Infinix
        intent.setClassName("com.infinix.safezone",
            "com.infinix.safezone.activity.PermissionActivity");
        if (tryStartActivity(intent, call)) return;

        // Fallback: paramètres généraux de l'app
        intent.setAction(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        try {
            getContext().startActivity(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Impossible d'ouvrir les paramètres Autostart");
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
