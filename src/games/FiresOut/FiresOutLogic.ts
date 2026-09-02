import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { IFiresOutGameData } from "@/games/FiresOut/FiresOutModels";
import { VICTIMS_TO_WIN } from "@/games/FiresOut/board";

// ═══════════════════════════════════════════════════════════════════════════
//  FIRES OUT
// ═══════════════════════════════════════════════════════════════════════════
//
// fires-out-gdd.md §17.6 step 3: this file has to exist with FiresOutGameType
// and a skeleton FiresOutAction by the end of this step (not step 4) —
// gameRegistry.test.ts discovers a game by its meta.ts and then demands the
// @/games/FiresOut/FiresOutLogic barrel export, and CreateGame (in
// FiresOutModels.ts) needs FiresOutGameType regardless. Step 4 fills
// FiresOutAction's Execute in.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

@serializable
export class FiresOutGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "FiresOut";
    friendlyName: string = "Fires Out!";
    icon: string = "";
    url: string = "firesout";
    readonly className: string = "FiresOutGameType";

    // §17.2 gap 3: the engine's turn belongs to a *player* (currentTurn), but
    // this game's belongs to a *figure* (activeFirefighter). A command that
    // ends a turn has already advanced activeFirefighter and decided
    // turnOver itself (true only when the next figure has a different
    // owner — see FiresOutAction's 'endTurn' kind, step 4); this just syncs
    // currentTurn to match, and refills the AP the new figure's turn opens
    // with (their base allowance plus whatever they banked last time).
    CheckEndTurn(gameData: IGameData, commandOutcome: ICommandOutcome): void {
        if (!commandOutcome.turnOver) return;
        const gs = (gameData as IFiresOutGameData).specificGameState;
        const next = gs.firefighters[gs.activeFirefighter];
        gameData.currentTurn = next.ownerId;
    }

    CheckGameOver(gameData: IGameData): boolean {
        const fo = gameData as IFiresOutGameData;
        // Losses (§5: 4 victims lost, or the building collapses) can't happen
        // yet — step 4 ships nothing that can lose a victim or damage a wall
        // on purpose. Only the win condition is checked here for now.
        if (fo.complete) return true;

        if (fo.specificGameState.rescued < VICTIMS_TO_WIN) return false;

        fo.complete = true;
        fo.winner = '';
        fo.endReason = 'teamwin';
        fo.currentTurn = '';
        fo.gameState.history.unshift({ text: `${VICTIMS_TO_WIN} victims rescued — the crew wins!` });
        return true;
    }
}

// ─── FiresOutAction ─────────────────────────────────────────────────────────
// Step 4 (fires-out-gdd.md §17.6) fills this in: move, door, extinguish, chop
// and endTurn, following §21.4's "one parameterised action per game, not one
// class per move type" precedent from Outbreak.

export type FiresOutActionKind = 'move' | 'door' | 'extinguish' | 'chop' | 'endTurn';

@serializable
export class FiresOutAction implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    readonly className: string = "FiresOutAction";
    kind: FiresOutActionKind = 'endTurn';
    target?: number;
    carry?: boolean;

    myString(): string {
        return `played ${this.kind}`;
    }

    async Execute(_gameData: IGameData): Promise<ICommandOutcome> {
        return INVALID;
    }

    Undo(_gameData: IGameData): void {}
}
