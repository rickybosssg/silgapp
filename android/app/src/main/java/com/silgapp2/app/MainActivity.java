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

public class MainActivity extends BridgeActivity {
    private static final String CHANNEL_ID = "silgapp_default";
    private static final String URGENT_CHANNEL_ID = "silgapp_courses_official_v2";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(SilgappPushPlugin.class);
        registerPlugin(SilgappNativePlugin.class);
        createDefaultNotificationChannel();
        createUrgentCourseChannel();
        requestBatteryOptimizationExemption();
        super.onCreate(savedInstanceState);
        SilgappPushPlugin.handleNotificationIntent(getIntent(), "launch");
        SilgappFirebaseMessagingService.stopUrgentCourseAlert();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        SilgappPushPlugin.handleNotificationIntent(intent, "new_intent");
        SilgappFirebaseMessagingService.stopUrgentCourseAlert();
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
            NotificationManager.IMPORTANCE_MAX
        );
        channel.setDescription("Notifications de courses urgentes SILGAPP");
        channel.enableVibration(false);
        channel.enableLights(true);
        channel.setLockscreenVisibility(androidx.core.app.NotificationCompat.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        channel.setSound(null, null);

        manager.createNotificationChannel(channel);
    }

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
