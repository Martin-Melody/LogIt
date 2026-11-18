package ie.logit.app;

import android.app.ActivityOptions;
import android.content.ActivityNotFoundException;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ApplicationInfo;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.media.MediaMetadata;
import android.media.session.MediaController;
import android.media.session.MediaSession;
import android.media.session.MediaSessionManager;
import android.media.session.PlaybackState;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.os.SystemClock;
import android.provider.Settings;
import android.util.Base64;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Shows and controls whatever music app is playing (Spotify, YouTube Music, anything with a
 * media session), the same thing the lock screen's media controls use. Needs LogIt switched on
 * in Settings › Notification access (see MediaListenerService); no account or API key.
 *
 * Events: "nowPlaying" with the same shape getNowPlaying returns, whenever the playing app,
 * the track or play/pause/position changes.
 */
@CapacitorPlugin(name = "MediaControl")
public class MediaControlPlugin extends Plugin {

    private static final String EVENT = "nowPlaying";
    private static final int ART_SIZE_PX = 192;

    private MediaSessionManager sessionManager;
    private ComponentName listenerComponent;
    private final Handler main = new Handler(Looper.getMainLooper());

    private boolean watching = false;
    /** Every other app's session, each with a callback so a paused app starting up is noticed. */
    private final List<MediaController> sessions = new ArrayList<>();
    private final Map<MediaSession.Token, MediaController.Callback> callbacks = new HashMap<>();
    /** The one the bar shows: the playing one, else the last shown one, else the top one. */
    private MediaController current;

    // The cover is re-encoded only when the track changes, not on every play/pause.
    private String artKey;
    private String artData;

    private final MediaSessionManager.OnActiveSessionsChangedListener sessionsListener =
            this::setSessions;

    @Override
    public void load() {
        sessionManager = (MediaSessionManager) getContext().getSystemService(Context.MEDIA_SESSION_SERVICE);
        listenerComponent = new ComponentName(getContext(), MediaListenerService.class);
    }

    @Override
    protected void handleOnDestroy() {
        stopInternal();
    }

    private boolean hasAccess() {
        return NotificationManagerCompat.getEnabledListenerPackages(getContext())
                .contains(getContext().getPackageName());
    }

    // --- Access ---

    @PluginMethod
    public void isAccessGranted(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("granted", hasAccess());
        call.resolve(ret);
    }

