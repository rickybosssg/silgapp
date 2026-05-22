package com.silgapp.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        try {
            registerPlugin((Class) Class.forName("com.silgapp.app.NativeFirebaseAuthPlugin"));
        } catch (ClassNotFoundException ignored) {}
        super.onCreate(savedInstanceState);
    }
}
