'use client'

import { useEffect, useState } from 'react';
import { App } from '@capacitor/app';
import { isNativeShell } from '@/utils/native';

/** How the installed app names itself: `1.1 (2)` — versionName, then versionCode. */
export interface AppVersion {
    version: string;
    build: string;
}

/**
 * The version of the *native shell* the player is holding, or `null` in a
 * browser.
 *
 * It is a genuinely different number from the `package.json` version in the
 * settings footer, and that is the point: the web app redeploys on every merge,
 * while the APK is only rebuilt and reinstalled when someone cuts a release, so
 * a player on the app is running today's site inside a shell that could be
 * months old. When they report something odd, both halves are worth knowing —
 * "which site" and "which wrapper" are separate questions.
 *
 * The numbers come from `android/app/build.gradle` (`versionName`,
 * `versionCode`) by way of the OS, so there is nothing here to keep in step
 * with them.
 */
export function useAppVersion(): AppVersion | null {
    const [version, setVersion] = useState<AppVersion | null>(null);

    useEffect(() => {
        if (!isNativeShell()) {
            return;
        }
        let cancelled = false;
        App.getInfo()
            .then((info) => {
                if (!cancelled) {
                    setVersion({ version: info.version, build: info.build });
                }
            })
            // Nothing to show and nothing to do about it: the footer simply
            // says what it says on the web.
            .catch((error) => console.error('Failed to read the app version', error));
        return () => { cancelled = true; };
    }, []);

    return version;
}
