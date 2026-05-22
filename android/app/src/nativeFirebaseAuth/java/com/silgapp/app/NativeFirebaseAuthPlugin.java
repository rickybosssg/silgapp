package com.silgapp.app;

import android.content.Intent;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.signin.GoogleSignIn;
import com.google.android.gms.auth.api.signin.GoogleSignInAccount;
import com.google.android.gms.auth.api.signin.GoogleSignInClient;
import com.google.android.gms.auth.api.signin.GoogleSignInOptions;
import com.google.android.gms.common.api.ApiException;
import com.google.android.gms.tasks.Task;
import com.google.firebase.auth.AuthCredential;
import com.google.firebase.auth.FirebaseAuth;
import com.google.firebase.auth.FirebaseUser;
import com.google.firebase.auth.GoogleAuthProvider;

@CapacitorPlugin(name = "NativeFirebaseAuth")
public class NativeFirebaseAuthPlugin extends Plugin {
    private FirebaseAuth firebaseAuth;
    private GoogleSignInClient googleSignInClient;

    @Override
    public void load() {
        firebaseAuth = FirebaseAuth.getInstance();
    }

    @PluginMethod
    public void getCurrentUser(PluginCall call) {
        JSObject result = new JSObject();
        result.put("user", userToJson(firebaseAuth.getCurrentUser()));
        call.resolve(result);
    }

    @PluginMethod
    public void signInWithEmailAndPassword(PluginCall call) {
        String email = call.getString("email");
        String password = call.getString("password");

        if (isBlank(email) || isBlank(password)) {
            call.reject("Email et mot de passe requis.");
            return;
        }

        firebaseAuth.signInWithEmailAndPassword(email.trim(), password)
                .addOnSuccessListener(authResult -> resolveUser(call, authResult.getUser()))
                .addOnFailureListener(error -> call.reject(error.getMessage(), error));
    }

    @PluginMethod
    public void createUserWithEmailAndPassword(PluginCall call) {
        String email = call.getString("email");
        String password = call.getString("password");

        if (isBlank(email) || isBlank(password)) {
            call.reject("Email et mot de passe requis.");
            return;
        }

        firebaseAuth.createUserWithEmailAndPassword(email.trim(), password)
                .addOnSuccessListener(authResult -> resolveUser(call, authResult.getUser()))
                .addOnFailureListener(error -> call.reject(error.getMessage(), error));
    }

    @PluginMethod
    public void signInWithGoogle(PluginCall call) {
        int webClientIdResource = getContext().getResources().getIdentifier("default_web_client_id", "string", getContext().getPackageName());
        if (webClientIdResource == 0) {
            call.reject("Configuration Google Sign-In manquante: ajoute SHA-1/SHA-256 dans Firebase puis remplace google-services.json.");
            return;
        }

        String webClientId = getContext().getString(webClientIdResource);
        GoogleSignInOptions signInOptions = new GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
                .requestIdToken(webClientId)
                .requestEmail()
                .build();

        googleSignInClient = GoogleSignIn.getClient(getActivity(), signInOptions);
        startActivityForResult(call, googleSignInClient.getSignInIntent(), "handleGoogleSignInResult");
    }

    @ActivityCallback
    private void handleGoogleSignInResult(PluginCall call, @Nullable android.app.ActivityResult result) {
        if (call == null) return;
        if (result == null || result.getData() == null) {
            call.reject("Connexion Google annulee.");
            return;
        }

        Task<GoogleSignInAccount> task = GoogleSignIn.getSignedInAccountFromIntent(result.getData());
        try {
            GoogleSignInAccount account = task.getResult(ApiException.class);
            AuthCredential credential = GoogleAuthProvider.getCredential(account.getIdToken(), null);
            firebaseAuth.signInWithCredential(credential)
                    .addOnSuccessListener(authResult -> resolveUser(call, authResult.getUser()))
                    .addOnFailureListener(error -> call.reject(error.getMessage(), error));
        } catch (ApiException error) {
            call.reject(error.getMessage(), error);
        }
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        firebaseAuth.signOut();
        if (googleSignInClient != null) {
            googleSignInClient.signOut();
        }
        call.resolve();
    }

    private void resolveUser(PluginCall call, FirebaseUser user) {
        JSObject result = new JSObject();
        result.put("user", userToJson(user));
        call.resolve(result);
    }

    private JSObject userToJson(@Nullable FirebaseUser user) {
        if (user == null) return null;

        JSObject data = new JSObject();
        data.put("uid", user.getUid());
        data.put("email", user.getEmail());
        data.put("displayName", user.getDisplayName());
        data.put("photoUrl", user.getPhotoUrl() != null ? user.getPhotoUrl().toString() : null);
        data.put("emailVerified", user.isEmailVerified());
        return data;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
