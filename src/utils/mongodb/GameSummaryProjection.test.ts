// The guard on GAME_SUMMARY_PROJECTION: the dashboard reads every live game
// through it, so a summary (`CreateResponse`) that starts reading a field the
// projection leaves out would render that field blank on the home screen —
// quietly, with nothing failing. This test is what fails instead.
//
// For every game type it builds a full live document, then builds the summary
// twice: from the whole document, and from a document hydrated through the
// projection the way a `find(filter, projection)` hands one back. The two must
// be equal. No database is involved: `Model.hydrate(plain, projection)` applies
// an inclusion projection to a plain object (dotted paths included) and
// initialises only what survives, which is what the driver and Mongoose do
// between them for a real read — including skipping the defaults of paths that
// weren't selected.

import { existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@clerk/nextjs/server', async () => (await import('@/utils/testing/apiRoute')).clerkStub());

import type { Schema, SchemaType } from 'mongoose';
import { GAME_SUMMARY_PROJECTION, GameDataModel, GameDataSchema, IGameDataDocument } from './GameData';
import { gameDataModelFor } from './mongodb';
import { GAME_META } from '@/utils/ui/games';
import { SMARTTHINK_COMPUTER_ID } from '@/games/Smartthink/SmartthinkModels';
import type { UserDirectory } from '@/utils/users/clerk';

const ANN = 'user_ann';
const BOB = 'user_bob';
const CARL = 'user_carl';

// A directory that names everyone after their id, so a response built for the
// wrong seat, or from a missing id, reads differently.
const directory: UserDirectory = {
    name: userId => (userId ? `name:${userId}` : ''),
    imageUrl: () => null,
};

/** The games that persist as GameData, discovered from the folders under
 *  src/games the way gameRegistry.test.ts does, so a new game is covered the
 *  moment it is added rather than the moment somebody remembers this list. */
const gamesRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../games');
const gameTypes = readdirSync(gamesRoot).filter(name => existsSync(path.join(gamesRoot, name, 'meta.ts')))
    .filter(name => GAME_META[name.toLowerCase()]?.engine !== 'standalone');

// ---------------------------------------------------------------- fixtures

/**
 * A value of the kind a schema path holds, never an empty one: a string, a
 * number, a true. Used to fill every path of a game's own `specificGameState`
 * so that a summary which starts reading one of them finds a real value in the
 * full document and nothing in the projected one.
 */
function sampleOf(schemaType: SchemaType): unknown {
    const type = schemaType as SchemaType & {
        embeddedSchemaType?: SchemaType, schema?: Schema, $__schemaType?: SchemaType, options: { enum?: unknown[] },
    };
    switch (type.instance) {
        case 'String': return Array.isArray(type.options?.enum) ? type.options.enum[0] : 'sample';
        case 'Number': return 7;
        case 'Boolean': return true;
        case 'Date': return '2026-02-03T04:05:06.000Z';
        case 'ObjectId': return '64b000000000000000000001';
        case 'Array': return [type.embeddedSchemaType?.schema
            ? sampleOfSchema(type.embeddedSchemaType.schema)
            : type.embeddedSchemaType && sampleOf(type.embeddedSchemaType)];
        case 'Map': return { sample: type.$__schemaType ? sampleOf(type.$__schemaType) : 1 };
        case 'Embedded': return type.schema ? sampleOfSchema(type.schema) : {};
        default: return { sample: 1 };
    }
}

/** A schema path a document really holds: not Mongoose's own `_id`/`__v`, and
 *  not a map's value type, listed as `playerStates.$*` (the map itself carries it). */
function isRealPath(key: string): boolean {
    return key !== '_id' && key !== '__v' && !key.includes('$*');
}

/** Every top-level and dotted path of a schema, filled in. */
function sampleOfSchema(schema: Schema): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, schemaType] of Object.entries(schema.paths)) {
        if (!isRealPath(key)) continue;
        const parts = key.split('.');
        let at = out;
        for (const part of parts.slice(0, -1)) {
            at = (at[part] ??= {}) as Record<string, unknown>;
        }
        at[parts[parts.length - 1]] = sampleOf(schemaType);
    }
    return out;
}

/**
 * One live game of `gameType`, as the database holds it: the game's own state
 * filled by its schema, over a base whose every field is set to something other
 * than the schema's default, with a move history and a command log long enough
 * to be the bulk of the document.
 */
