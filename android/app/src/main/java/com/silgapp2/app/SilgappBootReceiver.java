package com.silgapp2.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Build;
import android.util.Log;

/**
 * Redémarre le service GPS SILGAPP après un redémarrage du téléphone.
 * Les livreurs ne pensent pas toujours à ouvrir l'app après un reboot,
 * ce qui coupe leur GPS et les exclut du dispatch.
 */
public class SilgappBootReceiver extends BroadcastReceiver {
    private static final String TAG = "SilgappBoot";
    private static final String PREFS_NAME = "silgapp_heartbeat";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;

        String action = intent.getAction();
        if (!Intent.ACTION_BOOT_COMPLETED.equals(action)
            && !"android.intent.action.QUICKBOOT_POWERON".equals(action)
            && !"com.htc.intent.action.QUICKBOOT_POWERON".equals(action)) {
            return;
        }

        // Ne redémarrer le service que si le livreur l'avait activé avant le reboot
        SharedPreferences prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE);
        boolean wasRunning = prefs.getBoolean("service_active", false);
        String token = prefs.getString("token", "");
        String userType = prefs.getString("userType", "livreur");

        if (!wasRunning || token.isEmpty()) {
            Log.i(TAG, "Service GPS non actif avant reboot — pas de redémarrage");
            return;
        }

        // Vérifier qu'on a les permissions de localisation
        if (context.checkSelfPermission(android.Manifest.permission.ACCESS_FINE_LOCATION)
                != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            Log.w(TAG, "Permission GPS non accordée — pas de redémarrage du service");
            return;
        }

        Intent serviceIntent = new Intent(context, SilgappLocationService.class);
        serviceIntent.putExtra("token", token);
        serviceIntent.putExtra("serverUrl", prefs.getString("serverUrl", "https://silga-dispatch-go.base44.app"));
        serviceIntent.putExtra("appId", prefs.getString("appId", "6a0ec08f3af5e1d1284254c1"));
        serviceIntent.putExtra("functionsVersion", prefs.getString("functionsVersion", "prod"));
        serviceIntent.putExtra("userType", userType);
        serviceIntent.putExtra("sessionId", prefs.getString("sessionId", ""));
        serviceIntent.putExtra("intervalMs", prefs.getLong("intervalMs", 5000L));
        serviceIntent.putExtra("distanceFilter", prefs.getFloat("distanceFilter", 3f));

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(serviceIntent);
            } else {
                context.startService(serviceIntent);
            }
            Log.i(TAG, "Service GPS redémarré après boot");
        } catch (Exception e) {
            Log.e(TAG, "Erreur redémarrage service après boot: " + e.getMessage());
        }
    }
}