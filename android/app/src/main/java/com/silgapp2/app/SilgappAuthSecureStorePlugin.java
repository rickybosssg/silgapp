package com.silgapp2.app;

import android.app.KeyguardManager;
import android.content.Context;
import android.os.Build;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.AtomicFile;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileNotFoundException;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.security.KeyStore;
import java.util.Arrays;
import java.util.HashSet;
import java.util.Iterator;
import java.util.Set;
import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import org.json.JSONObject;
import org.json.JSONTokener;

// Native registration preparation; auth remains disabled by the JavaScript gates.
@CapacitorPlugin(name = "SilgappAuthSecureStore")
public class SilgappAuthSecureStorePlugin extends Plugin {
    private static final Object STORAGE_LOCK = new Object();
    private static final String APP_ID = "6a0ec08f3af5e1d1284254c1";
    private static final int MAX_BYTES = 2048;
    private static final int MAX_ENCRYPTED_BYTES = MAX_BYTES + 29;
    private static final Set<String> FIELDS = new HashSet<>(Arrays.asList(
        "appId", "returnUrl", "provider", "id", "state", "verifier", "expiresAt"
    ));

    private void reject(PluginCall call) {
        // Passing an exception here would let Capacitor log its details.
        call.reject("Secure pending authentication storage unavailable.", "NATIVE_AUTH_STORE_UNAVAILABLE");
    }

    private boolean authorized(PluginCall call) {
        return APP_ID.equals(call.getString("appId"));
    }

    private boolean opaque(Object value) {
        return value instanceof String && ((String) value).matches("[A-Za-z0-9_-]{43}");
    }

    private JSONObject record(String raw, boolean requireLive) throws Exception {
        if (raw == null || raw.getBytes(StandardCharsets.UTF_8).length > MAX_BYTES) return null;
        JSONTokener parser = new JSONTokener(raw);
        Object parsed = parser.nextValue();
        if (!(parsed instanceof JSONObject) || parser.nextClean() != 0) return null;
        JSONObject value = (JSONObject) parsed;
        Set<String> keys = new HashSet<>();
        Iterator<String> iterator = value.keys();
        while (iterator.hasNext()) keys.add(iterator.next());
        if (!keys.equals(FIELDS) || !APP_ID.equals(value.opt("appId")) ||
            !"silgapp://auth-callback".equals(value.opt("returnUrl")) ||
            !("google".equals(value.opt("provider")) || "apple".equals(value.opt("provider"))) ||
            !opaque(value.opt("id")) || !opaque(value.opt("state")) || !opaque(value.opt("verifier"))) return null;
        Object expiryObject = value.opt("expiresAt");
        if (!(expiryObject instanceof Number)) return null;
        double expiry = ((Number) expiryObject).doubleValue();
        long now = System.currentTimeMillis();
        if (Double.isNaN(expiry) || Double.isInfinite(expiry) || Math.rint(expiry) != expiry ||
            Math.abs(expiry) > 9007199254740991d || (requireLive && (expiry <= now || expiry > now + 300000L))) return null;
        return value;
    }

    private AtomicFile pendingFile() {
        // Ciphertext only, in an app-private directory excluded from Android backup.
        return new AtomicFile(new File(getContext().getNoBackupFilesDir(), "silgapp-auth-pending-v1.bin"));
    }

    private String alias() {
        // Separate policy namespace: never reuse a key created without the lock restriction.
        return getContext().getPackageName() + ".auth-pending.unlocked.v1";
    }

    private byte[] associatedData() {
        return (getContext().getPackageName() + "|SilgappAuthSecureStore|v1|" + APP_ID).getBytes(StandardCharsets.UTF_8);
    }

