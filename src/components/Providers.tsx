'use client'

import { ReactNode } from 'react';
import { ToastProvider } from './ToastContext';
import BottomBanner from './BottomBanner';
import { useServiceWorker } from '@/utils/hooks/useServiceWorker';
import { useCapacitorBackButton } from '@/utils/hooks/useCapacitorBackButton';

export default function Providers({ children }: { children: ReactNode }) {
    // App-wide: the worker that makes the app installable and offline-capable,
    // and the bottom banner that offers the install and the notification opt-in.
    // This is the only client component wrapping every screen, so it is the one
    // place either can be mounted once rather than per page.
    useServiceWorker();
    // Native Android shell only: makes the back button/gesture navigate the
    // app instead of exiting it. No-ops outside Capacitor.
    useCapacitorBackButton();

    return (
        <ToastProvider>
            {children}
            <BottomBanner />
        </ToastProvider>
    );
}
