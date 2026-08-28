'use client'

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { closeTopmostRequest } from './useCloseRequest';

/**
 * Makes the Android hardware/gesture back button behave like a normal app
 * screen stack instead of quitting outright. Capacitor's Android shell has no
 * native back-stack handling of its own — with no `backButton` listener
 * registered, Android's back dispatcher just finishes the activity on every
 * press, no matter how many screens the Next.js router has pushed. Once a
 * listener is registered it takes over entirely, so this is also responsible
 * for the "go back one screen" case, not just the "land on home" one.
 *
 * It also has to stand in for `CloseWatcher`: registering this listener means
 * Android's back press is consumed here, at the native layer, before it ever
 * reaches the WebView — so a sheet or menu's own `CloseWatcher` (see
 * useCloseRequest) never sees the gesture and never gets a chance to close
 * itself first. Checking `closeTopmostRequest()` before navigating restores
 * that "close what's open before you leave the screen" behaviour.
 */
export function useCapacitorBackButton() {
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!Capacitor.isNativePlatform()) {
            return;
        }

        const listener = App.addListener('backButton', ({ canGoBack }) => {
            if (closeTopmostRequest()) {
                return;
            }
            if (pathname === '/') {
                App.exitApp();
            } else if (canGoBack) {
                router.back();
            } else {
                router.push('/');
            }
        });

        return () => {
            listener.then((handle) => handle.remove());
        };
    }, [pathname, router]);
}
