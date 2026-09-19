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
                title: "Race Cars",
                detail: "Pick a gear, roll its die, and find out whether the corner will take it. The roll lands before you choose where to put the car, so a turn is a bet on a range rather than on a number — and tyres, brakes and gearbox never refill, so the three of them are one budget for the whole race. Three circuits, a Sprint or a two-lap Grand Prix, two to six drivers, optional oil spills, and a slipstream that only ever helps the car behind.",
                game: "racecars",
            },
            {
                title: "Banned Islet",
                detail: "Team up on a sinking island and lift four relics off it before the sea takes the floor out from under you. Three actions a turn against an island that floods two to six tiles between turns — a flooded tile is a tile with one life left, and a sunk one leaves a hole your route home used to run through. Four difficulties, and an end-of-turn screen that shows you exactly what went under. Six roles, one broken rule each, and an escape you have to hold the card for: with every relic aboard and the whole team on the pier, it still takes a Helicopter Lift to actually leave.",
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
                title: "Take it back",
                detail: "Placed a settlement or a road you didn't mean to in Settlements & Cities? Tap Undo and put it where you meant. And if that was the last thing you could do, your turn now waits ten seconds before it passes, so you get the chance.",
                game: "settlementsandcities",
            },
            {
                title: "Race Cars now starts with a roll off the line",
                detail: "Round one is the start, and it is one d20 a driver instead of a gear. Roll a 1 and the engine bogs down: no gear, no movement, and you are still in neutral when the race comes back round to you. Roll 2 to 16 and you get away cleanly in first, rolling its die for the move as usual. Roll 17 or more and it is a flying start — four spaces with no roll at all. Everybody who gets away is in first and can change gear from round two, and that is when normal racing begins. Out of neutral there is now one gear to take rather than two, so a car that bogged down — or spun — climbs the ladder from first like everybody else.",
                game: "racecars",
            },
            {
                title: "Race Cars: get right in on the track",
                detail: "The circuit is a big board with small spaces, so the zoom pill has grown a second step — and you can now pinch to zoom anywhere in between. Both work on every board with a zoom pill, Outbreak and World Domination and the rest, and Race Cars goes deepest of the lot. Pan with a finger as usual; whatever you were looking at stays under your thumb rather than snapping back to the corner. The spaces themselves have gone see-through, so the painted track shows through the grid instead of hiding under it, and the ones you can actually move to sit inside a pulsing outline while you pick.",
                game: "racecars",
            },
            {
                title: "Banned Islet shows which treasure is running out of island",
                detail: "The \"Tiles left\" box on the board is now the four treasures, two by two — each showing how many of its two tiles are still above water, and turning red the moment one is down to its last. That is the count that actually ends the game: let both tiles of a treasure you haven't captured go under and the team loses, however much dry land is left over. A treasure already aboard ticks off instead. Your match review still charts the island shrinking, tile by tile, turn by turn.",
                game: "bannedislet",
            },
            {
                title: "Every game shows when it's waiting",
                detail: "The \"Sending\" badge in a game's top bar is now a pulsing bar along the bottom edge of it — and it lights up for everything the game is waiting on, not just the move you have made: your move going out, an opponent's move coming back, and the match review being built. It sits inside the bar, so nothing on screen shifts when it comes and goes.",
            },
            {
                title: "Settlements & Cities boards are balanced now",
                detail: "The numbers are dealt the way Catan's own rules ask: no two red tokens — the 6s and 8s, the likeliest rolls on the board — on hexes that touch, so nobody's first settlement lands on a corner that runs away with the game. The terrain is still shuffled, so the island is different every time. Want the old free-for-all? Switch Totally random tiles on when you set up a game and the numbers are dealt with no rules at all, unbalanced map and all.",
                game: "settlementsandcities",
            },
            {
                title: "Add or change your password from Settings",
                detail: "Signed in with Google or Microsoft? You can now add a password too, so you're never locked out if that account changes. Already have one? Change it from the same place — under Settings › Password.",
            },
            {
                title: "Settlements & Cities ends your turn for you when there's nothing left to do",
                detail: "Once you can't afford a settlement, road or city, can't buy or play a development card, and don't have enough of any resource to trade with the bank, your turn ends on its own instead of waiting for you to tap End turn. The End turn (and Special Build's Done building) button also moved to the top of the list, above the build options, so it's the first thing you see.",
                game: "settlementsandcities",
            },
            {
                title: "Settlements & Cities' player tabs expand for more detail",
                detail: "Tap the row of player tabs at the top of the board and every seat opens at once: how many cards they're holding, how many knights they've played (tagged Largest Army if they hold it), and their longest stretch of road (tagged Longest Road if it's the longest on the board). Tap again to close them.",
                game: "settlementsandcities",
            },
            {
                title: "Settlements & Cities' result page charts how the dice actually fell",
                detail: "A new bar chart at the bottom of the result page counts every roll of the game by its total, 2 through 12 — so you can see at a glance whether this game's dice ran hot on 7s or cold on the middle numbers, alongside the existing resources-per-round chart above it.",
                game: "settlementsandcities",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "A missed Settlements & Cities turn no longer breaks the board",
                detail: "If nobody was around when your turn timer ran out, the game used to just skip straight to whoever was next without actually playing your turn for you — during setup that could scramble the placement order or leave the next player building a road onto your settlement, and on a main turn it skipped the whole table's roll, not just yours. A missed turn now plays itself out: a settlement and road go down somewhere legal during setup, the dice get rolled and the robber gets moved on a main turn, and anything left over is passed rather than lost.",
                game: "settlementsandcities",
            },
            {
                title: "The match history tells the setup story the right way round",
                detail: "The setup lines at the start of a game were logged in reverse, so the match history read them backwards. In a game whose opening roll-off had to break a tie, the two re-rolls showed up above the line announcing the tie — which read as the game making two players roll again over numbers that plainly didn't match. Setup now reads in the order it happened, from the roll-off down to the options the host turned on, and a throw made to break a tie says it was a re-roll. Games already under way keep the log they were started with.",
            },
            {
                title: "Race Cars: cars no longer start the Anglet track boxed in",
                detail: "Four of the six cars on Anglet Chambre D'Amour were parked on a piece of road the track doesn't actually have, so those drivers were told \"boxed in — nothing is reachable\" on the first turn and every turn after it, whatever gear they picked. The grid now sits on the six spaces the art paints a car on.",
                game: "racecars",
            },
            {
                title: "A connection blip no longer throws you out of your game",
                detail: "If the app lost the network for a moment while you had a board open — a phone changing between wifi and cell, or a tab left sitting long enough that your sign-in needed renewing — you were dumped back on your home screen, which then came up empty and needed a reload of its own. A game now waits out a blip and quietly asks again, keeping the board in front of you while it does; a sign-in that has gone stale is renewed behind the scenes; and every list on the home screen waits it out the same way rather than showing you nothing. A move you have just made can no longer be undone on screen either, by a background refresh that was already on its way when you tapped.",
            },
            {
                title: "A lobby that closed stops saying a game is starting",
                detail: "If the host cancelled your lobby while you were sitting on it, or it ran out of time, you were told \"Game is starting! Look for it on your home screen.\" — and then found nothing there, because nothing had started. It now says the lobby isn't open any more. Opening an old lobby link after the game has already begun takes you to the board instead of turning you away.",
            },
            {
                title: "A Settlements & Cities turn that ends itself gives nothing away",
                detail: "When your turn ended on its own because there was nothing left to build, buy or trade, the match log told everyone exactly that — so the table could work out you couldn't afford a road and were short of every resource. An automatic ending now reads as \"ended their turn\", the same as tapping the button — in the log, in the notification others get, and in the match review. You still see your own roll held on screen with the note explaining it.",
                game: "settlementsandcities",
            },
            {
                title: "The dice roll chart's tallest bars are the right height again",
                detail: "On a Settlements & Cities result page, every bar near the top of the roll frequency chart was drawn at the same height — a 7 rolled sixteen times looked no more common than a 5 rolled thirteen times, so the shape the chart exists to show was flattened out. The bars are back in proportion, with the count still sitting on top of each one.",
                game: "settlementsandcities",
            },
            {
                title: "Settlements & Cities shows the roll that ended your turn",
                detail: "When a roll left you nothing to build, buy or trade, your turn ended itself before you ever saw what you rolled — the dice vanished in the same instant the turn moved on. Your roll and its payout now stay on screen for you, with a note that there was nothing left to do, until your next roll — without making it look to whoever plays next like they'd already rolled.",
                game: "settlementsandcities",
            },
            {
                title: "Train Time's match review speaks plain English",
                detail: "Stepping back through a Train Time match used to label every action with internal gibberish — \"Train Time ClaimRoute route=3 cards=blue,blue,blue,blue\" — instead of what happened. Each step now reads the way the turn history does: \"drew from the deck\", \"took the face-up red\", \"claimed Seattle – Vancouver (1 track, +1)\", \"kept 2 of 3 destination tickets\".",
                game: "traintime",
            },
            {
                title: "Settlements & Cities' match review speaks plain English",
                detail: "Stepping back through a match used to label every action with internal gibberish — \"SAC BuildSettlement vertex=17\" — instead of what happened. Each step now reads the way the turn history does: \"built a settlement\", \"moved the robber and stole a resource from Bob\", and a roll names who collected what — \"rolled a 9 — Alice +2🪵 +1🌾, Bob +1⛏️\".",
                game: "settlementsandcities",
            },
        ],
    },
];
