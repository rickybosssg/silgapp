package com.silgapp2.app;

import android.Manifest;
import android.app.Activity;
import android.app.KeyguardManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.AssetFileDescriptor;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.media.MediaPlayer;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.os.SystemClock;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowManager;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;

import com.base6a0ec08f3af5e1d1284254c1.app.R;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.util.Map;

public class SilgappFirebaseMessagingService extends FirebaseMessagingService {
    private static final String CHANNEL_ID = "silgapp_courses_official_v1";
    private static final String DEFAULT_CHANNEL_ID = "silgapp_default";
    private static final long DEFAULT_DURATION_MS = 60000L;
    private static final long DEFAULT_INTERVAL_MS = 5000L;
    private static Handler alertHandler;
    private static Runnable alertRunnable;
    private static long alertEndAtMs = 0L;
    private static Ringtone activeRingtone;
    private static MediaPlayer activeMediaPlayer;
    private static PowerManager.WakeLock wakeLock;
    private static Context activeAlertContext;
    private static int activeNotificationId = -1;

    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        String type = data.get("type");
        String livreurId = data.get("livreur_id");

        // ── Course urgente pour livreur → data-only message → toujours reçu ──
        if ("nouvelle_course".equals(type) && livreurId != null && !livreurId.isEmpty()) {
            String title = valueOrDefault(data.get("title"), "Nouvelle course SILGAPP");
            String body = valueOrDefault(data.get("body"), "Une course est disponible. Ouvrez l'app pour accepter.");
            long durationMs = parseSeconds(data.get("alert_duration_seconds"), DEFAULT_DURATION_MS / 1000L, 10L, 180L) * 1000L;
            long intervalMs = parseSeconds(data.get("alert_interval_seconds"), DEFAULT_INTERVAL_MS / 1000L, 3L, 30L) * 1000L;

            wakeUpScreen();
            showUrgentCourseNotification(title, body, data, durationMs);
            startUrgentCourseAlert(getApplicationContext(), durationMs, intervalMs);
            return;
        }

