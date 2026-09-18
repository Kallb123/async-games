import type { GameGuide } from "@/utils/ui/gameGuides";

// The general how-to-play primer shown from the game-options menu and, once
// per account, the first time a player opens a Race Cars match (see
// useGameGuide).
//
// Deliberately circuit-agnostic: the host picks from `TRACK_LIST` at setup, so
// a guide that named Ashcombe's hairpin would be wrong for two of the three
// circuits. It teaches the gear ladder, the stop rule and the wear budget —
// the three things a driver has to hold in their head — and leaves the corner
// names to the board, which prints them (docs/games/race-cars.md §4, §6a, §7,
// §8, §10, §11, §12, §13, §14).
export const guide: GameGuide = {
    title: "How to play Race Cars",
    sections: [
        {
            heading: "Goal",
            body: "Be the first car across the finish line with the distance done — one lap for a Sprint, two for a Grand Prix. The race ends the instant someone crosses, so there is no tie-break and no final round: everybody else is placed by how far round the circuit they had got. Nobody is ever knocked out. A car that has spent everything it has just gets slow.",
        },
        {
            heading: "Your turn",
            body: "Three steps. Pick the gear you will drive, and its die is rolled straight away, in the open. Then move exactly that many spaces by tapping one of the highlighted spaces on the circuit — spending brake points first if you want the number smaller. Finally, if you finished right behind someone, take the slipstream tow or decline it. You can never choose to stop short: whatever you roll gets driven in full. Round one is the exception — everyone throws a single d20 to get off the line instead of picking a gear. A 1 bogs the engine down and you go nowhere, 17 or more is a flying start worth four spaces with no further roll, and anything in between gets away in 1st and rolls that gear's die for the move.",
        },
        {
            heading: "Gears and the dice",
            body: "Every gear rolls its own die, and each one covers its own band: 1st gives 1–2, 3rd gives 4–8, 5th gives 11–20, and 6th gives 21–30 on a circuit with a straight long enough to reach it. So choosing a gear is choosing a range rather than a number. Going up is free but takes a turn a gear, and out of neutral the only gear on offer is 1st. Coming down one gear is free too — dropping two or more in a turn costs gearbox, steeply.",
        },
        {
            heading: "Corners and spins",
            body: "Each corner owes a number of stops: turns you have to end inside it before you are allowed to leave. Sail past with stops still owed and you have overshot, at 1 tyre for every space beyond the corner. If you cannot pay that bill in full you spin instead — the car is dumped on the corner's last row in neutral and misses its next turn entirely, so knowing how much overshoot your tyres can cover is the most useful number on your screen. If the road genuinely gave you no way to stay in, the stops are waived and leaving costs nothing.",
        },
        {
            heading: "Wear and slipstream",
            body: "Tyres, brakes and gearbox are three small pools, on a spec the host picks for the whole field, and nothing ever refills them — they are a budget for the entire race, which is why a Grand Prix is not simply twice a Sprint. Brakes are the one pool you spend on purpose: each point shaves a space off a roll you have already seen. Tyres mostly go on corners, plus one every time traffic stops you short of your number — the one wear cost you cannot see coming. Slipstream is the way back at the car in front — end your move directly behind one with both of you in 4th or higher and your gear no lower than theirs, and you get a free three-space tow, chaining again if it drops you behind a third car. Towing into a corner you were not already in costs a brake point. With oil spills switched on, spending three or more brakes in a turn leaves a slick where you stop, and anyone who drives into one rolls a d6 to stay on the road.",
        },
    ],
};
