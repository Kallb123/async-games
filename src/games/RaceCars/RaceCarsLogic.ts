import type { IGameData } from "@/utils/mongodb/GameData";
import type { uuidString } from "@/utils/apiModels/GameDataApi";
import type { ICommandOutcome, IGameCommand, IGameType } from "@/utils/apiModels/gameCommand";
import { serializable } from "@/utils/apiModels/Serialisable";
import { v4 as uuidv4, NIL as NIL_UUID } from 'uuid';
import type { RaceCarsGear } from "@/games/RaceCars/board";

// ═══════════════════════════════════════════════════════════════════════════
//  RACE CARS
// ═══════════════════════════════════════════════════════════════════════════
//
// docs/games/race-cars.md §23.7 PR 2: the game type and a skeleton shift, so a
// created race has something to persist as its `gameType` and the registries
// have something to check. §23.4's three command classes arrive with the rules
// they enforce — `RaceCarsShift` and `RaceCarsMove` in PR 3, `RaceCarsSlipstream`
// in PR 5.

const INVALID: ICommandOutcome = { validMove: false, turnOver: false };

@serializable
export class RaceCarsGameType implements IGameType {
    gameId: uuidString = uuidv4() as uuidString;
    gameType: string = "RaceCars";
    friendlyName: string = "Race Cars";
    icon: string = "";
    url: string = "racecars";
    readonly className: string = "RaceCarsGameType";

    CheckEndTurn(_gameData: IGameData, _commandOutcome: ICommandOutcome): void {
        // PR 3 owns every line of this: advance `roundIndex` rather than
        // walking `turnOrder`, consume `skipNextTurn`, rebuild `roundOrder`
        // whole when the round wraps (§15), and reset the incoming driver's
        // `phase` to 'shift', `roll` to null and `brakeSpent` to 0 — the clause
        // turnTimeout.ts records this repo shipping without once already, on
        // Banned Islet's `actionsLeft`.
        //
        // Deliberately not the "step along turnOrder" placeholder every other
        // game's skeleton carries: here that is the wrong answer rather than a
        // partial one, because §23.4's whole argument is that the running order
        // is `roundOrder`/`roundIndex` and that `currentTurn` alone is not
        // proof of whose turn it is. Nothing can end a turn until the commands
        // arrive, so there is nothing to advance yet, and leaving it empty is
        // what stops a plausible-looking wrong version being left in place.
    }

    CheckGameOver(gameData: IGameData): boolean {
        // §4.1's win needs a car that can cross the line, which needs the
        // commands of PR 3. Until then nothing can finish a race, and this is
        // the pass-through the command route calls after every command — never
        // a method that literally does nothing, which would leave a game with a
        // `winner` and `complete: false`, still taking turns (§23.7 PR 3).
        return gameData.complete;
    }
}

// ─── RaceCarsShift ──────────────────────────────────────────────────────────

@serializable
export class RaceCarsShift implements IGameCommand {
    id: uuidString = uuidv4() as uuidString;
    timestamp: string = new Date().toISOString();
    gameId: uuidString = NIL_UUID as uuidString;
    senderId: string = 'Unknown';
    senderUsername: string = 'Unknown';
    /** The gear being declared, validated against §8.2 by `legalGears` in PR 3. */
    gear: RaceCarsGear = 0;
    readonly className = 'RaceCarsShift';

    myString() {
        return 'shifted gear';
    }

    // The skeleton of §23.4's first command class. PR 3 fills it in: the shift
    // validated against §8.2, the gearbox paid, the gear's die thrown
    // server-side and revealed in the same breath — with `recordedRoll` added
    // there, which is still "the PR that introduces the command" in the only
    // sense that matters, because a command whose Execute refuses can never
    // reach `commandHistory` (runCommand only records a valid move). Until
    // then every shift is refused, which is what an unraceable game should do
    // rather than mutate state it has no rules for.
    async Execute(_gameData: IGameData): Promise<ICommandOutcome> {
        return INVALID;
    }

    Undo(gameData: IGameData): void {
        gameData.gameState.commandHistory.pop();
    }
}
