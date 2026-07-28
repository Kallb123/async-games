// ─── Settlements & Cities expansions ──────────────────────────────────────────
//
// Single source of truth for the optional expansions described in the game
// design document, section 8. Kept as a pure module (no React, no server-only
// imports) so it can be shared by the setup screen, the newgame API route, the
// invitation `CreateGame`, and the game logic alike.
//
// Each expansion is adapted from the classic Catan expansion line; the notes
// below mirror the design doc's compatibility matrix (§8.6) and player-count
// summary (§8.7).
//
// TODO(expansions): this module holds the selection framework —
// compatibility/player-count validation, persistence, and the victory-point
// target. The 5–6 Player Extension's Special Build Phase is now fully
// implemented (see GameLogic.ts + docs §9.1). The remaining deep per-expansion
// mechanics (ships & sea maps, commodities & knights combat, the Traders &
// Raiders scenarios, and the Explorers & Pirates campaign) are not yet built.
// Outstanding work is tracked in docs/games/settlements-and-cities.md §9.

export type SACExpansionId =
    | 'seasAndSailors'
    | 'knightsAndCommerce'
    | 'tradersAndRaiders'
    | 'explorersAndPirates'
    | 'fiveSixPlayerExtension';

// A full, persisted record of which expansions are enabled for a game. A full
// record (rather than a partial) keeps the Mongoose sub-schema deterministic.
export type SACExpansions = Record<SACExpansionId, boolean>;

// The four "major" expansions layer new mechanics; the 5–6 player extension is
// a seating/component add-on rather than a ruleset, so it's kept separate.
export const SAC_MAJOR_EXPANSION_IDS: SACExpansionId[] = [
    'seasAndSailors',
    'knightsAndCommerce',
    'tradersAndRaiders',
    'explorersAndPirates',
];

export const SAC_EXPANSION_IDS: SACExpansionId[] = [
    ...SAC_MAJOR_EXPANSION_IDS,
    'fiveSixPlayerExtension',
];

export interface SACExpansionMeta {
    id: SACExpansionId;
    name: string;
    /** The Catan set this expansion is adapted from. */
    source: string;
    tagline: string;
    /** False for the 5–6 player extension, which is a seating add-on. */
    major: boolean;
    disabled: boolean;
}

export const SAC_EXPANSION_META: SACExpansionMeta[] = [
    {
        id: 'seasAndSailors',
        name: 'Seas & Sailors',
        source: 'Catan: Seafarers',
        tagline: 'Explore open water, settle islands and race across the sea for bonus points.',
        major: true,
        disabled: true, 
    },
    {
        id: 'knightsAndCommerce',
        name: 'Knights & Commerce',
        source: 'Catan: Cities & Knights',
        tagline: 'Refine commodities, climb a tech tree and defend your cities from barbarians.',
        major: true,
        disabled: true,
    },
    {
        id: 'tradersAndRaiders',
        name: 'Traders & Raiders',
        source: 'Catan: Traders & Barbarians',
        tagline: 'A toolbox of standalone scenarios — rivers, caravans, fishing and more.',
        major: true,
        disabled: true, 
    },
    {
        id: 'explorersAndPirates',
        name: 'Explorers & Pirates',
        source: 'Catan: Explorers & Pirates',
        tagline: 'A standalone campaign of exploration, cargo ships and missions.',
        major: true,
        disabled: true,
    },
    {
        id: 'fiveSixPlayerExtension',
        name: '5–6 Player Extension',
        source: 'Catan 5–6 Player Extension',
        tagline: 'Extra components and a Special Build Phase so 5 or 6 can play at once.',
        major: false,
        disabled: false, 
    },
];

export function defaultExpansions(): SACExpansions {
    return {
        seasAndSailors: false,
        knightsAndCommerce: false,
        tradersAndRaiders: false,
        explorersAndPirates: false,
        fiveSixPlayerExtension: false,
    };
}

