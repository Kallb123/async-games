import { NextResponse } from 'next/server';

// Served at /.well-known/assetlinks.json (see the rewrite in next.config.mjs;
// the App Router can't name a folder with a leading dot).
//
// This is the site's half of an Android App Link: it names the app allowed to
// speak for this domain, and Android will only open `asyncgames.com` links in
// the app once it has fetched this and matched the signing certificate of the
// installed APK against a fingerprint below. Without it the manifest's
// intent-filter still exists, but links keep going to the browser.
//
// Read from the environment rather than checked in because the value depends on
// which keystore signed the build — the release one for production, someone's
// debug keystore for a local install — and a file listing the wrong certificate
// is worse than no file at all. Set ANDROID_APP_FINGERPRINT to the SHA-256 of
// the signing certificate:
//
//   keytool -list -v -keystore release.keystore -alias async-games
//
// Comma-separate to trust more than one (e.g. release plus debug).

// The `applicationId` in android/app/build.gradle. Both halves have to agree.
const PACKAGE_NAME = 'com.asyncgames.app';

// The env var is read per request, so adding the fingerprint to the deployment
// doesn't need a rebuild — Android is likely to have cached a 404 for a while
// either way, and a redeploy on top of that is another wait.
export const dynamic = 'force-dynamic';

export async function GET() {
    const fingerprints = (process.env.ANDROID_APP_FINGERPRINT ?? '')
        .split(',')
        .map((fingerprint) => fingerprint.trim())
        .filter(Boolean);

    // Nothing configured: say so honestly. An empty statement list would tell
    // Android we have considered the question and the answer is no.
    if (!fingerprints.length) {
        return new NextResponse(null, { status: 404 });
    }

    return NextResponse.json([{
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
            namespace: 'android_app',
            package_name: PACKAGE_NAME,
            sha256_cert_fingerprints: fingerprints,
        },
    }]);
}
