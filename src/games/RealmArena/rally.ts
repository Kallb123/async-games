import { rulesetOf, type RulesContext } from "@/games/RealmArena/rulesets";
import { freeSquares, freshTurn, isStanding, maxHpOf, SHRINE_OWNER, shrineOf, viewOf, type BattleState, type Fighter } from "@/games/RealmArena/rules";
import type { ItemId } from "@/games/RealmArena/characters";
import { pluralize } from "@/utils/ui/text";
import type { Square } from "@/utils/games/battlefield/terrain";

// ═══════════════════════════════════════════════════════════════════════════
//  THE RALLY'S CHOICE (docs/games/realm-arena.md §39.4)
// ═══════════════════════════════════════════════════════════════════════════
//
// From rules version 12 a Hold Out wave heals nobody as it lands: each player
// of the team owes one choice instead, made as their next turn begins. This is
// the rule, browser-safe and pure, for the server (`RealmArenaAct`) and the
// turn sheet alike. It is deliberately not an `Action`: no planner, `act` or
// `check` ever sees it, and a warband never owes one.

/** What a player owing a rally may choose. Mend only where the team has a Shrine (realm-arena-hold-out.md §5.3). */
export type RallyChoice = "rally" | "reinforce" | "resupply" | "mend";

/** Every choice, in the order the turn sheet lists them. */
export const RALLY_CHOICES: readonly RallyChoice[] = ["rally", "reinforce", "resupply", "mend"];

/** What each choice looks like wherever it is shown: its glyph and its name. */
export const RALLY_LOOK: Readonly<Record<RallyChoice, { icon: string; name: string }>> = {
    rally: { icon: "✚", name: "Rally" },
    reinforce: { icon: "🛡️", name: "Reinforce" },
    resupply: { icon: "🎒", name: "Resupply" },
    mend: { icon: "⛩️", name: "Mend" },
};

/**
 * The command a player sends through `RealmArenaAct` to make their choice.
 * `fighter` is the downed character to bring back, which Reinforce needs and
 * nothing else takes.
 */
export interface RallyAction {
    kind: "rally";
    choice: RallyChoice;
    fighter?: number;
}

/** Whether a sent action is the rally's, whatever else it holds: the one test that decides which path a `RealmArenaAct` takes. */
export const isRallyAction = (action: unknown): action is RallyAction =>
    typeof action === "object" && action !== null && (action as { kind?: unknown }).kind === "rally";

/** A rally action rebuilt from the fields it is allowed to have, and nothing else a request carried. */
export function cleanRally(action: RallyAction): RallyAction {
    return action.choice === "reinforce" && action.fighter !== undefined
        ? { kind: "rally", choice: "reinforce", fighter: action.fighter } : { kind: "rally", choice: action.choice };
}

/** One of the three choices as a seat is offered it. */
export interface RallyOption {
    choice: RallyChoice;
    /** False when the choice would do nothing: the row is shown disabled, with its `reason`. */
    available: boolean;
    /** Why it isn't available, in the player's language. Only when `available` is false. */
    reason?: string;
    /** Reinforce only, when available: the seat's downed characters it may bring back. */
    downed?: Fighter[];
}

/** What a rally gives one character back (§30.11), or a Mend the Shrine (realm-arena-hold-out.md §5.3): half its HP, rounded down, never past full. The new HP. */
export function rallyHp(fighter: Fighter, context: RulesContext): number {
    const full = maxHpOf(fighter, context);
    return Math.min(full, fighter.hp + Math.floor(full / 2));
}

/** What a character returns at when it is reinforced: half its HP, rounded down, and at least 1. */
export function reinforcedHp(fighter: Fighter, context: RulesContext): number {
    return Math.max(1, Math.floor(maxHpOf(fighter, context) / 2));
}

/** The seat's characters that are down, in id order. Removed ones (a dropped player's) aren't on the battlefield at all. */
export const downedOf = (state: Pick<BattleState, "fighters">, seat: string): Fighter[] =>
    state.fighters.filter(fighter => fighter.owner === seat && !isStanding(fighter));

/**
 * The first free square of the seat's deployment zone, where a reinforcement
 * stands (the way a wave places the enemy's): one nobody standing is on, in
 * the state given. Undefined when the zone is full there, or the seat has none.
 */
