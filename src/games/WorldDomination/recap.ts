import type { IRecapAdapter, IGameEvent, IRecapSummary, IRecapTip } from "@/utils/games/recap";
import type { ITurnSnapshot } from "@/utils/games/replay";
import type { IGameCommand, ICommandOutcome } from "@/utils/apiModels/GameLogic";
import type { IWorldDominationSpecificGameStateResponse, IWorldDominationPlayerStateResponse } from "./apiModels";
import { TERRITORIES, CONTINENTS, CONTINENT_ORDER } from "./board";

type WDState = IWorldDominationSpecificGameStateResponse;

// Finds a player's response-shaped state by their Clerk userId
function playerByUserId(
	state: WDState | undefined,
	userId: string
): IWorldDominationPlayerStateResponse | undefined {
	if (!state?.playerStates) return undefined;
	return Object.values(state.playerStates).find((p) => p.userId === userId);
}

// Get territory name by id
function territoryName(id: number): string {
	return TERRITORIES[id]?.name ?? `Territory ${id}`;
}

// A wd_battle/wd_occupy event carries a bit of extra bookkeeping — beyond the
// generic IGameEvent shape — so postProcess can recognise a conquest and its
// immediately-following occupation as one logical action and fold them
// together. Stripped back out before the events are returned to callers.
interface IWDConquestMeta {
	conquestTerritoryId?: number;
	conquestEliminated?: string | null;
}
type WDEvent = IGameEvent & IWDConquestMeta;

// Get continent bonus for a territory
function getContinentBonus(territoryId: number): number {
	const territory = TERRITORIES[territoryId];
	if (!territory) return 0;
	const continent = CONTINENTS[territory.continentId];
	return continent?.bonus ?? 0;
}

// Count owned territories in a continent
function countOwnedInContinent(state: WDState | undefined, username: string, continentId: string): number {
	if (!state?.territories) return 0;
	let count = 0;
	TERRITORIES.forEach((t) => {
		if (t.continentId === continentId && state.territories[t.id]?.owner === username) {
			count++;
		}
	});
	return count;
}

