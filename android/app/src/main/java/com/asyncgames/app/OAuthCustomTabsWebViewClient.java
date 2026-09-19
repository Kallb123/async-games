package com.asyncgames.app;

import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebView;
import com.capacitorjs.plugins.browser.Browser;
import com.getcapacitor.Bridge;
import com.getcapacitor.BridgeWebViewClient;

/**
 * Google's OAuth consent screen checks whether it's being shown inside a
 * plain embedded WebView rather than a real browser — and even when it lets
 * the screen through, it treats the WebView as a browser Google has never
 * seen this Google account sign into before, so picking an account there
 * doesn't reuse the sign-in already sitting in the phone's actual Chrome.
 * Clerk's own OAuth callback then also needs to land wherever that
 * conversation started, so the whole hop — Clerk's oauth_authorize kickoff,
 * Google's consent screen, and Clerk's callback — has to move together.
 *
 * Handing that whole hop to a Chrome Custom Tab keeps it inside Chrome's own
 * signed-in session (an already-signed-in Google account "just works", no
 * WebView involved for Google to be suspicious of), and Android's verified
 * asyncgames.com App Link (see AndroidManifest.xml, ANDROID_APP_FINGERPRINT)
 * hands Clerk's final redirect back into this WebView once the exchange
 * completes, the same way a shared join link already returns here.
 *
 * Everything else — including the plain first-load session-cookie handshake
 * through clerk.asyncgames.com that `allowNavigation` in capacitor.config.ts
 * covers — keeps going through the ordinary WebViewClient path.
 */
class OAuthCustomTabsWebViewClient extends BridgeWebViewClient {

    private final Browser browser;

    OAuthCustomTabsWebViewClient(Bridge bridge, Browser browser) {
        super(bridge);
        this.browser = browser;
    }

    @Override
    public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (request.isForMainFrame() && isOAuthHop(url)) {
            browser.open(url);
            return true;
        }
        return super.shouldOverrideUrlLoading(view, request);
    }

    private boolean isOAuthHop(Uri url) {
        String host = url.getHost();
        if (host == null) {
            return false;
        }
        if (host.equals("accounts.google.com")) {
            return true;
        }
        // Clerk's own kickoff/callback for the OAuth flow lives on the same
        // Frontend API host as the plain session handshake, so it's the path
        // rather than the host that tells the two apart.
        String path = url.getPath();
        return host.equals("clerk.asyncgames.com") && path != null && path.contains("oauth");
    }
}
