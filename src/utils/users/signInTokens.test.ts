// Who is allowed to mint a sign-in token.
//
// A sign-in token *is* the account: whoever holds one becomes that user. That
// obligation used to be enforced by the module boundary — the minting function
// was private to `guest.ts`, reachable only through two functions that each
// encoded their own target rule. Sharing it with the Android app's Google
// route made it a bare `(userId, seconds) => credential` that any route can
// import, and the only thing between it and a route minting from
// `body.userId` is that somebody reads the docstring.
//
// So the importer list is the gate instead: adding one is a deliberate act
// with a test to update, and updating it means saying out loud how the new
// caller establishes that its target is who it says.

import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "fs";
import { join } from "path";

/** Every module that imports the minting function, and why it may. */
const ALLOWED = {
    'src/utils/users/guest.ts':
        'mints for a guest account it created a moment ago, and for that guest\'s resume link — '
        + 'the admin re-mint route goes through its `createResumeTicket`, not through this directly,'
        + ' which is the boundary still doing its job',
    'src/app/api/auth/googlenative/route.ts':
        'mints for the account whose address Google attested and whose own claim on it was proved',
};

function filesUnder(directory: string): string[] {
    return readdirSync(directory).flatMap(entry => {
        const path = join(directory, entry);
        if (statSync(path).isDirectory()) return filesUnder(path);
        return /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry) ? [path] : [];
    });
}

describe("mintSignInToken", () => {
    it("is imported only by callers that establish who they are minting for", () => {
        const importers = filesUnder('src')
            .filter(path => /from ['"][^'"]*users\/signInTokens['"]/.test(readFileSync(path, 'utf8')))
            .map(path => path.replace(/\\/g, '/'))
            .sort();

        expect(importers).toEqual(Object.keys(ALLOWED).sort());
    });
});
