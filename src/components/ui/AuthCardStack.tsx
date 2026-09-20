'use client'

import type { ReactNode } from "react";
import { useNativeGoogleSignIn } from "@/utils/hooks/useNativeGoogleSignIn";

/**
 * A Clerk card (`<SignIn />`, `<SignUp />`) with the app's own Google button
 * stacked over it. Both auth screens want exactly this, which is why it isn't
 * written out twice — and it can't fold into `AuthScreen`, which also carries
 * /join's guest form, where a Google button has no business.
 *
 * In a browser there is no button and this is a bare wrapper around the card.
 * In the native Android shell it is the whole Google story: Clerk's own Google
 * button can't work there and only ever produces an error, so
 * `.ag-auth-stack--native` hides it and this offers the native one in its
 * place. See `useNativeGoogleSignIn` for why the WebView can't use Clerk's.
 */
export default function AuthCardStack({ children }: { children: ReactNode }) {
    const { status, error, detail, signIn } = useNativeGoogleSignIn();
    // Every status but `absent` means the app, and in the app Clerk's Google
    // button is hidden whether or not this shell can offer a replacement —
    // `unavailable` and `outdated` are exactly the cases where it can't, and
    // where leaving Clerk's in place would strand the player in the system
    // browser (`capacitor.config.ts` keeps Google off `allowNavigation`).
    const native = status !== 'absent';

    return (
        <div className={`ag-stack ag-auth-stack${native ? ' ag-auth-stack--native' : ''}`}>
            {/* A shell too old to carry the plugin. Its Clerk Google button is
                hidden too, deliberately: it was broken in those shells long
                before this screen stopped drawing it, so "update the app" is
                the honest thing to say rather than a dead end to tap. */}
            {status === 'outdated' && (
                <p className="ag-hint ag-hint--center">
                    Update the app to sign in with Google. Email and password work as they are.
                </p>
            )}
            {(status === 'ready' || status === 'busy') && (
                <>
                    <button
                        type="button"
                        className="ag-btn ag-btn--light ag-btn--block"
                        onClick={signIn}
                        disabled={status === 'busy'}
                    >
                        <GoogleMark />
                        {status === 'busy' ? 'Signing in…' : 'Continue with Google'}
                    </button>
                    {error && <p className="ag-hint ag-hint--center">{error}</p>}
                    {/* TEMPORARY, with `describeFailure` in the hook: a release
                        APK can't be attached to a debugger, so the one failure
                        we're still chasing has to say what it was on screen.
                        Goes when Google sign-in is confirmed working. */}
                    {detail && <pre className="ag-hint ag-auth-detail">{detail}</pre>}
                </>
            )}
            {children}
        </div>
    );
}

/** Google's mark, at the size `.ag-btn`'s flex row gives an icon. */
function GoogleMark() {
    return (
        <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
            <path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z" />
            <path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.3v5.7C7.8 41.1 15.3 46 24 46z" />
            <path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.3-2.8.7-4.1v-5.7H4.3A22 22 0 0 0 2 24c0 3.6.9 6.9 2.3 9.8l7.4-5.7z" />
            <path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 29.9 2 24 2 15.3 2 7.8 6.9 4.3 14.2l7.4 5.7c1.7-5.2 6.6-9.1 12.3-9.1z" />
        </svg>
    );
}
