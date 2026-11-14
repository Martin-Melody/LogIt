package ie.logit.app;

import android.os.Bundle;
import android.webkit.WebSettings;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FileSaverPlugin.class);
        registerPlugin(PlayBillingPlugin.class);
        super.onCreate(savedInstanceState);
        // The app is served from https://localhost, so without this the WebView's
        // mixed-content policy silently blocks every http:// request to a self-hosted
        // server — defeating network_security_config.xml's cleartextTrafficPermitted,
        // which exists specifically so self-hosters on a LAN (no cert for a private IP)
        // can connect over plain HTTP.
        getBridge().getWebView().getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
    }
}