        // ── Notifications avec payload notification (clients, etc.) ──
        RemoteMessage.Notification notification = remoteMessage.getNotification();
        if (notification != null) {
            showDefaultNotification(
                valueOrDefault(notification.getTitle(), "SILGAPP"),
                valueOrDefault(notification.getBody(), ""),
                data
            );
        } else if (data.get("title") != null) {
            // Data-only message non-urgent → afficher notification simple
            showDefaultNotification(
                valueOrDefault(data.get("title"), "SILGAPP"),
                valueOrDefault(data.get("body"), ""),
                data
            );
        }
    }

    public static synchronized void stopUrgentCourseAlert() {
        stopUrgentCourseAlert(true);
    }

    private static synchronized void stopUrgentCourseAlert(boolean cancelNotification) {
        if (alertHandler != null && alertRunnable != null) {
            alertHandler.removeCallbacks(alertRunnable);
        }
        alertRunnable = null;
        alertEndAtMs = 0L;
        stopRingtone();
        releaseWakeLock();
        if (cancelNotification) {
            cancelActiveNotification();
        }
    }

    private static synchronized void startUrgentCourseAlert(Context context, long durationMs, long intervalMs) {
        stopUrgentCourseAlert(false);
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

    // ── Réveiller l'écran même si le téléphone est verrouillé ──
    private void wakeUpScreen() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                wakeLock = pm.newWakeLock(
                    PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP | PowerManager.ON_AFTER_RELEASE,
                    "Silgapp:CourseAlert"
                );
                wakeLock.acquire(60_000L); // 60 secondes max
            }

            // Désactiver le keyguard temporairement (si l'app est au premier plan)
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null && km.isKeyguardLocked()) {
                // Le keyguard ne peut être désactivé que par une activity au premier plan
                // Le fullScreenIntent s'en chargera
            }
        } catch (Exception ignored) {}
    }

    private static void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                wakeLock.release();
            }
        } catch (Exception ignored) {}
        wakeLock = null;
    }

    private void showUrgentCourseNotification(String title, String body, Map<String, String> data, long durationMs) {
        createUrgentChannel();

        Intent intent = new Intent(this, MainActivity.class);
        intent.setAction("OPEN_SILGAPP");
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        for (Map.Entry<String, String> entry : data.entrySet()) {
            intent.putExtra(entry.getKey(), entry.getValue());
        }

        int notifId = stableNotificationId(data.get("course_id"));
        activeAlertContext = getApplicationContext();
        activeNotificationId = notifId;

        PendingIntent fullScreenPendingIntent = PendingIntent.getActivity(
            this,
            notifId,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_silgapp)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_ALARM)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setAutoCancel(false)
            .setOngoing(true)
            .setOnlyAlertOnce(false)
            .setVibrate(new long[] { 0, 500, 200, 500, 200, 800 })
            .setSound(getCustomSoundUri(this))
            .setContentIntent(fullScreenPendingIntent)
            .setFullScreenIntent(fullScreenPendingIntent, true) // Affiche popup écran verrouillé
            .setShowWhen(true)
            .setTimeoutAfter(durationMs + 5000L); // Auto-dismiss après expiration

        notifyIfAllowed(notifId, builder);
    }

    private static synchronized void cancelActiveNotification() {
        try {
            if (activeAlertContext != null && activeNotificationId >= 0) {
                NotificationManagerCompat.from(activeAlertContext).cancel(activeNotificationId);
            }
        } catch (Exception ignored) {}
        activeAlertContext = null;
        activeNotificationId = -1;
    }

    private void showDefaultNotification(String title, String body, Map<String, String> data) {
        createDefaultChannel();
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
            .setSmallIcon(R.drawable.ic_stat_silgapp)
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

    // ── Canal dédié "SILGAPP Courses" — IMPORTANCE_HIGH ──
    private void createUrgentChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        NotificationChannel existing = manager.getNotificationChannel(CHANNEL_ID);
        if (existing != null) return; // Déjà créé

        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "SILGAPP Courses",
            NotificationManager.IMPORTANCE_MAX
        );
        channel.setDescription("Notifications de courses urgentes SILGAPP");
        channel.enableVibration(true);
        channel.enableLights(true);
        channel.setVibrationPattern(new long[] { 0, 500, 200, 500, 200, 800 });
        channel.setLockscreenVisibility(NotificationCompat.VISIBILITY_PUBLIC);
        channel.setBypassDnd(true);
        channel.setSound(
            getCustomSoundUri(this),
            new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_ALARM)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
        );
        manager.createNotificationChannel(channel);
    }

    private void createDefaultChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager == null) return;
        if (manager.getNotificationChannel(DEFAULT_CHANNEL_ID) != null) return;

        NotificationChannel channel = new NotificationChannel(
            DEFAULT_CHANNEL_ID,
            "SILGAPP",
            NotificationManager.IMPORTANCE_HIGH
        );
        channel.setDescription("Notifications SILGAPP générales");
        channel.enableVibration(true);
        channel.enableLights(true);
        manager.createNotificationChannel(channel);
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
            long[] pattern = new long[] { 0, 500, 200, 500, 200, 800 };
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
            AssetFileDescriptor afd = context.getResources().openRawResourceFd(R.raw.silgapp_alert);
            if (afd != null) {
                MediaPlayer player = new MediaPlayer();
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    player.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ALARM)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build());
                } else {
                    player.setAudioStreamType(AudioManager.STREAM_ALARM);
                }
                player.setDataSource(afd.getFileDescriptor(), afd.getStartOffset(), afd.getLength());
                afd.close();
                player.setLooping(true);
                player.prepare();
                player.start();
                activeMediaPlayer = player;
                return;
            }
        } catch (Exception ignored) {
            stopRingtone();
        }

        try {
            Uri uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            if (uri == null) uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
            activeRingtone = RingtoneManager.getRingtone(context.getApplicationContext(), uri);
            if (activeRingtone != null) {
                activeRingtone.setStreamType(AudioManager.STREAM_ALARM);
                activeRingtone.play();
            }
        } catch (Exception ignored) {}
    }

    private static void stopRingtone() {
        try {
            if (activeMediaPlayer != null) {
                if (activeMediaPlayer.isPlaying()) activeMediaPlayer.stop();
                activeMediaPlayer.release();
            }
        } catch (Exception ignored) {}
        activeMediaPlayer = null;

        try {
            if (activeRingtone != null && activeRingtone.isPlaying()) {
                activeRingtone.stop();
            }
        } catch (Exception ignored) {}
        activeRingtone = null;
    }

    private static Uri getCustomSoundUri(Context context) {
        try {
            return Uri.parse("android.resource://" + context.getPackageName() + "/" + R.raw.silgapp_alert);
        } catch (Exception ignored) {
            return RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM);
        }
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