// Turns one replayed World Domination command into zero or more recap events.
// Focus on the meaningful beats: deployments, attacks (battles), card cashing, and fortifies.
function toEvents(
	prev: ITurnSnapshot,
	next: ITurnSnapshot,
	command: IGameCommand,
	_outcome: ICommandOutcome
): IGameEvent[] {
	const prevState = prev.specificGameState as WDState;
	const nextState = next.specificGameState as WDState;
	const name = command.senderUsername;
	const base = {
		id: command.id,
		commandId: command.id,
		timestamp: command.timestamp,
		actorId: command.senderId,
		actorUsername: name,
	};

	const events: IGameEvent[] = [];

	switch (command.className) {
		case "WorldDominationDeployArmies": {
			// Armies deployed (includes setup placements and reinforcements)
			const deployData = command as unknown as { territoryId: number; armies: number };
			const territory = TERRITORIES[deployData.territoryId];
			const prevArmies = prevState.territories?.[deployData.territoryId]?.armies ?? 0;
			const newArmies = nextState.territories?.[deployData.territoryId]?.armies ?? 0;
			const deployed = newArmies - prevArmies;

			if (deployed > 0) {
				events.push({
					...base,
					type: "wd_deploy",
					glyph: "◆",
					title: `${name} deployed ${deployed} armie${deployed === 1 ? "" : "s"}`,
					detail: `${territory?.name ?? `Territory ${deployData.territoryId}`} now has ${newArmies}`,
				});
			}
			break;
		}

		case "WorldDominationCashInCards": {
			// Card set cashed in for armies bonus
			const cardData = command as unknown as { cardSetBonus: number };
			const me = playerByUserId(nextState, command.senderId);
			events.push({
				...base,
				type: "wd_cards",
				glyph: "🃏",
				title: `${name} cashed in a card set`,
				detail: me ? `+${cardData.cardSetBonus} armies · ${me.cards.length} card${me.cards.length === 1 ? "" : "s"} left` : `+${cardData.cardSetBonus} armies`,
			});
			break;
		}

		case "WorldDominationAttack": {
			// Battle / attack
			const attackData = command as unknown as {
				fromTerritoryId: number;
				toTerritoryId: number;
				attackingDice: number;
			};
			const defender = nextState.territories?.[attackData.toTerritoryId]?.owner;
			const lastBattle = nextState.lastBattle;

			if (lastBattle) {
				const attacker = lastBattle.attackerDice?.length ?? 0;
				const defenderDice = lastBattle.defenderDice?.length ?? 0;
				const attackerLosses = lastBattle.attackerLosses ?? 0;
				const defenderLosses = lastBattle.defenderLosses ?? 0;
				const conquered = lastBattle.conquered;

				const fromName = territoryName(attackData.fromTerritoryId);
				const toName = territoryName(attackData.toTerritoryId);

				let detail = `${fromName} → ${toName} · losses: you ${attackerLosses}, ${defender} ${defenderLosses}`;

				const defenderUserId = defender
					? Object.values(nextState.playerStates).find(p => p.username === defender)?.userId
					: undefined;

				const event: WDEvent = {
					...base,
					// A conquering attack gets its own type (mirrors dc_roll/dc_reroll
					// in DiceCities/recap.ts) so summarize and postProcess can key off
					// it directly instead of sniffing the title text.
					type: conquered ? "wd_conquest" : "wd_battle",
					glyph: conquered ? "⚔️" : "🗡️",
					title: conquered
						? `${name} conquered ${toName}${lastBattle.defenderEliminated ? " and eliminated " + lastBattle.defenderEliminated : ""}`
						: `${name} attacked ${toName} from ${fromName}`,
					detail,
					affectedIds: defenderUserId ? [defenderUserId] : undefined,
				};
				// Tagged only on a conquest, so postProcess can recognise the occupy
				// command that must immediately follow it (the game blocks every
				// other command until that occupation resolves) and merge the two.
				if (conquered) {
					event.conquestTerritoryId = attackData.toTerritoryId;
					event.conquestEliminated = lastBattle.defenderEliminated;
				}
				events.push(event);
			}
			break;
		}

		case "WorldDominationOccupyTerritory": {
			// The command itself only carries the army count moved in — the
			// territory being occupied lives in pendingOccupation, which the
			// command clears on execution, so it has to be read from the
			// *pre*-command snapshot, not from the command or the post-state.
			const occupyData = command as unknown as { armies: number };
			const territoryId = prevState.pendingOccupation?.toTerritoryId;

			const event: WDEvent = {
				...base,
				type: "wd_occupy",
				glyph: "🚩",
				title: `${name} occupied ${territoryId !== undefined ? territoryName(territoryId) : "a territory"}`,
				detail: `${occupyData.armies} armie${occupyData.armies === 1 ? "" : "s"} moved in`,
			};
			event.conquestTerritoryId = territoryId;
			events.push(event);
			break;
		}

		case "WorldDominationFortify": {
			// Territory fortify (moving armies between own territories)
			const fortifyData = command as unknown as { fromTerritoryId: number; toTerritoryId: number; armies: number };
			const fromTerritory = TERRITORIES[fortifyData.fromTerritoryId];
			const toTerritory = TERRITORIES[fortifyData.toTerritoryId];

			events.push({
				...base,
				type: "wd_fortify",
				glyph: "🛡️",
				title: `${name} fortified ${toTerritory?.name ?? `Territory ${fortifyData.toTerritoryId}`}`,
				detail: `${fortifyData.armies} armie${fortifyData.armies === 1 ? "" : "s"} from ${fromTerritory?.name ?? `Territory ${fortifyData.fromTerritoryId}`}`,
			});
			break;
		}

		case "WorldDominationSkipFortify": {
			// Skip fortify phase
			events.push({
				...base,
				type: "wd_skip_fortify",
				glyph: "⏭️",
				title: `${name} skipped fortifying`,
			});
			break;
		}

		case "WorldDominationEndAttackPhase": {
			// End attack phase (implicit pass)
			// This is less interesting for recap, so we'll skip it
			break;
		}

		default:
			break;
	}

	return events;
}

