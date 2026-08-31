// `public/firebase-messaging-sw.js` is a static file: it can't import from the
// app, so the two things it shares with the app are copied into it by hand. A
// copy nobody checks is a copy that drifts, and both of these drift silently —
// the app keeps working, notifications just stop being delivered or stop being
// shown, which is the one failure mode nobody notices until a player complains.
//
// So this holds the worker to its two contracts. It reads the file rather than
// executing it: a service worker needs `self`, `importScripts` and a live push
// event, none of which exist here, and the parts worth testing are the two
// literals.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { NOTIFICATION_TEST_EVENT } from './pushNotification';
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

    // The worker shows this one push even when a window is visible, which is
    // what makes the Test button on Settings show something to the person who
    // pressed it. Renaming the event server-side without renaming it here would
    // leave that button silently doing nothing.
    it('knows the test push by the name the server sends', () => {
        expect(worker).toContain(`const TEST_EVENT = '${NOTIFICATION_TEST_EVENT}'`);
    });
});
