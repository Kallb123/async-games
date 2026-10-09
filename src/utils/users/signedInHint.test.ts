import { describe, expect, it } from "vitest";

import { signedInHintFrom } from "@/utils/users/signedInHint";

describe("signedInHintFrom", () => {
    it("is true for a client_uat stamp, suffixed or not", () => {
        expect(signedInHintFrom([{ name: "__client_uat", value: "1760000000" }])).toBe(true);
        expect(signedInHintFrom([{ name: "__client_uat_Ab-d_9xZ", value: "1760000000" }])).toBe(true);
    });

    it("is false once Clerk has zeroed or emptied the stamp", () => {
        expect(signedInHintFrom([{ name: "__client_uat", value: "0" }])).toBe(false);
        expect(signedInHintFrom([{ name: "__client_uat_Ab-d_9xZ", value: "" }])).toBe(false);
    });

    it("is false with no stamp, and ignores cookies that only look similar", () => {
        expect(signedInHintFrom([])).toBe(false);
        expect(signedInHintFrom([
            { name: "__session", value: "a.jwt.here" },
            { name: "__client_uatx", value: "1760000000" },
            { name: "client_uat", value: "1760000000" },
        ])).toBe(false);
    });

    it("is true when any one instance's stamp is live", () => {
        expect(signedInHintFrom([
            { name: "__client_uat", value: "0" },
            { name: "__client_uat_Ab-d_9xZ", value: "1760000000" },
        ])).toBe(true);
    });
});
