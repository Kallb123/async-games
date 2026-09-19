package com.asyncgames.app;

import com.capacitorjs.plugins.browser.Browser;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    // Swap in the WebViewClient that routes Google's OAuth screen to a
    // Custom Tab instead of the embedded WebView — see
    // OAuthCustomTabsWebViewClient for why. `load()` is where BridgeActivity
    // finishes building `bridge` (and the WebView it owns), so this is the
    // first point a client can be attached.
    @Override
    protected void load() {
        super.load();
        getBridge().setWebViewClient(new OAuthCustomTabsWebViewClient(getBridge(), new Browser(this)));
    }
}
