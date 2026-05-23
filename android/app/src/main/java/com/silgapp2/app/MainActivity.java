package com.silgapp2.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.os.Build;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String CHANNEL_ID = "silgapp_default";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        createDefaultNotificationChannel();
        super.onCreate(savedInstanceState);
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
}
