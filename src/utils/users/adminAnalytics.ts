import { getDeviceTokens } from "@/utils/firebase/deviceTokens";
import { pruneStaleTokens } from "@/utils/firebase/deviceInfo";
import { DeviceType } from "@/utils/firebase/TimedToken";
import { forEachClerkUser } from "@/utils/users/clerk";

export interface AdminAnalyticsBreakdownEntry {
    label: string;
    count: number;
}

export interface IAdminAnalyticsResponse {
    /** How many Clerk users were walked to build this. */
    scannedUsers: number;
    /** Accounts with at least one registered device. */
    usersWithDevices: number;
    /** Total registered devices across every account. */
    totalDevices: number;
    /** Desktop vs mobile vs tablet, most common first. */
    byType: AdminAnalyticsBreakdownEntry[];
    /** Operating system, most common first. */
    byOs: AdminAnalyticsBreakdownEntry[];
    /** Browser, most common first. */
    byBrowser: AdminAnalyticsBreakdownEntry[];
}

const TYPE_LABELS: Record<DeviceType, string> = {
    desktop: 'Desktop',
    mobile: 'Mobile',
    tablet: 'Tablet',
    unknown: 'Unknown',
};

const UNKNOWN_LABEL = 'Unknown';

function increment(counts: Map<string, number>, label: string): void {
    counts.set(label, (counts.get(label) ?? 0) + 1);
}

// Most common first, alphabetical after that so a tie doesn't reorder itself
// between one request and the next.
function sortedEntries(counts: Map<string, number>): AdminAnalyticsBreakdownEntry[] {
    return [...counts.entries()]
        .sort(([labelA, countA], [labelB, countB]) => countB - countA || labelA.localeCompare(labelB))
        .map(([label, count]) => ({ label, count }));
}

/**
 * What the registered push devices across every account look like — desktop
 * vs mobile, which OS, which browser (docs/admin-tools.md) — built fresh from
 * Clerk on every request rather than kept in sync somewhere: this is looked
 * at rarely enough that a walk of the instance each time is cheaper than a
 * second copy of the data to keep correct.
 *
 * Walks the same way `listGuestAccounts` does (`forEachClerkUser`), reading
 * each user's own device list rather than a Mongo collection — a device
 * registration lives in Clerk private metadata (see `deviceTokens.ts`), not
 * the database. Pruned the same way the device list a player sees is, so a
 * device the app has already forgotten doesn't inflate the count.
 */
export async function buildDeviceAnalytics(): Promise<IAdminAnalyticsResponse> {
    const byType = new Map<string, number>();
    const byOs = new Map<string, number>();
    const byBrowser = new Map<string, number>();
    let usersWithDevices = 0;
    let totalDevices = 0;

    const scannedUsers = await forEachClerkUser(async user => {
        const tokens = pruneStaleTokens(getDeviceTokens(user));
        if (tokens.length === 0) {
            return;
        }
        usersWithDevices++;
        for (const token of tokens) {
            totalDevices++;
            increment(byType, TYPE_LABELS[token.device?.type ?? 'unknown']);
            increment(byOs, token.device?.os ?? UNKNOWN_LABEL);
            increment(byBrowser, token.device?.browser ?? UNKNOWN_LABEL);
        }
    });

    return {
        scannedUsers,
        usersWithDevices,
        totalDevices,
        byType: sortedEntries(byType),
        byOs: sortedEntries(byOs),
        byBrowser: sortedEntries(byBrowser),
    };
}
