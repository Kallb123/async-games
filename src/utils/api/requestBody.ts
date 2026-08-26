import { NextRequest } from 'next/server';

/**
 * The JSON object a request carried, or an empty one.
 *
 * `await request.json()` throws on a body that isn't JSON — an empty POST, a
 * truncated upload, a probe — and an uncaught throw in a route handler is a
 * 500. Every one of those is really a 400, and the route already has the code
 * that says so: its own "missing gameId" / "missing token" check. Handing it
 * an empty object lets that check answer, instead of the route needing a
 * try/catch of its own to say the same thing.
 *
 * A JSON body that parses to something other than an object (`null`, `[]`,
 * `"hello"`, `7`) is the same story — nothing a caller destructures a field
 * off — so it comes back the same way.
 *
 * `T` is the shape the route *expects*, and it comes back as `Partial<T>`
 * because that is what a request body is: a claim, not a guarantee. Every
 * field still has to be checked before use, and the type is what makes the
 * compiler ask. Left as `Record<string, unknown>` when a route reads one or
 * two loose fields.
 */
export async function readJsonBody<T = Record<string, unknown>>(request: NextRequest): Promise<Partial<T>> {
    try {
        const body = await request.json();
        if (!body || typeof body !== 'object' || Array.isArray(body)) {
            return {};
        }
        return body as Partial<T>;
    } catch {
        return {};
    }
}

/**
 * The list of usernames a game-setup request is inviting, or null if the body
 * didn't carry a well-formed one.
 *
 * Every /api/newgame route and the lobby route take this field and hand it
 * straight to Clerk. It was read off an `await request.json()` typed as the
 * game's own request interface — a claim about the body, not a check on it —
 * so a request that simply omitted `userList` reached `usersByUsername` with
 * `undefined` and threw on `.length`. Checked once, here, rather than seven
 * times or not at all.
 */
export function readUsernameList(value: unknown): string[] | null {
    if (!Array.isArray(value) || value.some(name => typeof name !== 'string' || !name)) {
        return null;
    }
    return value as string[];
}
