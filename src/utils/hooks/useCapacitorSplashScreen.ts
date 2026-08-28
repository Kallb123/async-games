'use client'

import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';

/**
 * Native Android shell only: dismisses the branded splash overlay
 * (`capacitor.config.ts`'s `plugins.SplashScreen`, `launchAutoHide: false`)
 * once this component has mounted and the page has painted. Without this the
 * overlay would never go away — no-ops outside Capacitor.
 */
export function useCapacitorSplashScreen() {
    useEffect(() => {
        if (!Capacitor.isNativePlatform()) {
            return;
        }
        SplashScreen.hide();
    }, []);
}