// Coerces arbitrary input (a partial object read off the wire or an older game
// document without the field) into a complete, boolean SACExpansions record.
export function normaliseExpansions(input?: Partial<SACExpansions> | null): SACExpansions {
    const base = defaultExpansions();
    if (!input) return base;
    for (const id of SAC_EXPANSION_IDS) {
        base[id] = input[id] === true;
    }
    return base;
}

export function anyExpansionEnabled(exp: SACExpansions): boolean {
    return SAC_EXPANSION_IDS.some(id => exp[id]);
}

// ─── Player-count bounds (design doc §8.7) ─────────────────────────────────────
// Base game seats 3–4. Only Traders & Raiders and Explorers & Pirates natively
// support 2 players. Reaching 5–6 always requires the 5–6 Player Extension.
export function computePlayerBounds(exp: SACExpansions): { min: number; max: number } {
    const min = exp.tradersAndRaiders || exp.explorersAndPirates ? 2 : 3;
    const max = exp.fiveSixPlayerExtension ? 6 : 4;
    return { min, max };
}

// ─── Victory-point target ──────────────────────────────────────────────────────
// Base game ends at 10 VP (§7). Knights & Commerce raises the bar to 13 (§8.2);
// Seas & Sailors scenarios typically target 12–14 (§8.1). We pick representative
// targets so the win condition genuinely varies with the chosen expansions.
export function computeVictoryTarget(exp: SACExpansions): number {
    if (exp.seasAndSailors && exp.knightsAndCommerce) return 14;
    if (exp.knightsAndCommerce) return 13;
    if (exp.seasAndSailors) return 12;
    return 10;
}

// ─── Compatibility validation (design doc §8.6) ────────────────────────────────

export interface SACExpansionValidation {
    ok: boolean;
    errors: string[];
    warnings: string[];
    min: number;
    max: number;
    victoryTarget: number;
}

// Validates a chosen expansion set (and, when known, the intended player count)
// against the compatibility matrix and player-count rules. Hard conflicts become
// errors (block creation); soft "partial" combos become warnings (allowed).
export function validateExpansions(
    exp: SACExpansions,
    playerCount?: number,
): SACExpansionValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Explorers & Pirates is a self-contained campaign — it never layers with
    // any other expansion (it may still use its own 5–6 seating extension).
    if (exp.explorersAndPirates) {
        const conflicting = SAC_MAJOR_EXPANSION_IDS.filter(
            id => id !== 'explorersAndPirates' && exp[id],
        );
        if (conflicting.length > 0) {
            errors.push(
                'Explorers & Pirates is a standalone campaign and cannot be combined with other expansions.',
            );
        }
    }

    // Seas & Sailors + Traders & Raiders is only a partial combo.
    if (exp.seasAndSailors && exp.tradersAndRaiders) {
        warnings.push(
            'Seas & Sailors + Traders & Raiders: only scenarios that don’t reserve fixed land tiles combine cleanly — others need house rules.',
        );
    }

    // The triple combo is possible but heavy.
    if (exp.seasAndSailors && exp.knightsAndCommerce && exp.tradersAndRaiders) {
        warnings.push(
            'Seas & Sailors + Knights & Commerce + Traders & Raiders is an advanced combo — expect long, complex sessions.',
        );
    }

    const { min, max } = computePlayerBounds(exp);

    if (playerCount !== undefined) {
        if (playerCount < min) {
            errors.push(`This setup needs at least ${min} players (currently ${playerCount}).`);
        } else if (playerCount > max) {
            if (!exp.fiveSixPlayerExtension && playerCount > 4) {
                errors.push(`Seating ${playerCount} players requires the 5–6 Player Extension.`);
            } else {
                errors.push(`This setup supports at most ${max} players (currently ${playerCount}).`);
            }
        }
    }

    return {
        ok: errors.length === 0,
        errors,
        warnings,
        min,
        max,
        victoryTarget: computeVictoryTarget(exp),
    };
}

// Names of the enabled expansions, for history/log lines.
export function enabledExpansionNames(exp: SACExpansions): string[] {
    return SAC_EXPANSION_META.filter(m => exp[m.id]).map(m => m.name);
}