    private void requireUnlocked() throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) throw new IllegalStateException();
        KeyguardManager keyguard = (KeyguardManager) getContext().getSystemService(Context.KEYGUARD_SERVICE);
        if (keyguard == null || keyguard.isDeviceLocked()) throw new IllegalStateException();
    }

    private SecretKey key(boolean create) throws Exception {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) throw new IllegalStateException();
        KeyStore store = KeyStore.getInstance("AndroidKeyStore");
        store.load(null);
        if (store.containsAlias(alias())) return (SecretKey) store.getKey(alias(), null);
        if (!create) throw new IllegalStateException();
        // Runs only on a future explicit setPending call, never at plugin load/get.
        KeyGenerator generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore");
        generator.init(new KeyGenParameterSpec.Builder(alias(), KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
            .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
            .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            .setRandomizedEncryptionRequired(true)
            // API28+. System lock restriction for decryption. Keyguard preflights
            // both reads and writes; API<=30 does not restrict symmetric encryption.
            // Android12-14 have documented availability bugs: fail closed, never retry
            // with an unrestricted key. Physical OS/device validation is still needed.
            .setUnlockedDeviceRequired(true)
            .setKeySize(256)
            .build());
        return generator.generateKey();
    }

    private byte[] encrypt(String raw) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, key(true));
        cipher.updateAAD(associatedData());
        byte[] iv = cipher.getIV();
        if (iv.length != 12) throw new IllegalStateException();
        byte[] encrypted = cipher.doFinal(raw.getBytes(StandardCharsets.UTF_8));
        byte[] envelope = new byte[1 + iv.length + encrypted.length];
        envelope[0] = 1;
        System.arraycopy(iv, 0, envelope, 1, iv.length);
        System.arraycopy(encrypted, 0, envelope, 13, encrypted.length);
        return envelope;
    }

    private String decrypt(byte[] envelope) throws Exception {
        if (envelope.length < 29 || envelope.length > MAX_ENCRYPTED_BYTES || envelope[0] != 1) throw new IllegalStateException();
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, key(false), new GCMParameterSpec(128, Arrays.copyOfRange(envelope, 1, 13)));
        cipher.updateAAD(associatedData());
        return new String(cipher.doFinal(Arrays.copyOfRange(envelope, 13, envelope.length)), StandardCharsets.UTF_8);
    }

    private String read() throws Exception {
        AtomicFile file = pendingFile();
        try (InputStream input = file.openRead(); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[512];
            int count;
            while ((count = input.read(buffer)) != -1) {
                if (output.size() + count > MAX_ENCRYPTED_BYTES) throw new IllegalStateException();
                output.write(buffer, 0, count);
            }
            return decrypt(output.toByteArray());
        } catch (FileNotFoundException error) {
            if (!file.getBaseFile().exists()) return null;
            throw error;
        }
    }

    private void write(byte[] encrypted) throws Exception {
        AtomicFile file = pendingFile();
        FileOutputStream output = null;
        try {
            output = file.startWrite();
            output.write(encrypted);
            file.finishWrite(output);
        } catch (Exception error) {
            file.failWrite(output);
            throw error;
        }
    }

    private void delete() throws Exception {
        AtomicFile file = pendingFile();
        file.delete();
        if (file.getBaseFile().exists()) throw new IllegalStateException();
    }

    @PluginMethod
    public void setPending(PluginCall call) {
        if (!authorized(call)) { reject(call); return; }
        synchronized (STORAGE_LOCK) {
            try {
                requireUnlocked();
                String raw = call.getString("value");
                if (record(raw, true) == null) { reject(call); return; }
                write(encrypt(raw));
                call.resolve();
            } catch (Exception error) { reject(call); }
        }
    }

    @PluginMethod
    public void getPending(PluginCall call) {
        if (!authorized(call)) { reject(call); return; }
        synchronized (STORAGE_LOCK) {
            try {
                requireUnlocked();
                String raw = read();
                if (raw != null && record(raw, true) == null) { delete(); raw = null; }
                JSObject result = new JSObject();
                result.put("value", raw == null ? JSONObject.NULL : raw);
                call.resolve(result);
            } catch (Exception error) {
                // Authentication failures never return unauthenticated/plaintext data.
                // Keep ciphertext on transient device/Keystore errors for a later retry.
                reject(call);
            }
        }
    }

    @PluginMethod
    public void removePending(PluginCall call) {
        String id = call.getString("id");
        if (!authorized(call) || !opaque(id)) { reject(call); return; }
        synchronized (STORAGE_LOCK) {
            try {
                requireUnlocked();
                String raw = read();
                JSONObject value = raw == null ? null : record(raw, false);
                boolean matches = value != null && id.equals(value.opt("id"));
                if (matches || (raw != null && value == null)) delete();
                JSObject result = new JSObject();
                result.put("removed", matches);
                call.resolve(result);
            } catch (Exception error) { reject(call); }
        }
    }

    @PluginMethod
    public void clearPending(PluginCall call) {
        if (!authorized(call)) { reject(call); return; }
        synchronized (STORAGE_LOCK) {
            try {
                delete();
                // The non-exportable encryption key is retained; only pending data clears.
                call.resolve();
            } catch (Exception error) { reject(call); }
        }
    }
}
