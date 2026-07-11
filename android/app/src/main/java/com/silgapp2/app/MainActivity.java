package com.silgapp2.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.provider.Settings;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.JSObject;

public class MainActivity extends BridgeActivity {
    private static final String CHANNEL_ID = "silgapp_default";
    private static final String URGENT_CHANNEL_ID = "silgapp_urgent_courses";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SilgappPushPlugin.class);
        registerPlugin(SilgappNativePlugin.class);
        createDefaultNotificationChannel();
        createUrgentCourseChannel();
        requestBatteryOptimizationExemption();
        super.onCreate(savedInstanceState);
        SilgappFirebaseMessagingService.stopUrgentCourseAlert();
        handleNotificationIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        SilgappFirebaseMessagingService.stopUrgentCourseAlert();
        handleNotificationIntent(intent);
    }

    // ── Extraire les données de la notification depuis l'Intent ──
    // et les transmettre au plugin → JS pour afficher le modal course.
    private void handleNotificationIntent(Intent intent) {
        if (intent == null || !"OPEN_SILGAPP".equals(intent.getAction())) return;
        Bundle extras = intent.getExtras();
        if (extras == null) return;

        JSObject data = new JSObject();
        for (String key : extras.keySet()) {
            Object value = extras.get(key);
            if (value != null) {
                data.put(key, value.toString());
            }
        }
        data.put("hasPending", true);
        SilgappPushPlugin.setPendingNotificationData(data);

        // Warm start : l'app tourne déjà, émettre l'événement directement
        try {
            SilgappPushPlugin plugin = (SilgappPushPlugin) getBridge().getPlugin("SilgappPush").getInstance();
            if (plugin != null) {
                plugin.emitNotificationTapped(data);
            }
        } catch (Exception ignored) {}
    }

    @Override
    public void onResume() {
        super.onResume();
        SilgappFirebaseMessagingService.stopUrgentCourseAlert();
    }

    private void createDefaultNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "SILGAPP",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifications SILGAPP");
        channel.enableVibration(true);
        channel.enableLights(true);

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.createNotificationChannel(channel);
        }
    }

    private void createUrgentCourseChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(URGENT_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            URGENT_CHANNEL_ID,
            "SILGAPP Courses",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifications de courses urgentes SILGAPP");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 800 });
        channel.setLockscreenVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);

        manager.createNotificationChannel(channel);
    }

    // ── Demander l'exclusion de l'optimisation batterie ──
    // Empêche Android (Samsung, Xiaomi, Huawei, Tecno, Infinix, Oppo, Vivo) de tuer l'app
    private void requestBatteryOptimizationExemption() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm == null) return;
            String packageName = getPackageName();
            if (!pm.isIgnoringBatteryOptimizations(packageName)) {
                Intent intent = new Intent();
                intent.setAction(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + packageName));
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                startActivity(intent);
            }
        } catch (Exception ignored) {}
    }
}