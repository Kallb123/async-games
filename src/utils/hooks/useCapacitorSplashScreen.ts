'use client'

import { useEffect } from 'react';
import { SplashScreen } from '@capacitor/splash-screen';
import { isNativeShell } from '@/utils/native';

/**
 * Native Android shell only: dismisses the branded splash overlay
 * (`capacitor.config.ts`'s `plugins.SplashScreen`, `launchAutoHide: false`)
 * once this component has mounted and the page has painted. Without this the
 * overlay would never go away — no-ops outside Capacitor.
 */
export function useCapacitorSplashScreen() {
    useEffect(() => {
        if (!isNativeShell()) {
            return;
        }
        SplashScreen.hide();
    }, []);
}
