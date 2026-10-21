// Release notes for the "What's new" section at the bottom of the home page.
//
// KEEP THIS UP TO DATE: when a change lands that a player would notice — a new
// game, an enhancement, a fix — add a line to the right group in the same PR,
// newest first, and drop the oldest line once a group runs past ten. This is
// a "what changed since you last played" note, not a full changelog: write it
// in the player's language and leave the internals out.
//
// A group is shown in two tiers: the newest `WHATS_NEW_FEATURED` in full, with
// the game's art and the detail line, and the rest as compact title-only rows.
// So the `detail` on an older line still has to earn its place while the line
// is near the top, and the `title` has to stand on its own once it isn't.

export interface WhatsNewItem {
    /** What changed, as a player would describe it. */
    title: string;
    /** One line on what it means for them. */
    detail: string;
    /** A `GAME_META` slug; the row then leads with that game's art. */
    game?: string;
}

export interface WhatsNewGroup {
    label: string;
    /** Leads every row in the group that isn't a game. */
    icon: string;
    items: WhatsNewItem[];
}

/** How many of a group's newest items get the full row. The rest are compact. */
export const WHATS_NEW_FEATURED = 3;

export const WHATS_NEW: WhatsNewGroup[] = [
    {
        label: "New games",
        icon: "🎲",
        items: [
            {
                title: "Realm Arena",
                detail: "Muster a squad of Knights, Archers, Mages, Clerics and more in secret, buy them items, then fight for the centre of a ruined fort one action at a time — climbing towers for the high ground, putting your fighters on watch to shoot whoever moves into sight, and setting each other alight. Two players duel; three or four fight a free-for-all on a fort of their own, with fog of war if the host wants it. Your characters earn mastery as they fight and unlock new ways to play.",
                game: "realmarena",
            },
            {
                title: "Kingdom Builder prototype",
                detail: "Explore your generated world map, found more settlements at open sites, and move between your towns as wood, stone and iron arrive each hour.",
                game: "kingdombuilder",
            },
            {
                title: "Race Cars",
                detail: "Pick a gear, roll its die, and find out whether the corner will take it. The roll lands before you choose where to put the car, so a turn is a bet on a range rather than on a number — and tyres, brakes and gearbox never refill, so the three of them are one budget for the whole race. Three circuits, a Sprint or a two-lap Grand Prix, two to six drivers, optional oil spills, and a slipstream that only ever helps the car behind.",
                game: "racecars",
            },
            {
                title: "Banned Islet",
                detail: "Team up on a sinking island and lift four relics off it before the sea takes the floor out from under you. Three actions a turn against an island that floods two to five tiles between turns — a flooded tile is a tile with one life left, and a sunk one leaves a hole your route home used to run through. Four difficulties, and an end-of-turn screen that shows you exactly what went under. Six roles, one broken rule each, and an escape you have to hold the card for: with every relic aboard and the whole team on the pier, it still takes a Helicopter Lift to actually leave.",
                game: "bannedislet",
            },
            {
                title: "Dice Cities: the Docks expansion",
                detail: "Switch the Docks on when you set up a game and the coast opens up: a Harbour landmark that lets you add 2 to any roll of 10 or more, and six new cards including a Flower Shop that pays per Flower Orchard you own and three sea cards that stay shut until you've built the Harbour. The Harbour is a bonus, not a fifth thing to build — the original four still decide who wins.",
                game: "dicecities",
            },
            {
                title: "Fires Out!",
                detail: "Team up as a crew of firefighters to pull every victim out before the building comes down — chop through walls, carry victims to safety, and watch the fire spread once per firefighter's turn. Play the printed Family setup or the randomised Experienced game with hazmats, hot spots and eight Specialists.",
                game: "firesout",
            },
            {
                title: "Outbreak",
                detail: "Team up to cure four spreading diseases before the board overwhelms you — open hands, seven roles, and a recap that shows exactly how much worse things got while you were away.",
                game: "outbreak",
            },
            {
                title: "Train Time",
                detail: "Collect carriage cards, claim the routes your rivals wanted, and cash in Destination Tickets — with the Long Haul bonus and final scoring.",
                game: "traintime",
            },
        ],
    },
    {
        label: "Enhancements",
        icon: "✨",
        items: [
            {
                title: "Realm Arena: Hold Out for a team of four",
                detail: "Four of you can now fight Hold Out together, on the Sacked Fort or the Sunken Village: a quarter of the middle each, four warbands closing in from the edges, and the same four waves over 13 rounds. Hold the Centre and the gate forts still seat up to three.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: line of sight depends on the angle",
                detail: "Height now decides what you can see over. From higher ground you see over a wall to anyone standing back from it, but not to someone pressed close behind it, and the edge of a rise or a tower's parapet hides the ground just below. The Sunken Village's hedges now stand a full height, so they can be burned away but not climbed through. Battles already under way keep their original rules.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: a new Hold Out battlefield, the Sunken Village",
                detail: "For a team of three: hold a village green sunk below hedges, lanes and roofless cottages that hide the enemy until it's close, so archers can't pick you off from across the map. Nobody sees through a hedge, but anyone can push through one, and a fireball burns it away.",
                game: "realmarena",
            },
            {
                title: "Quicker when you come back to the app",
                detail: "Switching back to the app, or opening it from a notification, now renews your sign-in before your games refresh, so they no longer stall for a few seconds first — and a move you make the moment you're back goes through. Players' names show straight away too, even when you've been away a while.",
            },
            {
                title: "Realm Arena: clearer battle details",
                detail: "Inspect unit stats during battle, read passives and status effects below their actions, and track defeated enemies and both sides’ health in Hold Out.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: new abilities for the Realm",
                detail: "Leap and dash with Men-at-arms, brace your side and shove enemies with Knights, try four new Archer arrows, freeze and stun with Mages, and pull, bless and ward allies with Clerics. The Scout retires from new squads. Battles already under way keep their original rules.",
                game: "realmarena",
            },
            {
                title: "Realm Arena's scoreboard shows your allies' full squad and HP",
                detail: "Allies share vision, so their squads no longer say ‘in sight’ in fog of war. In co-op, tap the scoreboard to see how much HP each allied squad has left out of its full total, including your own.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: take turns in blocks against the computer",
                detail: "A co-op battle can now have all of you take your turns one after another and then every warband take theirs, instead of a warband after each of you. It's a switch on the setup screen, off by default, so battles already under way play as before.",
                game: "realmarena",
            },
            {
                title: "Realm Arena is now in 3D",
                detail: "The battlefield is now drawn as a real 3D board: walls and towers stand up off the ground, trees have trunks, and every character is a model that turns to face where it's going. Turn the view a quarter at a time, pinch to zoom, and everything else works as before. If your browser can't draw 3D, you get the old flat board.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: choose your faction — the Realm, the Swarm or the Miners",
                detail: "Each player now picks a faction as they muster, from those the host allows, and co-op can pit you against any of them. The Swarm fields more, cheaper and weaker beasts whose acid corrodes; the new Miners are dwarves out of the deep mines, each one tougher than the Realm's and a little dearer for it, so you field fewer of them. Miners hack through cover with their pickaxes, Stonewardens hold the line behind slabs of stone, Prospectors shoot steady crossbows, Runepriests heal and raise the fallen, and Sappers throw dynamite that blasts a 3×3 and the low cover in it. Miners of your own are tough enough that they don't wear Hold Out's armour against the Renegades.",
                game: "realmarena",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Completed tutorials stay dismissed",
                detail: "Realm Arena and the other games now remember when you finish or skip their tutorial even if saving your progress fails. You can still take the tour again from the game menu.",
                game: "realmarena",
            },
            {
                title: "Realm Arena's Hold Out warbands come for you",
                detail: "The computer's warbands in Hold Out could hang back two squares from your characters and never step in, or — in fog of war — march to the keep and wait there all battle while you held an edge it couldn't see, each wave piling in beside the last. They now close in and attack, trading their own fighters freely since every wave replaces them, and when they've lost track of you they go looking where your squads deployed instead of standing about.",
                game: "realmarena",
            },
            {
                title: "Results bar charts keep every bar on the same baseline",
                detail: "On a game's results page, a bar whose name was too long for one line — Realm Arena's Man-at-arms, say — wrapped its label and stood its bar up above the others, so it looked taller or shorter than it was. Every bar now starts from the same line, with the names sitting underneath.",
            },
            {
                title: "Realm Arena's setup screen shows how big each difficulty's warbands are",
                detail: "The co-op Difficulty choices said a Normal warband musters as many points as each of you, but in Hold Out the warbands now muster a step smaller than that. Each difficulty now names the points its warbands and your squads muster, for the mission and battle size you've picked.",
                game: "realmarena",
            },
            {
                title: "Coming back home starts you at the top of the page",
                detail: "Leaving a game for the home page could land you partway down your games — or right at the bottom, on the notifications warning — instead of at the top. Home now always opens at the top.",
            },
            {
                title: "Realm Arena's battle plays back steadily, one action at a time",
                detail: "On phones, and in the Android app most of all, the battlefield could flicker black and judder while Hold Out's next spawn zones glowed, while an attack's damage flashed on an HP bar, or while a turn played back. Those effects no longer make the phone redraw the map over and over, so the board stays steady and still looks the same. Watching a turn play back, each action now waits for the map to finish zooming to it before it plays, and the map rests for half a second after it before moving on to the next.",
                game: "realmarena",
            },
            {
                title: "Realm Arena's map pinches smoothly again",
                detail: "With an attack or a heal lined up, or Hold Out's next wave about to land, pinching to zoom the battlefield stuttered badly: the flashing HP bars and glowing spawn zones made the phone redraw the whole map on every frame of the pinch. They now hold still while the map zooms and start flashing again the moment it settles.",
                game: "realmarena",
            },
            {
                title: "Realm Arena's fog of war covers the log, the recap and the review",
                detail: "In a battle fought in fog of war the board hid what your squad couldn't see, but the match history, the recap and the match review still told you every move, shot and knock-out out there. Now they only tell you what your squad saw: an enemy hunkering down out of sight leaves no line at all, and a shot at you from the fog says you were hit, not who fired it. When the battle ends the fog lifts and the whole log is there for everyone.",
                game: "realmarena",
            },
            {
                title: "Taking back several moves in a row clears them all from the recap",
                detail: "Undoing one move already left it out of the recap and your next-turn notification, but undoing two or three in a row only hid the last one — the earlier moves you took back still showed up as if you'd played them. Every move you undo now disappears, however many you take back.",
            },
            {
                title: "Boards zoom onto the action from where you were looking",
                detail: "When a board brings something into view by itself — your car and the spaces a roll lets it reach in Race Cars, or the fighter you select in Realm Arena — it used to snap to the new zoom first, often out at the corner of the map, and then slide across to the spot. It now zooms and pans in one smooth move, starting from exactly the part of the board you were already looking at.",
            },
        ],
    },
];
