package com.silgapp2.app;

import android.net.Uri;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebView;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;

import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebChromeClient;

import java.util.List;
import java.util.Locale;

/**
 * Routes media-only HTML file inputs through Android's permissionless Photo Picker.
 * Camera capture and non-media documents keep Capacitor's standard handling.
 */
public class SilgappWebChromeClient extends BridgeWebChromeClient {
    private final ActivityResultLauncher<PickVisualMediaRequest> singleMediaPicker;
    private final ActivityResultLauncher<PickVisualMediaRequest> multipleMediaPicker;
    private ValueCallback<Uri[]> pendingMediaCallback;

    public SilgappWebChromeClient(Bridge bridge) {
        super(bridge);

        singleMediaPicker = bridge.registerForActivityResult(
            new ActivityResultContracts.PickVisualMedia(),
            uri -> completeSelection(uri == null ? null : new Uri[] { uri })
        );

        multipleMediaPicker = bridge.registerForActivityResult(
            new ActivityResultContracts.PickMultipleVisualMedia(20),
            uris -> completeSelection(toUriArray(uris))
        );
    }

    @Override
    public boolean onShowFileChooser(
        WebView webView,
        ValueCallback<Uri[]> filePathCallback,
        WebChromeClient.FileChooserParams fileChooserParams
    ) {
        if (fileChooserParams.isCaptureEnabled() || !acceptsOnlyVisualMedia(fileChooserParams.getAcceptTypes())) {
            return super.onShowFileChooser(webView, filePathCallback, fileChooserParams);
        }

        if (pendingMediaCallback != null) {
            pendingMediaCallback.onReceiveValue(null);
        }
        pendingMediaCallback = filePathCallback;

        PickVisualMediaRequest request = new PickVisualMediaRequest.Builder()
            .setMediaType(resolveMediaType(fileChooserParams.getAcceptTypes()))
            .build();

        if (fileChooserParams.getMode() == WebChromeClient.FileChooserParams.MODE_OPEN_MULTIPLE) {
            multipleMediaPicker.launch(request);
        } else {
            singleMediaPicker.launch(request);
        }
        return true;
    }

    private void completeSelection(Uri[] uris) {
        if (pendingMediaCallback == null) return;
        ValueCallback<Uri[]> callback = pendingMediaCallback;
        pendingMediaCallback = null;
        callback.onReceiveValue(uris);
    }

    private static Uri[] toUriArray(List<Uri> uris) {
        if (uris == null || uris.isEmpty()) return null;
        return uris.toArray(new Uri[0]);
    }

    private static boolean acceptsOnlyVisualMedia(String[] acceptTypes) {
        if (acceptTypes == null || acceptTypes.length == 0) return false;
        boolean foundMedia = false;
        for (String rawType : acceptTypes) {
            String type = normalizeType(rawType);
            if (type.isEmpty()) continue;
            if (type.startsWith("image/") || type.startsWith("video/")) {
                foundMedia = true;
                continue;
            }
            return false;
        }
        return foundMedia;
    }

    private static ActivityResultContracts.PickVisualMedia.VisualMediaType resolveMediaType(String[] acceptTypes) {
        boolean image = false;
        boolean video = false;
        for (String rawType : acceptTypes) {
            String type = normalizeType(rawType);
            image |= type.startsWith("image/");
            video |= type.startsWith("video/");
        }
        if (image && !video) return ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE;
        if (video && !image) return ActivityResultContracts.PickVisualMedia.VideoOnly.INSTANCE;
        return ActivityResultContracts.PickVisualMedia.ImageAndVideo.INSTANCE;
    }

    private static String normalizeType(String type) {
        return type == null ? "" : type.trim().toLowerCase(Locale.ROOT);
    }
}
