// The hook needs the signed-in id and a fetched body, and both come from modules
// that would drag Clerk and the network into a node test — so they are stubbed
// and the hook's own state machine is what gets exercised.

import { beforeEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";

const refreshableData = { data: null as unknown, isLoading: false, isRefreshing: false, refresh: async () => {} };

vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: "me" } }) }));
vi.mock("./useRefreshableData", () => ({ useRefreshableData: () => refreshableData }));

// Below the mocks on purpose: vitest hoists `vi.mock` above the imports, so the
// hook picks up the stubs however this reads.
import { useGameChat } from "./useGameChat";

// Reset rather than relied on: every test below sets `data` itself, and a test
// that forgets should read as an empty thread, not silently inherit the last
// one's.
beforeEach(() => { refreshableData.data = { messages: [], readAt: null, hasMore: false }; });

/** Renders the hook the way an open chat panel does, and hands back its result. */
function renderOpenChat() {
    let result: ReturnType<typeof useGameChat> | null = null;
    function Harness() {
        result = useGameChat("game-1", true, true);
        return null;
    }
    renderToString(React.createElement(Harness));
    return result!;
}

const message = (messageId: string, timestamp: string) => ({
    messageId,
    senderId: "them",
    text: `msg ${messageId}`,
    timestamp,
});

describe("useGameChat", () => {
    // Regression: this was every game until someone had said something in it.
    it("settles on an empty thread instead of re-rendering forever", () => {
        refreshableData.data = { messages: [], readAt: null, hasMore: false };

        expect(renderOpenChat().messages).toEqual([]);
    });

    it("marks another player's messages unread when the thread has never been read", () => {
        refreshableData.data = { messages: [message("m1", "2026-01-01T00:00:00.000Z")], readAt: null, hasMore: false };

        expect(renderOpenChat().messages.map((m) => m.unread)).toEqual([true]);
        expect(renderOpenChat().hasUnread).toBe(true);
    });

    it("leaves messages the read marker already covers alone", () => {
        refreshableData.data = {
            messages: [message("m1", "2026-01-01T00:00:00.000Z"), message("m2", "2026-01-02T00:00:00.000Z")],
            readAt: "2026-01-02T00:00:00.000Z",
            hasMore: false,
        };

        expect(renderOpenChat().messages.map((m) => m.unread)).toEqual([false, false]);
        expect(renderOpenChat().hasUnread).toBe(false);
    });

    // The roll-forward that happens as a poll brings messages in *while the
    // panel is open* is not reachable from here: `renderToString` mounts a fresh
    // tree per call, so each one re-runs the opening capture rather than
    // carrying the previous render's state forward. This covers that capture
    // splitting a thread the marker falls in the middle of.
    it("marks only the messages that landed after the read marker", () => {
        refreshableData.data = {
            messages: [message("m1", "2026-01-01T00:00:00.000Z"), message("m2", "2026-01-02T00:00:00.000Z")],
            readAt: "2026-01-01T00:00:00.000Z",
            hasMore: false,
        };

        expect(renderOpenChat().messages.map((m) => m.unread)).toEqual([false, true]);
    });

    // What `send` puts on the wire. The route's own tests cover what it does
    // with a body; these cover the half the picker depends on — that a GIF is
    // sent as the two fields the server will resolve it from, and that a
    // caption-less one is a message at all (docs/chat-gifs.md §4e).
    describe("send", () => {
        /** The POST the hook made, parsed. */
        function postedBody(fetchSpy: ReturnType<typeof vi.spyOn>) {
            return JSON.parse(String((fetchSpy.mock.calls[0][1] as RequestInit).body));
        }

        function stubOkPost() {
            return vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
        }

        beforeEach(() => { vi.restoreAllMocks(); });

        it("sends a GIF as a provider and an id, and nothing else about it", async () => {
            const fetchSpy = stubOkPost();

            expect(await renderOpenChat().send("", { provider: "tenor", mediaId: "abc123" })).toBe(true);

            // Empty text is a message when a GIF carries it — and `gif` is the
            // ref, not an attachment: the server resolves every other field
            // from its own catalogue.
            expect(postedBody(fetchSpy)).toEqual({ text: "", gif: { provider: "tenor", mediaId: "abc123" } });
        });

        it("keeps a caption with the GIF, trimmed the way the route would", async () => {
            const fetchSpy = stubOkPost();

            await renderOpenChat().send("  this is you  ", { provider: "tenor", mediaId: "abc123" });

            expect(postedBody(fetchSpy).text).toBe("this is you");
        });

        it.each([
            ["neither text nor a GIF", "", undefined],
            ["a blank line and no GIF", "   ", undefined],
        ])("refuses %s without asking the server", async (_label, text, gif) => {
            const fetchSpy = stubOkPost();

            expect(await renderOpenChat().send(text, gif)).toBe(false);

            expect(fetchSpy).not.toHaveBeenCalled();
        });
    });
});
