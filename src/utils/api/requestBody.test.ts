import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { readJsonBody, readUsernameList } from "./requestBody";

function post(body: string): NextRequest {
    return new NextRequest("https://example.test/api/thing", { method: "POST", body });
}

describe("readJsonBody", () => {
    it("reads a JSON object", async () => {
        expect(await readJsonBody(post('{"gameId":"abc"}'))).toEqual({ gameId: "abc" });
    });

    it("answers an empty object for a body that isn't JSON", async () => {
        // The route's own "missing gameId" check then answers 400, instead of
        // the throw becoming an unhandled 500.
        expect(await readJsonBody(post("not json at all"))).toEqual({});
        expect(await readJsonBody(post(""))).toEqual({});
    });

    it("answers an empty object for JSON that isn't an object", async () => {
        expect(await readJsonBody(post("null"))).toEqual({});
        expect(await readJsonBody(post("[1,2,3]"))).toEqual({});
        expect(await readJsonBody(post('"hello"'))).toEqual({});
        expect(await readJsonBody(post("7"))).toEqual({});
    });
});

describe("readUsernameList", () => {
    it("accepts a list of names, empty included", () => {
        expect(readUsernameList(["ann", "bob"])).toEqual(["ann", "bob"]);
        // An open-seat-only lobby names nobody, which is legitimate.
        expect(readUsernameList([])).toEqual([]);
    });

    it("refuses anything that isn't a list of non-empty strings", () => {
        expect(readUsernameList(undefined)).toBeNull();
        expect(readUsernameList("ann")).toBeNull();
        expect(readUsernameList(["ann", 7])).toBeNull();
        expect(readUsernameList(["ann", ""])).toBeNull();
        expect(readUsernameList(["ann", null])).toBeNull();
    });
});
