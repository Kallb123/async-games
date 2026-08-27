import { dbConnect } from "@/utils/mongodb/mongodb";
import { RateLimitModel } from "@/utils/mongodb/RateLimitData";
import { isDuplicateKeyError } from "@/utils/mongodb/duplicateKey";

// Vercel (and any proxy in front of it) sets x-forwarded-for; this Next
// version's NextRequest carries no IP of its own. The first entry is the
// client — everything after it is proxies the request passed through.
//
// Takes the headers rather than the request, so a page's `generateMetadata`
// (which is handed `headers()` from next/headers, never a NextRequest) can
// throttle on the same key a route handler does.
export function clientIp(headers: Pick<Headers, 'get'>): string {
    const forwardedFor = headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return headers.get('x-real-ip') ?? 'unknown';
}

// A fixed-window per-key counter (see RateLimitData): allow up to `limit`
// calls for the same (scope, identifier) within any windowMs-long bucket,
// and refuse the rest until the next one starts. `scope` keeps different
// endpoints' limits from sharing a counter under the same IP.
export async function consumeRateLimit(
    scope: string,
    identifier: string,
    limit: number,
    windowMs: number
): Promise<boolean> {
    // This is usually the first thing a request does, so it can be the first
    // thing on a cold instance to touch Mongo — and a query issued before
    // anything has connected doesn't fail, it sits in mongoose's buffer for
    // ten seconds and then throws. Every caller used to rely on some earlier
    // request having connected; the crawler fetching a shared link is exactly
    // the case where none has.
    await dbConnect();

    const windowStart = Math.floor(Date.now() / windowMs) * windowMs;
    const key = `${scope}:${identifier}:${windowStart}`;
    const update = { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date(windowStart + windowMs) } };
    try {
        const doc = await RateLimitModel.findOneAndUpdate({ key }, update, { upsert: true, new: true }).exec();
        return doc.count <= limit;
    } catch (err: any) {
        // Two requests racing to open the same brand-new window both hit the
        // unique index on `key` — the same duplicate-key retry the join
        // code generator already uses (src/app/api/lobby/route.ts), not a
        // real failure.
        if (!isDuplicateKeyError(err)) {
            throw err;
        }
        const doc = await RateLimitModel.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { new: true }).exec();
        return doc!.count <= limit;
    }
}