function fullGame(gameType: string, specificGameState: Record<string, unknown> = {}): Record<string, unknown> {
    const model = gameDataModelFor(gameType)!;
    const meta = GAME_META[gameType.toLowerCase()];
    const sampled = sampleOfSchema(model.schema);

    return {
        ...sampled,
        gameId: `00000000-0000-4000-8000-${gameType.length.toString().padStart(12, '0')}`,
        gameType: {
            gameId: 'gametype_1', gameType, friendlyName: meta.name, icon: 'icon.png', url: meta.url, className: `${gameType}GameType`,
        },
        kind: `${gameType}GameData`,
        userIdList: [ANN, BOB, CARL],
        turnTimer: '3 days',
        currentTurn: BOB,
        lastTurnTimestamp: '2026-03-04T05:06:07.000Z',
        timerWarningNotificationSent: true,
        missedTurnCounts: { [ANN]: 1, [BOB]: 2 },
        gameState: {
            turnOrder: [ANN, BOB, CARL],
            history: Array.from({ length: 40 }, (_, i) => ({
                text: `{{${ANN}}} did thing ${i}`, actorId: ANN, commandId: `command_${i}`, createdAt: '2026-03-04T05:06:07.000Z',
                perViewer: [{ userId: BOB, text: `You saw thing ${i}` }],
            })),
            commandHistory: Array.from({ length: 200 }, (_, i) => ({
                id: `command_${i}`, timestamp: '2026-03-04T05:06:07.000Z', gameId: 'game', senderId: ANN, className: 'SomeCommand',
                payload: { path: Array.from({ length: 20 }, (_unused, j) => i * j) },
            })),
            droppedPlayers: [CARL],
        },
        inviteId: '11111111-1111-4111-8111-111111111111',
        // Every ending-shaped field set, though a live game has none of them:
        // what a summary reads must differ from "unset" to be proven read.
        complete: true,
        winner: ANN,
        endReason: 'win',
        endDetail: 'the last square',
        forfeitedBy: CARL,
        specificGameState: { ...(sampled.specificGameState as object), ...specificGameState },
    };
}

/** What each game type is tried with. A summary may branch on a game's own
 *  state (Smartthink seats the computer when it set the code), so a branch's
 *  other arm is a fixture of its own. */
const fixtures: { label: string, plain: Record<string, unknown> }[] = [
    ...gameTypes.map(gameType => ({ label: gameType, plain: fullGame(gameType) })),
    { label: 'Smartthink set by the computer', plain: fullGame('Smartthink', { codeSetterId: SMARTTHINK_COMPUTER_ID }) },
];

const wholeSummary = (plain: Record<string, unknown>) =>
    (GameDataModel.hydrate(plain) as IGameDataDocument).CreateResponse(directory);
const projectedSummary = (plain: Record<string, unknown>, projection: Record<string, 1> = GAME_SUMMARY_PROJECTION) =>
    (GameDataModel.hydrate(plain, projection) as IGameDataDocument).CreateResponse(directory);

// ------------------------------------------------------------------- tests

describe('GAME_SUMMARY_PROJECTION', () => {
    it('is tried against every game that persists as GameData', () => {
        // The scanner itself: zero would let every test below pass vacuously.
        expect(gameTypes.length).toBeGreaterThanOrEqual(12);
        for (const gameType of gameTypes) {
            expect(gameDataModelFor(gameType), `${gameType} has no discriminator model`).toBeDefined();
        }
    });

    it.each(fixtures)('builds the same summary from a projected $label as from the whole document', ({ plain }) => {
        const whole = wholeSummary(plain);
        const projected = projectedSummary(plain);

        expect(projected).toEqual(whole);
        // The fixture is only worth something if the summary read real values:
        // an empty one would be equal to a blank.
        for (const [key, value] of Object.entries(whole)) {
            expect(value, `${key} is empty in the full-document summary`).toSatisfy(v => v !== undefined && v !== null && v !== '');
        }
    });

    it.each(fixtures)('hydrates a projected $label as its own game, without the bulk', ({ plain }) => {
        const document = GameDataModel.hydrate(plain, GAME_SUMMARY_PROJECTION) as IGameDataDocument;

        expect(document.constructor).toBe(gameDataModelFor((plain.gameType as { gameType: string }).gameType));
        const read = document.toObject();
        // What the projection exists to leave behind.
        expect(read.gameState?.commandHistory ?? []).toEqual([]);
        expect(read.gameState?.history ?? []).toEqual([]);
        expect(read).not.toHaveProperty('inviteId');
        expect(read).not.toHaveProperty('missedTurnCounts');
    });

    it('covers every path of the shared schema in the fixtures, so a new summary field is read from a real value', () => {
        for (const { label, plain } of fixtures) {
            for (const key of Object.keys(GameDataSchema.paths)) {
                if (!isRealPath(key)) continue;
                expect(plain, `${label} fixture leaves ${key} unset`).toHaveProperty(key);
            }
        }
    });

    it('would catch a field the summary reads being left out', () => {
        const smartthink = fixtures.find(fixture => fixture.label === 'Smartthink set by the computer')!.plain;
        const { ['specificGameState.codeSetterId']: _setter, ...withoutSetter } = GAME_SUMMARY_PROJECTION;
        const { kind: _kind, ...withoutKind } = GAME_SUMMARY_PROJECTION;
        const { forfeitedBy: _forfeitedBy, ...withoutForfeit } = GAME_SUMMARY_PROJECTION;

        // Smartthink's computer seat rides on its code setter...
        expect(projectedSummary(smartthink, withoutSetter)).not.toEqual(wholeSummary(smartthink));
        // ...a missing discriminator key hydrates the generic game, whose
        // CreateResponse is not Smartthink's...
        expect(projectedSummary(smartthink, withoutKind)).not.toEqual(wholeSummary(smartthink));
        // ...and an ordinary field goes blank.
        expect(projectedSummary(fixtures[0].plain, withoutForfeit)).not.toEqual(wholeSummary(fixtures[0].plain));
    });
});
