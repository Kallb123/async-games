'use client'

import { ReactNode } from 'react';
import { ToastProvider } from './ToastContext';
import InstallBanner from './InstallBanner';
import { useServiceWorker } from '@/utils/hooks/useServiceWorker';

export default function Providers({ children }: { children: ReactNode }) {
    // App-wide, and both about the installed app: the worker that makes the app
    // installable and offline-capable, and the banner that offers the install.
    // This is the only client component wrapping every screen, so it is the one
    // place either can be mounted once rather than per page.
    useServiceWorker();

    return (
        <ToastProvider>
            {children}
            <InstallBanner />
        </ToastProvider>
    );
}
