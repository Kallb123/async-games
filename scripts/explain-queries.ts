// Phase 0 item 4 of docs/loading-performance-plan.md: how Mongo answers the
// dashboard and game reads, from `explain("executionStats")` against whatever
// database MONGODB_URI names. Production-shaped data is the point, so run it
// against production as a read-only user:
//
//   MONGODB_URI=… CLERK_SECRET_KEY=… npm run perf:explain -- --out explain.md
//   npm run perf:explain -- --user user_… --game <gameId> --out explain.md
//
// It doesn't restate any query. It runs the real reads — `buildDashboard` and
// `readGameForViewer`, which is the game route's — with the driver's command
// monitoring on, and asks Mongo to explain each command exactly as it was
// sent. A query changed in `src/` is explained as changed, with nothing here
// to update. Both resolve player names through Clerk, so CLERK_SECRET_KEY must
// be the one for the database's Clerk instance; without it, the reads after
// the names aren't reached, and the report says so.
//
// With no --user it takes the player in the most live games, and with no
// --game the largest live game, read as its first player: the worst case,
// which is what a tail is made of.
//
// Safe to point at production:
// - It refuses to start as a user that can write. `--writable` lets it run
//   anyway, which only CI's dedicated e2e database should need.
// - It never builds an index or a collection on connecting, as an app would.
// - It fails if anything it ran wrote to the database all the same.
// - The report names indexes, stages and counts — never an id, a name or a
//   filter's values — so `--out` can go into a checkpoint as it is. stderr is
//   not: a read that fails softly logs the ids it was reading.

import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import mongoose from 'mongoose';
import type { CommandStartedEvent, Document } from 'mongodb';
// Registers every game's GameData discriminator, so a game reads as its own class.
import '@/utils/mongodb/mongodb';
import { GameDataModel } from '@/utils/mongodb/GameData';
import { buildDashboard } from '@/utils/dashboard';
import { readGameForViewer } from '@/utils/games/readGame';
import { describePlan, errorLabel, explainableCommand, findExplain, writePrivileges } from './lib/explainPlan';

const { values: args } = parseArgs({
    options: {
        user: { type: 'string' },
        game: { type: 'string' },
        out: { type: 'string' },
        writable: { type: 'boolean', default: false },
    },
});

const uri = process.env.MONGODB_URI ?? '';
if (!uri) throw new Error('Set MONGODB_URI to the database to explain against (production, as a read-only user).');

const READS = new Set(['find', 'aggregate', 'count', 'distinct']);
const WRITES = new Set(['insert', 'update', 'delete', 'findAndModify', 'bulkWrite', 'create', 'createIndexes', 'drop', 'dropIndexes', 'dropDatabase', 'collMod', 'renameCollection']);

interface Captured { step: string; name: string; collection: string; command: Document }

