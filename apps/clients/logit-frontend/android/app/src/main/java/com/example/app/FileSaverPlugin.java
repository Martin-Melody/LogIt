package com.example.app;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    // The pending export is written to app cache immediately, before the document
    // picker launches. Only this small path (not the export content itself) needs to
    // survive the ACTION_CREATE_DOCUMENT round trip via Capacitor's saved PluginCall,
    // which is transported through an Android Binder IPC bundle capped at ~1MB. Passing
    // the content itself through that bundle silently truncated to an empty string once
    // export payloads grew past that ceiling (Android reclaiming the process mid-picker
    // drops the saved call's extras), producing a successfully-created but empty file.
    @PluginMethod
    public void saveFile(PluginCall call) {
        String filename = call.getString("filename", "download");
        String mimeType = call.getString("mimeType", "application/octet-stream");
        String content = call.getString("content", "");

        File tempFile;
        try {
            tempFile = File.createTempFile("export-", ".tmp", getContext().getCacheDir());
            try (FileOutputStream fos = new FileOutputStream(tempFile)) {
                fos.write(content.getBytes(StandardCharsets.UTF_8));
            }
        } catch (IOException e) {
            call.reject("Failed to stage export for saving: " + e.getMessage());
            return;
        }

        Intent intent = new Intent(Intent.ACTION_CREATE_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.setType(mimeType);
        intent.putExtra(Intent.EXTRA_TITLE, filename);

        // Only this small path — not the file content — becomes part of the call's
        // persisted data, so it stays well under the Binder transaction size that
        // Bridge.saveInstanceState() always serializes call data into.
        call.getData().put("tempFilePath", tempFile.getAbsolutePath());

        startActivityForResult(call, intent, "handleSaveResult");
    }

    @ActivityCallback
    private void handleSaveResult(PluginCall call, ActivityResult result) {
        if (call == null) return;

        String tempFilePath = call.getString("tempFilePath");
        File tempFile = tempFilePath != null ? new File(tempFilePath) : null;

        if (result.getResultCode() == Activity.RESULT_CANCELED) {
            if (tempFile != null) tempFile.delete();
            call.reject("cancelled");
            return;
        }

        Intent data = result.getData();
        if (result.getResultCode() != Activity.RESULT_OK || data == null) {
            if (tempFile != null) tempFile.delete();
            call.reject("No file URI returned.");
            return;
        }

        Uri uri = data.getData();
        if (uri == null) {
            if (tempFile != null) tempFile.delete();
            call.reject("No file URI returned.");
            return;
        }

        if (tempFile == null || !tempFile.exists()) {
            call.reject("Staged export was lost before it could be saved. Please try again.");
            return;
        }

        try (InputStream in = new FileInputStream(tempFile);
             ParcelFileDescriptor pfd = getContext().getContentResolver().openFileDescriptor(uri, "w")) {
            if (pfd == null) {
                call.reject("Could not open file for writing.");
                return;
            }
            long written;
            try (OutputStream out = new FileOutputStream(pfd.getFileDescriptor())) {
                written = copy(in, out);
            }

            if (written != tempFile.length()) {
                call.reject("Export was not fully written (" + written + " of " + tempFile.length() + " bytes). Please try again.");
                return;
            }

            JSObject ret = new JSObject();
            ret.put("uri", uri.toString());
            call.resolve(ret);
        } catch (IOException e) {
            call.reject("Failed to write file: " + e.getMessage());
        } finally {
            tempFile.delete();
        }
    }

    private static long copy(InputStream in, OutputStream out) throws IOException {
        byte[] buf = new byte[8192];
        long total = 0;
        int n;
        while ((n = in.read(buf)) != -1) {
            out.write(buf, 0, n);
            total += n;
        }
        return total;
    }
}
