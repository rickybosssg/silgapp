package com.silgapp2.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class SilgappFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "silgapp_urgent_courses";
    private static final String DEFAULT_CHANNEL_ID = "silgapp_default";
    private static final long DEFAULT_DURATION_MS = 60000L;
    private static final long DEFAULT_INTERVAL_MS = 5000L;
    private static Handler alertHandler;
    private static Runnable alertRunnable;
    private static long alertEndAtMs = 0L;
    private static Ringtone activeRingtone;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        String livreurId = data.get("livreur_id");

        if ("nouvelle_course".equals(type) && livreurId != null && !livreurId.isEmpty()) {
            String title = valueOrDefault(data.get("title"), "SILGAPP");
            String body = valueOrDefault(data.get("body"), "Nouvelle course disponible");
            long durationMs = parseSeconds(data.get("alert_duration_seconds"), DEFAULT_DURATION_MS / 1000L, 10L, 180L) * 1000L;
            long intervalMs = parseSeconds(data.get("alert_interval_seconds"), DEFAULT_INTERVAL_MS / 1000L, 3L, 30L) * 1000L;

            showUrgentCourseNotification(title, body, data);
            startUrgentCourseAlert(getApplicationContext(), durationMs, intervalMs);
            return;
        }

        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification != null) {
            showDefaultNotification(
                valueOrDefault(notification.getTitle(), "SILGAPP"),
                valueOrDefault(notification.getBody(), ""),
                data
            );
        }
    }

    public static synchronized void stopUrgentCourseAlert() {
        if (alertHandler != null && alertRunnable != null) {
            alertHandler.removeCallbacks(alertRunnable);
        }
        alertRunnable = null;
        alertEndAtMs = 0L;
        stopRingtone();
    }

    private static synchronized void startUrgentCourseAlert(Context context, long durationMs, long intervalMs) {
        stopUrgentCourseAlert();
        alertHandler = new Handler(Looper.getMainLooper());
        alertEndAtMs = SystemClock.elapsedRealtime() + durationMs;

        alertRunnable = new Runnable() {
            @Override
            public void run() {
                if (SystemClock.elapsedRealtime() >= alertEndAtMs) {
                    stopUrgentCourseAlert();
                    return;
                }
                vibrate(context);
                playNotificationSound(context);
                alertHandler.postDelayed(this, intervalMs);
            }
        };
        alertRunnable.run();
    }

    private void showUrgentCourseNotification(String title, String body, Map<String, String> data) {
        createChannel(CHANNEL_ID, "Courses urgentes", NotificationManager.IMPORTANCE_HIGH);

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("OPEN_SILGAPP");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            stableNotificationId(data.get("course_id")),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(true)
            .setOngoing(false)
            .setOnlyAlertOnce(false)
            .setVibrate(new long[] { 0, 300, 150, 300, 150, 500 })
            .setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION))
            .setContentIntent(pendingIntent);

        notifyIfAllowed(stableNotificationId(data.get("course_id")), builder);
    }

    private void showDefaultNotification(String title, String body, Map<String, String> data) {
        createChannel(DEFAULT_CHANNEL_ID, "SILGAPP", NotificationManager.IMPORTANCE_HIGH);
        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("OPEN_SILGAPP");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            this,
            stableNotificationId(data.get("notification_id")),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, DEFAULT_CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent);

        notifyIfAllowed(stableNotificationId(data.get("notification_id")), builder);
    }

    private void notifyIfAllowed(int id, NotificationCompat.Builder builder) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return;
        }
        NotificationManagerCompat.from(this).notify(id, builder.build());
    }

    private void createChannel(String id, String name, int importance) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(id, name, importance);
        channel.enableVibration(true);
        channel.enableLights(true);
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private static void vibrate(Context context) {
        try {
            Vibrator vibrator;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager manager = (VibratorManager) context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = manager != null ? manager.getDefaultVibrator() : null;
            } else {
                vibrator = (Vibrator) context.getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator == null || !vibrator.hasVibrator()) return;
            long[] pattern = new long[] { 0, 500, 150, 500, 150, 500 };
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, -1));
            } else {
                vibrator.vibrate(pattern, -1);
            }
        } catch (Exception ignored) {}
    }

    private static void playNotificationSound(Context context) {
        try {
            stopRingtone();
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            activeRingtone = RingtoneManager.getRingtone(context.getApplicationContext(), uri);
            if (activeRingtone != null) activeRingtone.play();
        } catch (Exception ignored) {}
    }

    private static void stopRingtone() {
        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
        } catch (Exception ignored) {}
        activeRingtone = null;
    }

    private static long parseSeconds(String value, long fallback, long min, long max) {
        try {
            long parsed = Long.parseLong(value);
            return Math.max(min, Math.min(max, parsed));
        } catch (Exception ignored) {
            return fallback;
        }
    }

    private static String valueOrDefault(String value, String fallback) {
        return value == null || value.trim().isEmpty() ? fallback : value;
    }

    private static int stableNotificationId(String value) {
        if (value == null || value.isEmpty()) return (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
        return Math.abs(value.hashCode());
    }
}