async function main() {
    const captured: Captured[] = [];
    const writes: string[] = [];
    let step: string | undefined;

    await mongoose.connect(uri, { bufferCommands: false, monitorCommands: true, autoIndex: false, autoCreate: false });
    mongoose.connection.getClient().on('commandStarted', (event: CommandStartedEvent) => {
        if (READS.has(event.commandName)) {
            if (step) captured.push({ step, name: event.commandName, collection: String(event.command[event.commandName]), command: explainableCommand(event.command) });
        } else if (WRITES.has(event.commandName)) {
            writes.push(`${step ?? 'setup'}: ${event.commandName}`);
        }
    });
    const db = mongoose.connection.db!;

    const writable = writePrivileges(await db.command({ connectionStatus: 1, showPrivileges: true }));
    if (writable.length && !args.writable) {
        throw new Error(`This database user can write (${writable.join(', ')}). Connect as a read-only user, or pass --writable for a database it doesn't matter to.`);
    }

    /** Runs `work` with every command it sends recorded under `label`; what went wrong, if anything. */
    async function capture(label: string, work: () => Promise<unknown>): Promise<string | undefined> {
        step = label;
        try {
            await work();
            return undefined;
        } catch (error) {
            return errorLabel(error);
        } finally {
            step = undefined;
        }
    }

    // The sample: the busiest player and the biggest live game, unless named.
    const [busiest] = await GameDataModel.aggregate<{ _id: string }>([
        { $match: { complete: false } },
        { $unwind: '$userIdList' },
        { $group: { _id: '$userIdList', games: { $sum: 1 } } },
        { $sort: { games: -1 } },
        { $limit: 1 },
    ]);
    const userId = args.user ?? busiest?._id;
    const [game] = await GameDataModel.aggregate<{ gameId: string; viewer: string }>([
        { $match: args.game ? { gameId: args.game } : { complete: false } },
        { $project: { _id: 0, gameId: 1, viewer: { $first: '$userIdList' }, size: { $bsonSize: '$$ROOT' } } },
        { $sort: { size: -1 } },
        { $limit: 1 },
    ]);

    const failures: string[] = [];
    if (userId) {
        const failed = await capture('Dashboard', () => buildDashboard(userId));
        if (failed) failures.push(`The dashboard stopped part-way (${failed}), so the reads after it are missing. Is CLERK_SECRET_KEY the one for this database's Clerk instance?`);
    } else {
        failures.push('No live game to take a player from, so the dashboard was not explained. Pass --user.');
    }
    if (game) {
        const failed = await capture('Game', () => readGameForViewer(game.gameId, game.viewer));
        if (failed) failures.push(`The game read stopped part-way (${failed}), so the reads after it are missing.`);
    } else {
        failures.push(args.game ? 'No game with that id.' : 'No live game to explain the game read against. Pass --game.');
    }

    if (writes.length) {
        throw new Error(`Something wrote to the database while it was being explained, which a read must never do: ${writes.join(', ')}`);
    }

    const rows: string[] = [];
    for (const { step: label, name, collection, command } of captured) {
        let explained: Document;
        try {
            explained = await db.command({ explain: command, verbosity: 'executionStats' });
        } catch (error) {
            rows.push(`| ${label} | ${collection}.${name} | not explained: ${errorLabel(error)} | | | | |`);
            continue;
        }
        const found = findExplain(explained);
        const stats = found?.executionStats ?? {};
        const plan = describePlan(found?.queryPlanner?.winningPlan);
        const collscan = plan.includes('COLLSCAN') ? ' ⚠️' : '';
        rows.push(`| ${label} | ${collection}.${name} | ${plan}${collscan} | ${stats.nReturned ?? '—'} | ${stats.totalKeysExamined ?? '—'} | ${stats.totalDocsExamined ?? '—'} | ${stats.executionTimeMillis ?? '—'} |`);
    }

    // Live game sizes, by game: the checkpoint's question of whether a
    // projection is worth having before the document is read whole.
    const sizes = await GameDataModel.aggregate<{ _id: string; games: number; avgBytes: number; maxBytes: number; avgCommands: number; maxCommands: number }>([
        { $match: { complete: false } },
        { $project: { kind: 1, bytes: { $bsonSize: '$$ROOT' }, commands: { $size: { $ifNull: ['$gameState.commandHistory', []] } } } },
        { $group: { _id: '$kind', games: { $sum: 1 }, avgBytes: { $avg: '$bytes' }, maxBytes: { $max: '$bytes' }, avgCommands: { $avg: '$commands' }, maxCommands: { $max: '$commands' } } },
        { $sort: { maxBytes: -1 } },
    ]);
    const kb = (bytes: number) => `${Math.round(bytes / 1024)} KB`;

    const report = [
        '# Query explain report',
        '',
        `- Generated: ${new Date().toISOString()}`,
        `- Sample: ${args.user ? 'the given player' : 'the player in the most live games'}; ${args.game ? 'the given game' : 'the largest live game'}`,
        ...failures.map(failure => `- ⚠️ ${failure}`),
        '',
        '## Reads',
        '',
        'Each command as the app sent it, explained with `executionStats`. ⚠️ marks a collection scan.',
        '',
        '| Read | Command | Winning plan | Returned | Keys examined | Docs examined | ms |',
        '| --- | --- | --- | ---: | ---: | ---: | ---: |',
        ...rows,
        '',
        '## Live game documents',
        '',
        '| Game | Live | Average size | Largest | Average commands | Most commands |',
        '| --- | ---: | ---: | ---: | ---: | ---: |',
        ...sizes.map(row => `| ${row._id} | ${row.games} | ${kb(row.avgBytes)} | ${kb(row.maxBytes)} | ${Math.round(row.avgCommands)} | ${row.maxCommands} |`),
        '',
    ].join('\n');

    if (args.out) writeFileSync(args.out, report);
    console.log(report);
}

main()
    .catch(error => { console.error(error); process.exitCode = 1; })
    .finally(() => mongoose.disconnect());
