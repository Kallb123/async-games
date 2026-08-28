// The Digital Asset Links statement Android fetches before it will open
// asyncgames.com links in the app. Nothing here touches Clerk, Mongo or a
// request body, so the handler is called directly — the whole contract is what
// it does with one environment variable.

import { afterEach, describe, expect, it } from 'vitest';
import { GET } from './route';

const ORIGINAL = process.env.ANDROID_APP_FINGERPRINT;
const FINGERPRINT = 'A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90:A1:B2:C3:D4:E5:F6:07:18:29:3A:4B:5C:6D:7E:8F:90';

afterEach(() => {
    if (ORIGINAL === undefined) {
        delete process.env.ANDROID_APP_FINGERPRINT;
    } else {
        process.env.ANDROID_APP_FINGERPRINT = ORIGINAL;
    }
});

describe('GET /.well-known/assetlinks.json', () => {
    it('404s when no fingerprint is configured', async () => {
        delete process.env.ANDROID_APP_FINGERPRINT;

        const response = await GET();

        // Not an empty statement list: that would tell Android we considered
        // the question and the answer is no, which it would then cache.
        expect(response.status).toBe(404);
    });

    it('404s rather than publishing an empty statement for a blank value', async () => {
        process.env.ANDROID_APP_FINGERPRINT = '  ,  ';

        expect((await GET()).status).toBe(404);
    });

    it('publishes the configured fingerprint against the app package', async () => {
        process.env.ANDROID_APP_FINGERPRINT = FINGERPRINT;

        const response = await GET();

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual([{
            relation: ['delegate_permission/common.handle_all_urls'],
            target: {
                namespace: 'android_app',
                package_name: 'com.asyncgames.app',
                sha256_cert_fingerprints: [FINGERPRINT],
            },
        }]);
    });

    it('trusts more than one keystore when several are listed', async () => {
        process.env.ANDROID_APP_FINGERPRINT = ` ${FINGERPRINT}, ${FINGERPRINT} `;

        const [statement] = await (await GET()).json();

        expect(statement.target.sha256_cert_fingerprints).toEqual([FINGERPRINT, FINGERPRINT]);
    });
});
