package ie.logit.app;

import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * A CSV shared to LogIt (Share › LogIt from another app's export) or opened with it. The file is
 * read here, since the WebView can't open content:// URIs, and kept until the import screen
 * takes it: the app may still be starting, or on the welcome screen, when it arrives.
 */
@CapacitorPlugin(name = "SharedFile")
public class SharedFilePlugin extends Plugin {
    // A workout history CSV is well under this; anything bigger isn't one.
    private static final int MAX_BYTES = 25 * 1024 * 1024;
    private JSObject pending;

    @Override
    public void load() {
        take(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        take(intent);
    }

    /** The file waiting to be imported, if any; handed over once. */
    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject result = new JSObject();
        if (pending != null) result.put("file", pending);
        pending = null;
        call.resolve(result);
    }

    private void take(Intent intent) {
        if (intent == null) return;
        Uri uri = null;
        if (Intent.ACTION_SEND.equals(intent.getAction())) uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
        else if (Intent.ACTION_VIEW.equals(intent.getAction()) && "content".equals(intent.getScheme())) uri = intent.getData();
        if (uri == null) return;
        // Handled once: a rotation or a return to the app mustn't import it again.
        intent.setAction(Intent.ACTION_MAIN);

        JSObject file = new JSObject();
        file.put("name", displayName(uri));
        try (InputStream in = getContext().getContentResolver().openInputStream(uri)) {
            if (in == null) throw new IOException("no stream");
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) != -1) {
                if (out.size() + n > MAX_BYTES) throw new IOException("too big");
                out.write(buf, 0, n);
            }
            file.put("text", new String(out.toByteArray(), StandardCharsets.UTF_8));
        } catch (IOException | SecurityException e) {
            file.put("error", "too big".equals(e.getMessage()) ? "That file is too big to be a workout log." : "LogIt couldn't read that file.");
        }
        pending = file;
        notifyListeners("fileShared", new JSObject(), true);
    }

    private String displayName(Uri uri) {
        try (Cursor c = getContext().getContentResolver().query(uri, new String[] { OpenableColumns.DISPLAY_NAME }, null, null, null)) {
            if (c != null && c.moveToFirst() && !c.isNull(0)) return c.getString(0);
        } catch (Exception ignored) {
        }
        String last = uri.getLastPathSegment();
        return last != null ? last : "shared.csv";
    }
}
