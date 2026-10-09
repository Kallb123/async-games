import type { Document } from 'mongodb';

/** An `explain` result's planner and stats, wherever an aggregate or a sharded cluster nested them. */
export function findExplain(node: unknown): { queryPlanner?: Document; executionStats?: Document } | undefined {
    if (!node || typeof node !== 'object') return undefined;
    const record = node as Document;
    if (record.queryPlanner && record.executionStats) return record;
    for (const value of Object.values(record)) {
        const found = findExplain(value);
        if (found) return found;
    }
    return undefined;
}

/**
 * A winning plan as its stages, outermost first, with the index each scan
 * used: `FETCH > IXSCAN userIdList_1_complete_1`. Follows the first input of a
 * stage with several (an `$or`'s branches), and the query plan inside a
 * slot-based engine's wrapper.
 */
export function describePlan(plan: Document | undefined): string {
    const stages: string[] = [];
    for (let at = plan?.queryPlan ?? plan; at; at = at.inputStage ?? at.inputStages?.[0]) {
        if (at.stage) stages.push(at.indexName ? `${at.stage} ${at.indexName}` : at.stage);
    }
    return stages.join(' > ') || '—';
}

/** The parts of a command `explain` refuses, or that are the driver's bookkeeping rather than the query. */
const DRIVER_FIELDS = new Set(['lsid', 'txnNumber', 'autocommit', 'startTransaction', 'readConcern', 'writeConcern', 'apiVersion', 'apiStrict', 'apiDeprecationErrors']);

/** A command as the driver sent it, cut down to the query itself so it can be explained. */
export function explainableCommand(command: Document): Document {
    return Object.fromEntries(Object.entries(command).filter(([key]) => !key.startsWith('$') && !DRIVER_FIELDS.has(key)));
}

/**
 * The actions MongoDB's built-in `read` and `readAnyDatabase` roles grant:
 * everything a read-only user may hold. Atlas's `read` also grants
 * `planCacheRead`, which reads the query planner's cache and changes nothing.
 */
const READ_ACTIONS = new Set(['find', 'listCollections', 'listIndexes', 'listSearchIndexes', 'listDatabases', 'collStats', 'dbStats', 'dbHash', 'killCursors', 'changeStream', 'planCacheRead']);

/**
 * What a `connectionStatus` (with `showPrivileges`) says the connection's user
 * may do beyond reading, or that nobody is signed in at all — a server with
 * authentication off lets anyone do anything. Empty only for a read-only user.
 * An allowlist, so an action this hasn't heard of counts against the user.
 */
export function beyondReading(status: Document): string[] {
    if (!status.authInfo?.authenticatedUsers?.length) return ['everything (nobody is signed in)'];
    const privileges: { actions?: string[] }[] = status.authInfo.authenticatedUserPrivileges ?? [];
    return [...new Set(privileges.flatMap(privilege => privilege.actions ?? []).filter(action => !READ_ACTIONS.has(action)))].sort();
}

/** An error, by name and code only: a server's message can quote the command it refused, filter values and all. */
export function errorLabel(error: unknown): string {
    if (!(error instanceof Error)) return 'unknown error';
    const code = (error as { code?: unknown }).code;
    return code === undefined ? error.name : `${error.name} ${String(code)}`;
}
