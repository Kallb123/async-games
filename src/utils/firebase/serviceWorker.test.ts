// `public/firebase-messaging-sw.js` is a static file: it can't import from the
// app, so what it shares with the app is copied into it by hand, and what it
// promises the app it promises in prose. Both drift silently — the app keeps
// working, notifications just stop arriving, or start arriving twice, which is
// the failure mode nobody notices until a player complains.
//
// So this holds the worker to the contracts it can't state in code. It reads
// the file rather than executing it: a service worker needs `self`,
// `importScripts` and a live push event, none of which exist here.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import packageJson from '../../../package.json';

const worker = readFileSync(join(process.cwd(), 'public/firebase-messaging-sw.js'), 'utf8');

/** The versions the worker pulls the SDK from gstatic at. */
function importedSdkVersions(): string[] {
    return [...worker.matchAll(/gstatic\.com\/firebasejs\/([\d.]+)\//g)].map(match => match[1]);
}

function majorOf(version: string): string {
    return version.replace(/^[^\d]*/, '').split('.')[0];
}

describe('the messaging service worker', () => {
    it('pulls the SDK from gstatic', () => {
        expect(importedSdkVersions().length).toBeGreaterThanOrEqual(2);
    });

    it('imports every SDK bundle at the same version', () => {
        expect(new Set(importedSdkVersions()).size).toBe(1);
    });

    // A worker on the SDK's v10 wire format while the page is on v12 is a
    // combination nobody tested, and the symptom is a push that arrives and
    // shows nothing. Majors rather than exact versions: a patch bump in
    // package.json shouldn't fail CI, a major one should.
    it('runs the same major version of the SDK as the app', () => {
        const app = majorOf(packageJson.dependencies.firebase);
        for (const version of importedSdkVersions()) {
            expect(majorOf(version), `service worker imports firebase ${version}, app is on ${app}`).toBe(app);
        }
    });

    // The worker displays every push from its own `push` listener, because the
    // SDK won't when a window is visible. The failure mode of that arrangement
    // is *two* notifications per push — an `onBackgroundMessage` handler, or the
    // SDK's own display, showing one beside ours — and a player who gets
    // everything twice turns notifications off. One call site, no second path.
    it('has exactly one place that shows a notification', () => {
        expect(worker.match(/showNotification\(/g)).toHaveLength(1);
    });

    // The other half of that: the SDK only skips its own display because the
    // payload it is handed has no `notification` key left on it.
    it('takes the notification key off the payload the SDK sees', () => {
        expect(worker).toContain('delete newData.notification');
    });
});