// A conquest and its occupation are one logical action split across two
// commands (attack conquers → pendingOccupation → occupy moves armies in),
// and the game blocks every other command in between, so a wd_occupy always
// immediately follows the wd_battle that set up its territory. Fold the pair
// into one row rather than showing "occupied Territory <n>" as its own beat —
// this also fixes that row's territory name, which the occupy command itself
// has no way to carry (see the toEvents case above).
function postProcess(events: IGameEvent[]): IGameEvent[] {
	const merged: WDEvent[] = [];
	for (const raw of events) {
		const event = raw as WDEvent;
		const prev = merged[merged.length - 1];

		if (
			event.type === "wd_occupy" &&
			prev?.type === "wd_conquest" &&
			prev.actorId === event.actorId &&
			prev.conquestTerritoryId !== undefined &&
			prev.conquestTerritoryId === event.conquestTerritoryId
		) {
			const territoryLabel = territoryName(prev.conquestTerritoryId);
			const eliminatedPart = prev.conquestEliminated ? `, eliminating ${prev.conquestEliminated},` : "";
			const armiesPart = event.detail?.replace(/ moved in$/, "") ?? "some armies";
			merged[merged.length - 1] = {
				...prev,
				title: `${prev.actorUsername} conquered ${territoryLabel}${eliminatedPart} and moved in ${armiesPart}`,
			};
			continue;
		}

		merged.push(event);
	}

	return merged.map(({ conquestTerritoryId, conquestEliminated, ...rest }) => rest);
}

function summarize(events: IGameEvent[], forUserId: string): IRecapSummary {
	// wd_battle is a non-conquering attack; a conquering one is its own
	// wd_conquest type (see toEvents) so this doesn't need to inspect titles.
	const battles = events.filter((e) => e.type === "wd_battle").length;
	const deployments = events.filter((e) => e.type === "wd_deploy").length;
	const conquered = events.filter((e) => e.type === "wd_conquest").length;
	const fortifies = events.filter((e) => e.type === "wd_fortify").length;
	const cardsCashed = events.filter((e) => e.type === "wd_cards").length;

	let tail = ".";
	if (conquered > 0) {
		tail = conquered > 1
			? " — and there's been some serious conquering."
			: " — a territory changed hands.";
	} else if (battles > 0) {
		tail = " — the battle lines were drawn.";
	} else if (cardsCashed > 0) {
		tail = " — someone cashed in cards for reinforcements.";
	} else if (deployments > 0) {
		tail = " — armies were positioned.";
	}

	const totalTurns = deployments + battles + conquered + fortifies + cardsCashed;

	return {
		headline: "Your move 👋",
		subline: `${totalTurns} action${totalTurns === 1 ? "" : "s"} happened while you were away${tail}`,
	};
}

// Strategic tip: suggest next move based on board state
function tip(liveState: unknown, forUserId: string): IRecapTip | null {
	const state = liveState as WDState | undefined;
	const me = playerByUserId(state, forUserId);
	if (!me) return null;

	// Count territories owned
	const myTerritories = state?.territories?.filter((t) => t.owner === me.username).length ?? 0;

	// Check if we're close to a continent bonus
	let closestContinent: { id: string; needed: number; bonus: number } | null = null;
	for (const continentId of CONTINENT_ORDER) {
		const continent = CONTINENTS[continentId];
		const ownedCount = countOwnedInContinent(state, me.username, continentId);
		const territoryCount = TERRITORIES.filter((t) => t.continentId === continentId).length;
		const needed = territoryCount - ownedCount;

		if (needed > 0 && needed <= 3 && (closestContinent === null || needed < closestContinent.needed)) {
			closestContinent = { id: continentId, needed, bonus: continent.bonus };
		}
	}

	// Suggest based on what's closest
	if (closestContinent) {
		const continent = CONTINENTS[closestContinent.id as import("./board").WorldDominationContinentId];
		return {
			glyph: "🗺️",
			text: `You're ${closestContinent.needed} territory(ies) away from controlling ${continent.name} — worth ${closestContinent.bonus} armies.`,
		};
	}

	// General tip
	const cardCount = me.cards?.length ?? 0;
	if (cardCount >= 3) {
		return {
			glyph: "🃏",
			text: `You have ${cardCount} territory cards — enough to cash in for reinforcements.`,
		};
	}

	return null;
}

// Registered by the recap engine (src/utils/games/recap.ts)
export const worldDominationRecapAdapter: IRecapAdapter = {
	className: "WorldDominationGameType",
	toEvents,
	postProcess,
	summarize,
	tip,
};
