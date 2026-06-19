package com.silgapp2.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Build;
import android.os.IBinder;
import android.os.Looper;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.ActivityCompat;
import androidx.core.app.NotificationCompat;

import com.base6a0ec08f3af5e1d1284254c1.app.R;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class SilgappLocationService extends Service {
    private static final String TAG = "SilgappGPS";
    private static final String CHANNEL_ID = "silgapp_gps";
    private static final int NOTIFICATION_ID = 4402;

    private FusedLocationProviderClient fusedLocationClient;
    private LocationCallback locationCallback;
    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    private String token = "";
    private String serverUrl = "https://silga-dispatch-go.base44.app";
    private String appId = "6a0ec08f3af5e1d1284254c1";
    private String functionsVersion = "prod";
    private String userType = "livreur";
    private long intervalMs = 5000L;
    private float distanceFilter = 3f;

    @Override
    public void onCreate() {
        super.onCreate();
        fusedLocationClient = LocationServices.getFusedLocationProviderClient(this);
        createChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null) {
            token = intent.getStringExtra("token") != null ? intent.getStringExtra("token") : token;
            serverUrl = intent.getStringExtra("serverUrl") != null ? intent.getStringExtra("serverUrl") : serverUrl;
            appId = intent.getStringExtra("appId") != null ? intent.getStringExtra("appId") : appId;
            functionsVersion = intent.getStringExtra("functionsVersion") != null ? intent.getStringExtra("functionsVersion") : functionsVersion;
            userType = intent.getStringExtra("userType") != null ? intent.getStringExtra("userType") : userType;
            intervalMs = Math.max(3000L, intent.getLongExtra("intervalMs", intervalMs));
            distanceFilter = intent.getFloatExtra("distanceFilter", distanceFilter);
        }

        startForeground(NOTIFICATION_ID, new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("SILGAPP GPS actif")
            .setContentText("Position synchronisee en arriere-plan")
            .setOngoing(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build());

        startLocationUpdates();
        Log.i(TAG, "foreground location service started userType=" + userType + " intervalMs=" + intervalMs + " distanceFilter=" + distanceFilter);
        return START_STICKY;
    }

    @Override
    public void onDestroy() {
        stopLocationUpdates();
        executor.shutdownNow();
        Log.i(TAG, "foreground location service stopped");
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "SILGAPP GPS",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Synchronisation GPS SILGAPP");
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private void startLocationUpdates() {
        if (ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_FINE_LOCATION) != PackageManager.PERMISSION_GRANTED &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "foreground location service missing location permission");
            stopSelf();
            return;
        }

        stopLocationUpdates();

        LocationRequest request = new LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY, intervalMs)
            .setMinUpdateIntervalMillis(Math.max(2000L, intervalMs / 2L))
            .setMinUpdateDistanceMeters(distanceFilter)
            .setWaitForAccurateLocation(false)
            .build();

        locationCallback = new LocationCallback() {
            @Override
            public void onLocationResult(LocationResult locationResult) {
                if (locationResult == null) return;
                Location location = locationResult.getLastLocation();
                if (location != null) sendHeartbeat(location);
            }
        };

        fusedLocationClient.requestLocationUpdates(request, locationCallback, Looper.getMainLooper());
    }

    private void stopLocationUpdates() {
        if (fusedLocationClient != null && locationCallback != null) {
            fusedLocationClient.removeLocationUpdates(locationCallback);
        }
        locationCallback = null;
    }

    private void sendHeartbeat(Location location) {
        final double latitude = location.getLatitude();
        final double longitude = location.getLongitude();
        executor.execute(() -> {
            HttpURLConnection connection = null;
            try {
                String cleanServerUrl = serverUrl.replaceAll("/+$", "");
                URL url = new URL(cleanServerUrl + "/api/apps/" + appId + "/functions/heartbeatAuto");
                connection = (HttpURLConnection) url.openConnection();
                connection.setRequestMethod("POST");
                connection.setConnectTimeout(10000);
                connection.setReadTimeout(15000);
                connection.setDoOutput(true);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setRequestProperty("X-App-Id", appId);
                if (functionsVersion != null && !functionsVersion.isEmpty()) {
                    connection.setRequestProperty("Base44-Functions-Version", functionsVersion);
                }
                if (token != null && !token.isEmpty()) {
                    connection.setRequestProperty("Authorization", "Bearer " + token);
                }

                String deviceId = ("android_native_" + Build.MODEL + "_" + Build.ID).replaceAll("[^A-Za-z0-9_]", "_");
                String payload = String.format(
                    Locale.US,
                    "{\"user_type\":\"%s\",\"latitude\":%.8f,\"longitude\":%.8f,\"app_active\":false,\"device_id\":\"%s\"}",
                    userType,
                    latitude,
                    longitude,
                    deviceId
                );

                try (OutputStream outputStream = connection.getOutputStream()) {
                    outputStream.write(payload.getBytes(StandardCharsets.UTF_8));
                }

                int code = connection.getResponseCode();
                if (code >= 200 && code < 300) {
                    Log.i(TAG, String.format(Locale.US, "service heartbeatAuto OK userType=%s lat=%.6f lng=%.6f code=%d", userType, latitude, longitude, code));
                } else {
                    Log.w(TAG, String.format(Locale.US, "service heartbeatAuto failed userType=%s lat=%.6f lng=%.6f code=%d", userType, latitude, longitude, code));
                }
            } catch (Exception error) {
                Log.e(TAG, "service heartbeatAuto error: " + error.getMessage());
            } finally {
                if (connection != null) connection.disconnect();
            }
        });
    }
}
