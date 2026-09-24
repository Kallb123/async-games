import type { GameTutorial } from "@/utils/ui/gameTutorials";

// The two-minute guided tour of a first Race Cars match — shown once per
// account in place of the guide's auto-show (see docs/game-tutorials.md).
// Same shape as Dice Cities' tour: narration steps on the real board, and a
// do-it step for each thing a turn asks of the driver — the round-one getaway,
// the gear, and the space to stop on — then the tow, which the turn sheet
// offers only sometimes, so it is narrated rather than waited on.
//
// Circuit-agnostic for the same reason the guide is: the host picks the track,
// so no step names a corner. The board prints those.
//
// A turn here has more phases than Dice Cities' one roll, so the signals split
// them (page.tsx derives each off the driver's own `phase`):
// - `canLaunch` / `canShift` — the round-one d20 or a gear is this driver's to
//   pick right now. Mutually exclusive: a car is in one phase at a time.
// - `hasLaunched` — the d20 has been thrown. Read off the recorded roll rather
//   than the phase: a stalled car stays in `start` with its turn over, and a
//   step waiting on the phase would never advance.
// - `hasShifted` — the gear is picked, so the phase has moved on from `shift`.
// - `hasMoved` — nothing is left to drive this turn (the move is made, the
//   tow is on offer, the undo hold is counting down, or it isn't this driver's
//   turn at all). The "pick a space" step waits on it, and so drops out of a
//   tour taken off-turn.
// - `waiting` — off-turn, when the turn sheet is on screen but inert.
export type RaceCarsSignal = "canLaunch" | "hasLaunched" | "canShift" | "hasShifted" | "hasMoved" | "waiting";

export const tutorial: GameTutorial<RaceCarsSignal> = {
    steps: [
        {
            title: "Welcome to Race Cars",
            body: "First car across the line wins — one lap for a Sprint, two for a Grand Prix. Two minutes and you'll have the hang of it.",
        },
        {
            anchor: "scoreboard",
            title: "The field",
            body: "Everyone's place and race number, with their gear and what's left of their 🛞 tyres, 🛑 brakes and ⚙️ gearbox. Nothing refills those — they have to last the whole race.",
        },
        {
            // One sentence a pool rather than §13's usual two: the three are
            // spent three different ways, and each is a line a driver will
            // want to find again (docs/games/race-cars.md §11).
            anchor: "scoreboard",
            title: "Wear and tear",
            body: "🛞 Tyres go when you overshoot a corner, one a space, or when traffic stops you short. 🛑 Brakes you spend on purpose, a space off your roll each — plus one if a tow carries you into a corner. ⚙️ Gearbox pays for dropping more than one gear in a turn.",
        },
        {
            anchor: "rc-stats",
            title: "Your race",
            body: "Your lap, how far you are off the lead, and the corner that matters most right now: how far away it is, or the stops you've banked in it.",
        },
        {
            anchor: "board",
            title: "The circuit",
            body: "Each corner owes stops — turns you must end inside it before leaving. Leave early and it costs a tyre a space, or a spin if you can't pay.",
        },
        {
            anchor: "rc-sheet",
            title: "Your turn",
            body: "Your turn happens down here: the d20 getaway on round one, a gear to pick after that. It's read-only until your go.",
            when: "waiting",
        },
        {
            anchor: "rc-sheet",
            title: "Lights out",
            body: "Round one is a single d20: a 1 stalls you on the grid, a big roll is a flying start, and anything else gets you away in first.",
            when: "canLaunch",
            advanceOn: "hasLaunched",
            hint: "Tap Get away from the line",
        },
        {
            anchor: "rc-sheet",
            title: "Pick a gear",
            body: "Each gear rolls its own die, so you pick a range, not a number. Every row says where that range lands against the next corner.",
            when: "canShift",
            advanceOn: "hasShifted",
            hint: "Tap a gear",
        },
        {
            anchor: "board",
            title: "Choose where to stop",
            body: "The highlighted spaces are where the roll can finish. Too far for the corner? Spend brake points first to take spaces off it.",
            advanceOn: "hasMoved",
            hint: "Tap a highlighted space",
        },
        {
            anchor: "rc-sheet",
            title: "Slipstream",
            body: "Finish right behind another car, both in 4th or higher, and you're offered a free three-space tow here. Take it or wave it away.",
        },
        {
            anchor: "menu",
            title: "Anything else",
            body: "The full rules, the race history and this tour again all live here.",
        },
    ],
};
