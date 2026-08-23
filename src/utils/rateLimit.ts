import { NextRequest } from "next/server";
import { RateLimitModel } from "@/utils/mongodb/RateLimitData";

// Vercel (and any proxy in front of it) sets x-forwarded-for; this Next
// version's NextRequest carries no IP of its own. The first entry is the
// client — everything after it is proxies the request passed through.
export function clientIp(request: NextRequest): string {
    const forwardedFor = request.headers.get('x-forwarded-for');
    if (forwardedFor) {
        return forwardedFor.split(',')[0].trim();
    }
    return request.headers.get('x-real-ip') ?? 'unknown';
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
        if (err?.code !== 11000) {
            throw err;
        }
        const doc = await RateLimitModel.findOneAndUpdate({ key }, { $inc: { count: 1 } }, { new: true }).exec();
        return doc!.count <= limit;
    }
}
