package com.silgapp2.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;
import android.provider.Settings;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.android.gms.common.api.CommonStatusCodes;
import com.google.android.gms.tasks.Task;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

@CapacitorPlugin(
    name = "SilgappNative",
    permissions = {
        @Permission(strings = { Manifest.permission.READ_CONTACTS }, alias = "contacts"),
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
    }
)
public class SilgappNativePlugin extends Plugin {

    @PluginMethod
    public void checkContactsPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("contacts", getPermissionState("contacts").toString().toLowerCase());
        call.resolve(result);
    }

    @PluginMethod
    public void requestContactsPermission(PluginCall call) {
        if (getPermissionState("contacts") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("contacts", "granted");
            call.resolve(result);
            return;
        }
        requestPermissionForAlias("contacts", call, "contactsPermissionCallback");
    }

    @PermissionCallback
    private void contactsPermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("contacts", getPermissionState("contacts").toString().toLowerCase());
        call.resolve(result);
    }

    @PluginMethod
    public void pickContact(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            requestPermissionForAlias("contacts", call, "pickContactAfterPermission");
            return;
        }
        openContactPicker(call);
    }

    @PermissionCallback
    private void pickContactAfterPermission(PluginCall call) {
        if (getPermissionState("contacts") != PermissionState.GRANTED) {
            call.reject("Permission contacts refusee");
            return;
        }
        openContactPicker(call);
    }

    private void openContactPicker(PluginCall call) {
        Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
        startActivityForResult(call, intent, "contactPicked");
    }

    @ActivityCallback
    private void contactPicked(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            call.reject("Selection contact annulee");
            return;
        }

        Uri contactUri = result.getData().getData();
        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER
        };

        try (Cursor cursor = getContext().getContentResolver().query(contactUri, projection, null, null, null)) {
            if (cursor == null || !cursor.moveToFirst()) {
                call.reject("Contact introuvable");
                return;
            }

            int nameIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
            int numberIndex = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
            JSObject contact = new JSObject();
            contact.put("name", nameIndex >= 0 ? cursor.getString(nameIndex) : "");
            contact.put("phone", numberIndex >= 0 ? cursor.getString(numberIndex) : "");
            call.resolve(contact);
        } catch (Exception error) {
            call.reject(error.getMessage() != null ? error.getMessage() : "Erreur lecture contact");
        }
    }

    @PluginMethod
    public void scanQrCode(PluginCall call) {
        GmsBarcodeScannerOptions options = new GmsBarcodeScannerOptions.Builder()
            .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
            .build();
        GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(getActivity(), options);
        Task<Barcode> task = scanner.startScan();
        task.addOnSuccessListener(barcode -> {
            String value = barcode.getRawValue();
            if (value == null || value.trim().isEmpty()) {
                call.reject("QR code vide");
                return;
            }
            JSObject result = new JSObject();
            result.put("value", value);
            result.put("format", "qr_code");
            call.resolve(result);
        }).addOnCanceledListener(() -> {
            call.reject("Scan annule");
        }).addOnFailureListener(error -> {
            String message = error.getMessage();
            if (message == null || message.trim().isEmpty()) {
                message = "Erreur scanner QR";
            }
            call.reject(message);
        });
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }
}