export function reinforceSquare(state: BattleState, seats: readonly string[], seat: string): Square | undefined {
    const index = seats.indexOf(seat);
    return index < 0 ? undefined : freeSquares(state, state.field.deployments[index] ?? [])[0];
}

/** Whether a standing character of the seat has used up the item it mustered with. */
const usedUp = (fighter: Fighter, seat: string): boolean =>
    fighter.owner === seat && isStanding(fighter) && fighter.musteredItem !== undefined && fighter.item === null;

/** Standing characters of the seat that have used the item they mustered with. */
const resuppliable = (state: Pick<BattleState, "fighters">, seat: string): Fighter[] => state.fighters.filter(fighter => usedUp(fighter, seat));

/**
 * What brought the rally, as the turn sheet opens it (realm-arena-hold-out.md
 * §5.3): a wave landing, or — where the team has a Shrine, so nests produce the
 * enemy and no wave ever lands — a rally the team earned on the schedule or by
 * breaking a warband.
 */
export function rallyReason(state: Pick<BattleState, "fighters">): string {
    return shrineOf(state) ?"Your team has earned a rally." : "A fresh wave has landed.";
}

/**
 * Each of the choices for `seat`, in `RALLY_CHOICES` order, with whether
 * it would do anything. Rally is always there; Reinforce needs someone down and
 * a free square in the seat's deployment zone; Resupply needs someone standing
 * who has used up the item they mustered with; Mend, offered only where the team
 * has a Shrine (realm-arena-hold-out.md §5.3), needs it standing and hurt. `seats` is the players in seat
 * order, which the deployment zone is read by. What is available is judged from
 * the seat's own sight (`viewOf`), so a hidden enemy standing in the zone doesn't
 * make the answer differ between the sheet, which holds only the fogged view,
 * and the server, which holds the battle. Where the reinforcement then stands
 * is placed in truth (`rallied`).
 */
export function rallyOptionsOf(battle: BattleState, seats: readonly string[], seat: string): RallyOption[] {
    const state = viewOf(battle, seat);
    const downed = downedOf(state, seat);
    const square = reinforceSquare(state, seats, seat);
    const used = resuppliable(state, seat);
    const shrine = shrineOf(state);
    return RALLY_CHOICES.filter(choice => choice !== "mend" || shrine !== undefined).map((choice): RallyOption => {
        switch (choice) {
            case "rally": return { choice, available: true };
            case "reinforce":
                if (downed.length === 0) return { choice, available: false, reason: "No one of yours is down" };
                if (square === undefined) return { choice, available: false, reason: "No free square in your deployment zone" };
                return { choice, available: true, downed };
            case "resupply":
                return used.length === 0 ? { choice, available: false, reason: "No one standing has used up their item" } : { choice, available: true };
            case "mend":
                return shrine && isStanding(shrine) && shrine.hp < maxHpOf(shrine, state) ? { choice, available: true } : { choice, available: false, reason: "The Shrine isn't hurt" };
        }
    });
}

/**
 * Why a sent rally action can't be taken, or undefined when it can. Reads
 * everything from what was sent, as the command route accepts any JSON.
 */
export function rallyRefusal(state: BattleState, seats: readonly string[], seat: string, sent: unknown): string | undefined {
    if (!isRallyAction(sent)) return "That isn't a rally choice";
    const { choice, fighter } = sent as { choice?: unknown; fighter?: unknown };
    const option = rallyOptionsOf(state, seats, seat).find(one => one.choice === choice);
    if (!option) return "That isn't a rally choice";
    if (!option.available) return option.reason;
    if (choice === "reinforce" && (typeof fighter !== "number" || !option.downed?.some(one => one.id === fighter))) return "Pick one of your downed characters";
    return undefined;
}

/** Whether a Reinforce is on offer to the seat: someone down, and room for them by what the seat can see. Decides whether a wiped-out seat still has a turn. */
export const canReinforce = (state: BattleState, seats: readonly string[], seat: string): boolean =>
    rallyOptionsOf(state, seats, seat).find(option => option.choice === "reinforce")?.available === true;

