'use client'

import { ReactNode } from 'react';
import { ToastProvider } from './ToastContext';
import BottomBanner from './BottomBanner';
import { useServiceWorker } from '@/utils/hooks/useServiceWorker';
import { useCapacitorBackButton } from '@/utils/hooks/useCapacitorBackButton';
import { useCapacitorSplashScreen } from '@/utils/hooks/useCapacitorSplashScreen';
import { useCapacitorDeepLinks } from '@/utils/hooks/useCapacitorDeepLinks';
import { useCapacitorPush } from '@/utils/hooks/useCapacitorPush';

export default function Providers({ children }: { children: ReactNode }) {
    // App-wide: the worker that makes the app installable and offline-capable,
    // and the bottom banner that offers the install and the notification opt-in.
    // This is the only client component wrapping every screen, so it is the one
    // place either can be mounted once rather than per page.
    useServiceWorker();
    // Native Android shell only: makes the back button/gesture navigate the
    // app instead of exiting it. No-ops outside Capacitor.
    useCapacitorBackButton();
    // Native Android shell only: dismisses the branded splash overlay once
    // this, the app's one always-mounted client component, has painted.
    useCapacitorSplashScreen();
    // Native Android shell only: a link to the site opened from outside the
    // app, and a push arriving or being tapped. Both are per-app listeners, so
    // this is the one place they can be registered once.
    useCapacitorDeepLinks();
    useCapacitorPush();

    return (
        <ToastProvider>
            {children}
            <BottomBanner />
        </ToastProvider>
    );
}
