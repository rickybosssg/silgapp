# Native Firebase Auth

This is a parallel authentication path. The Base44 login is still present and remains the default build.

## Enable in the web layer

Set one of these before building:

```powershell
$env:VITE_ENABLE_NATIVE_FIREBASE_AUTH='true'
```

or open the app once with:

```text
?auth_mode=native-firebase
```

To force the old Base44 flow:

```text
?auth_mode=base44
```

## Enable the Android native plugin

The native Android plugin is kept in a separate source set so normal APK builds do not break while Firebase Auth dependencies are unavailable locally.

Build with:

```powershell
.\gradlew.bat assembleDebug -PenableNativeFirebaseAuth
```

Required Android dependencies:

- `com.google.firebase:firebase-auth`
- `com.google.android.gms:play-services-auth`

## Firebase console requirements

Google Sign-In requires Firebase to generate `default_web_client_id`.

1. Add the Android app package `com.silgapp.app` in Firebase.
2. Add the SHA-1 and SHA-256 fingerprints for the debug/release keystore.
3. Enable Google and Email/Password providers in Firebase Authentication.
4. Download the updated `google-services.json`.
5. Replace `android/app/google-services.json`.

Without the updated `google-services.json`, email/password can be prepared, but Google Sign-In will reject with a clear configuration error.