/**
 * The choice a seat is taken to make when it doesn't (a turn timed out, a
 * harness without a menu): Rally, or — with nobody of theirs standing, so
 * nothing for a Rally to heal — Reinforce with their dearest downed character
 * (the most points, then the lowest id) when a Reinforce is on offer.
 */
export function defaultRally(battle: BattleState, seats: readonly string[], seat: string): RallyAction {
    const rally: RallyAction = { kind: "rally", choice: "rally" };
    if (battle.fighters.some(fighter => fighter.owner === seat && isStanding(fighter)) || !canReinforce(battle, seats, seat)) return rally;
    const { CHARACTERS } = rulesetOf(battle);
    const [dearest] = downedOf(battle, seat).sort((a, b) => CHARACTERS[b.character].points - CHARACTERS[a.character].points || a.id - b.id);
    return { kind: "rally", choice: "reinforce", fighter: dearest.id };
}

/**
 * Whether a Reinforce the seat was offered has nowhere to stand in truth: every
 * square it thought free is held by someone it couldn't see (§39.4). The choice
 * is then taken as a Rally instead, rather than refused, so a refusal tells
 * nothing about what is hidden.
 */
export const crowdedOut = (state: BattleState, seats: readonly string[], seat: string, action: RallyAction): boolean =>
    action.choice === "reinforce" && reinforceSquare(state, seats, seat) === undefined;

/**
 * The fighters once `seat` has made its choice. The action must have passed
 * `rallyRefusal`, and not be `crowdedOut`. Rally heals every standing character
 * of the seat by half; Reinforce stands the chosen downed one up at half HP on
 * the first free square of the zone, with a full turn's AP to spend at once;
 * Resupply hands every standing character that has used up its item the one it
 * mustered with.
 */
export function rallied(state: BattleState, seats: readonly string[], seat: string, action: RallyAction): Fighter[] {
    switch (action.choice) {
        case "rally":
            return state.fighters.map(fighter => fighter.owner === seat && isStanding(fighter) ? { ...fighter, hp: rallyHp(fighter, state) } : fighter);
        case "reinforce": {
            const square = reinforceSquare(state, seats, seat);
            return state.fighters.map(fighter => {
                if (fighter.id !== action.fighter || square === undefined) return fighter;
                const back = { ...fighter, hp: reinforcedHp(fighter, state), square };
                freshTurn(back, state);
                return back;
            });
        }
        case "resupply":
            return state.fighters.map(fighter => usedUp(fighter, seat) ? { ...fighter, item: fighter.musteredItem! } : fighter);
        case "mend":
            return state.fighters.map(fighter => fighter.owner === SHRINE_OWNER && isStanding(fighter) ? { ...fighter, hp: rallyHp(fighter, state) } : fighter);
    }
}

/** What a Rally would give the seat's standing characters back, all together: the HP the sheet says it is worth. */
export const rallyTotal = (state: BattleState, seat: string): number =>
    state.fighters.reduce((sum, fighter) => sum + (fighter.owner === seat && isStanding(fighter) ? rallyHp(fighter, state) - fighter.hp : 0), 0);

/** The items a Resupply would hand back to the seat's characters, one per character that has used theirs, in id order. */
export const resupplyItems = (state: Pick<BattleState, "fighters">, seat: string): ItemId[] =>
    resuppliable(state, seat).map(fighter => fighter.musteredItem!);

/**
 * A battle's rally choices as one result line ("Rallies: 3 rallies, 2
 * reinforcements, 1 resupply"), a kind nobody chose left out. Undefined when
 * there were none, as in a battle before the choice.
 */
export function rallyTally(rallies: Iterable<Pick<{ choice: RallyChoice }, "choice">>): string | undefined {
    const counts: Record<RallyChoice, number> = { rally: 0, reinforce: 0, resupply: 0, mend: 0 };
    for (const { choice } of rallies) counts[choice]++;
    const parts = [
        counts.rally > 0 && pluralize(counts.rally, "rally", "rallies"),
        counts.reinforce > 0 && pluralize(counts.reinforce, "reinforcement"),
        counts.resupply > 0 && pluralize(counts.resupply, "resupply", "resupplies"),
        counts.mend > 0 && pluralize(counts.mend, "mend"),
    ].filter((part): part is string => part !== false);
    return parts.length > 0 ? `Rallies: ${parts.join(", ")}` : undefined;
}