    /** Opens LogIt's own switch in Notification access where Android supports it, else the list. */
    @PluginMethod
    public void openAccessSettings(PluginCall call) {
        Intent intent;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_DETAIL_SETTINGS);
            intent.putExtra(Settings.EXTRA_NOTIFICATION_LISTENER_COMPONENT_NAME,
                    listenerComponent.flattenToString());
        } else {
            intent = new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS);
        }
        try {
            getActivity().startActivity(intent);
        } catch (ActivityNotFoundException e) {
            try {
                getActivity().startActivity(new Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS));
            } catch (ActivityNotFoundException e2) {
                call.reject("This phone has no Notification access screen");
                return;
            }
        }
        call.resolve();
    }

    // --- Watching ---

    @PluginMethod
    public void startWatching(PluginCall call) {
        if (!hasAccess()) {
            JSObject ret = snapshot();
            ret.put("granted", false);
            call.resolve(ret);
            return;
        }
        main.post(() -> {
            try {
                if (!watching) {
                    sessionManager.addOnActiveSessionsChangedListener(sessionsListener, listenerComponent, main);
                    watching = true;
                }
                refreshSessions();
                JSObject ret = snapshot();
                ret.put("granted", true);
                call.resolve(ret);
            } catch (SecurityException e) {
                // Access was switched off between the check and the call.
                stopInternal();
                JSObject ret = snapshot();
                ret.put("granted", false);
                call.resolve(ret);
            }
        });
    }

    @PluginMethod
    public void stopWatching(PluginCall call) {
        main.post(() -> {
            stopInternal();
            call.resolve();
        });
    }

    @PluginMethod
    public void getNowPlaying(PluginCall call) {
        main.post(() -> {
            if (watching) refreshSessions();
            call.resolve(snapshot());
        });
    }

    private void stopInternal() {
        if (watching) {
            try {
                sessionManager.removeOnActiveSessionsChangedListener(sessionsListener);
            } catch (RuntimeException ignored) {
            }
            watching = false;
        }
        setSessionsQuietly(null);
        current = null;
    }

    private void refreshSessions() {
        try {
            setSessions(sessionManager.getActiveSessions(listenerComponent));
        } catch (SecurityException e) {
            setSessions(null);
        }
    }

    private void setSessions(List<MediaController> list) {
        setSessionsQuietly(list);
        choose();
    }

    private void setSessionsQuietly(List<MediaController> list) {
        for (MediaController c : sessions) {
            MediaController.Callback cb = callbacks.remove(c.getSessionToken());
            if (cb != null) c.unregisterCallback(cb);
        }
        sessions.clear();
        if (list == null) return;
        String self = getContext().getPackageName();
        for (MediaController c : list) {
            if (self.equals(c.getPackageName())) continue;
            MediaController.Callback cb = new MediaController.Callback() {
                @Override
                public void onPlaybackStateChanged(PlaybackState state) {
                    choose();
                }

                @Override
                public void onMetadataChanged(MediaMetadata metadata) {
                    choose();
                }

                @Override
                public void onSessionDestroyed() {
                    refreshSessions();
                }
            };
            c.registerCallback(cb, main);
            callbacks.put(c.getSessionToken(), cb);
            sessions.add(c);
        }
    }

    private void choose() {
        MediaController best = null;
        for (MediaController c : sessions) {
            if (isPlaying(c.getPlaybackState())) {
                best = c;
                break;
            }
        }
        if (best == null && current != null) {
            for (MediaController c : sessions) {
                if (c.getSessionToken().equals(current.getSessionToken())) {
                    best = c;
                    break;
                }
            }
        }
        if (best == null && !sessions.isEmpty()) best = sessions.get(0);
        current = best;
        notifyListeners(EVENT, snapshot());
    }

    private static boolean isPlaying(PlaybackState state) {
        if (state == null) return false;
        int s = state.getState();
        return s == PlaybackState.STATE_PLAYING || s == PlaybackState.STATE_BUFFERING;
    }

    // --- Snapshot ---

    private JSObject snapshot() {
        JSObject o = new JSObject();
        MediaController c = current;
        if (c == null) {
            o.put("available", false);
            return o;
        }
        o.put("available", true);
        String pkg = c.getPackageName();
        o.put("packageName", pkg);
        o.put("appName", appLabel(pkg));

        MediaMetadata m = c.getMetadata();
        String title = null, artist = null, album = null;
        long duration = 0;
        if (m != null) {
            title = firstText(m, MediaMetadata.METADATA_KEY_TITLE, MediaMetadata.METADATA_KEY_DISPLAY_TITLE);
            artist = firstText(m, MediaMetadata.METADATA_KEY_ARTIST, MediaMetadata.METADATA_KEY_ALBUM_ARTIST,
                    MediaMetadata.METADATA_KEY_DISPLAY_SUBTITLE);
            album = firstText(m, MediaMetadata.METADATA_KEY_ALBUM);
            duration = Math.max(0, m.getLong(MediaMetadata.METADATA_KEY_DURATION));
        }
        o.put("title", title);
        o.put("artist", artist);
        o.put("album", album);
        o.put("durationMs", duration);
        o.put("artwork", artwork(pkg, title, artist, album, m));

        PlaybackState st = c.getPlaybackState();
        o.put("isPlaying", isPlaying(st));
        if (st != null) {
            long actions = st.getActions();
            // Position is reported as of lastPositionUpdateTime (elapsedRealtime); hand the page a
            // wall-clock time so it can keep the seek bar moving without asking again.
            long sinceUpdate = SystemClock.elapsedRealtime() - st.getLastPositionUpdateTime();
            o.put("positionMs", Math.max(0, st.getPosition()));
            o.put("positionAtMs", System.currentTimeMillis() - Math.max(0, sinceUpdate));
            o.put("speed", st.getPlaybackSpeed());
            o.put("canSeek", (actions & PlaybackState.ACTION_SEEK_TO) != 0);
            o.put("canSkipNext", (actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
            o.put("canSkipPrevious", (actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
        } else {
            o.put("positionMs", 0);
            o.put("positionAtMs", System.currentTimeMillis());
            o.put("speed", 0);
            o.put("canSeek", false);
            o.put("canSkipNext", false);
            o.put("canSkipPrevious", false);
        }
        return o;
    }

    private static String firstText(MediaMetadata m, String... keys) {
        for (String k : keys) {
            CharSequence v = m.getText(k);
            if (v != null && v.length() > 0) return v.toString();
        }
        return null;
    }

    private String appLabel(String pkg) {
        try {
            PackageManager pm = getContext().getPackageManager();
            ApplicationInfo info = pm.getApplicationInfo(pkg, 0);
            return pm.getApplicationLabel(info).toString();
        } catch (PackageManager.NameNotFoundException e) {
            return null;
        }
    }

    private String artwork(String pkg, String title, String artist, String album, MediaMetadata m) {
        String key = pkg + "\u0000" + title + "\u0000" + artist + "\u0000" + album;
        if (key.equals(artKey)) return artData;
        artKey = key;
        artData = null;
        if (m == null) return null;
        Bitmap bmp = m.getBitmap(MediaMetadata.METADATA_KEY_ART);
        if (bmp == null) bmp = m.getBitmap(MediaMetadata.METADATA_KEY_ALBUM_ART);
        if (bmp == null) bmp = m.getBitmap(MediaMetadata.METADATA_KEY_DISPLAY_ICON);
        if (bmp == null || bmp.getWidth() <= 0 || bmp.getHeight() <= 0) return null;
        try {
            float scale = Math.min(1f, (float) ART_SIZE_PX / Math.max(bmp.getWidth(), bmp.getHeight()));
            Bitmap small = scale < 1f
                    ? Bitmap.createScaledBitmap(bmp, Math.round(bmp.getWidth() * scale),
                            Math.round(bmp.getHeight() * scale), true)
                    : bmp;
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            small.compress(Bitmap.CompressFormat.JPEG, 82, out);
            artData = "data:image/jpeg;base64," + Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP);
        } catch (RuntimeException e) {
            artData = null;
        }
        return artData;
    }

    // --- Controls ---

    private interface Action {
        void run(MediaController.TransportControls t);
    }

    private void control(PluginCall call, Action action) {
        main.post(() -> {
            if (current == null && watching) refreshSessions();
            MediaController c = current;
            if (c == null) {
                call.reject("Nothing is playing");
                return;
            }
            action.run(c.getTransportControls());
            call.resolve();
        });
    }

    @PluginMethod
    public void play(PluginCall call) {
        control(call, MediaController.TransportControls::play);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        control(call, MediaController.TransportControls::pause);
    }

    @PluginMethod
    public void next(PluginCall call) {
        control(call, MediaController.TransportControls::skipToNext);
    }

    @PluginMethod
    public void previous(PluginCall call) {
        control(call, MediaController.TransportControls::skipToPrevious);
    }

    @PluginMethod
    public void seekTo(PluginCall call) {
        // Not call.getLong(): it only accepts a value stored as a Long, and a song position
        // (e.g. 22000) arrives from the page as an Integer, so every seek was rejected.
        Object pos = call.getData().opt("positionMs");
        if (!(pos instanceof Number)) {
            call.reject("positionMs is required");
            return;
        }
        long p = Math.max(0, ((Number) pos).longValue());
        control(call, t -> t.seekTo(p));
    }

    /** Brings the playing app to the front. */
    @PluginMethod
    public void openPlayingApp(PluginCall call) {
        main.post(() -> {
            MediaController c = current;
            if (c == null) {
                call.reject("Nothing is playing");
                return;
            }
            // The session's own "open me" intent goes back to what's playing; else the launcher entry.
            if (c.getSessionActivity() != null) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                        // Android 14+: the music app's intent may only start an activity if we,
                        // the visible app sending it, say so.
                        ActivityOptions opts = ActivityOptions.makeBasic();
                        opts.setPendingIntentBackgroundActivityStartMode(
                                ActivityOptions.MODE_BACKGROUND_ACTIVITY_START_ALLOWED);
                        c.getSessionActivity().send(getContext(), 0, null, null, null, null, opts.toBundle());
                    } else {
                        c.getSessionActivity().send();
                    }
                    call.resolve();
                    return;
                } catch (Exception ignored) {
                }
            }
            Intent launch = getContext().getPackageManager().getLaunchIntentForPackage(c.getPackageName());
            if (launch == null) {
                call.reject("Can't open that app");
                return;
            }
            launch.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(launch);
            call.resolve();
        });
    }

    // --- Playlists ---

    /** Opens a playlist link in its app (or whatever handles it). */
    @PluginMethod
    public void openLink(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        if (open(url, call.getString("packageName"))) call.resolve();
        else call.reject("No app can open that link");
    }

    /**
     * Starts a playlist without leaving LogIt when the app's media session takes a URI
     * (playFromUri); otherwise opens the link in the app. Resolves { started, opened }.
     */
    @PluginMethod
    public void playLink(PluginCall call) {
        String url = call.getString("url");
        String playUri = call.getString("playUri");
        String pkg = call.getString("packageName");
        if (url == null || url.isEmpty()) {
            call.reject("url is required");
            return;
        }
        main.post(() -> {
            if (playUri != null && pkg != null && hasAccess()) {
                try {
                    for (MediaController c : sessionManager.getActiveSessions(listenerComponent)) {
                        if (!pkg.equals(c.getPackageName())) continue;
                        PlaybackState st = c.getPlaybackState();
                        if (st != null && (st.getActions() & PlaybackState.ACTION_PLAY_FROM_URI) != 0) {
                            c.getTransportControls().playFromUri(Uri.parse(playUri), null);
                            JSObject ret = new JSObject();
                            ret.put("started", true);
                            ret.put("opened", false);
                            call.resolve(ret);
                            return;
                        }
                    }
                } catch (SecurityException ignored) {
                }
            }
            boolean opened = open(url, pkg);
            JSObject ret = new JSObject();
            ret.put("started", false);
            ret.put("opened", opened);
            call.resolve(ret);
        });
    }

    private boolean open(String url, String pkg) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        if (pkg != null && isInstalled(pkg)) intent.setPackage(pkg);
        try {
            getContext().startActivity(intent);
            return true;
        } catch (ActivityNotFoundException e) {
            if (intent.getPackage() == null) return false;
            intent.setPackage(null);
            try {
                getContext().startActivity(intent);
                return true;
            } catch (ActivityNotFoundException e2) {
                return false;
            }
        }
    }

    private boolean isInstalled(String pkg) {
        try {
            getContext().getPackageManager().getPackageInfo(pkg, 0);
            return true;
        } catch (PackageManager.NameNotFoundException e) {
            return false;
        }
    }
}
