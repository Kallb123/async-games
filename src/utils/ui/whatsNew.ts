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
                title: "One quiet player no longer ends the game for everyone",
                detail: "Miss three turns in a row and, in most games, you now leave the game rather than ending it: everyone else plays on without you. In a race your counter or car drops out, in Dice Cities and Settlements & Cities your city stops collecting, Train Time keeps your track on the map but not in the scores, World Domination leaves your armies standing to be conquered, and the co-op teams share out or discard what you held and carry on — even down to one player. Two-player games, Smartthink and Solitaire still end as before.",
            },
            {
                title: "Pinch to zoom feels like a map app now",
                detail: "Zooming a board — the pill or a pinch — now zooms inside its frame instead of stretching the page, so everything around the board stays put. A pinch follows your fingers: whatever was under them stays under them as you spread and slide, on every board with a zoom pill.",
            },
            {
                title: "Your Kingdom Builder worlds are always within reach",
                detail: "Return to every world from your home dashboard or the game switcher, with its current tick and your settlement count shown at a glance.",
                game: "kingdombuilder",
            },
            {
                title: "Guided tutorials for Dice Cities and Settlements & Cities",
                detail: "First game in either one now opens with a two-minute guided tour of your own board instead of a wall of rules: a spotlight finds the thing being talked about, waits for you to roll or build where a step asks for it, and never blocks the board underneath. Skip ahead any time, or take it again later from the ⋮ menu, where the how-to-play guide still lives too.",
            },
            {
                title: "Race Cars: take a move or a tow back",
                detail: "Picked the wrong space, or took a slipstream tow you didn't mean to? Tap Undo and put the car back where it was — everything except the roll itself, which stays exactly as thrown. And if that move ended your turn, it now waits ten seconds before it passes, so you get the chance.",
                game: "racecars",
            },
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
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Turn recaps leave out moves that were taken back",
                detail: "Undoing a move now removes both the move and the Undo from the recap and your next-turn notification. Plain passes stay quiet too, while a turn that pays out a card still tells you about the card.",
            },
            {
                title: "Banned Islet's water meter climbs at the right pace",
                detail: "The flood rate on the water meter ran too steep, so the island went under faster than it should: from level 4 up it flooded one tile too many every turn, and the last two levels flooded six. The meter now reads 2, 2, 3, 3, 3, 4, 4, 5, 5 and then the skull, so Legendary opens on three tiles a turn rather than four. Games already under way switch to the new rates on their next flood.",
                game: "bannedislet",
            },
            {
                title: "Every join link shows a picture when you share it",
                detail: "Sharing a join link for a game that didn't have its own preview image yet — Kingdom Builder, for one — unfurled in the chat with a broken picture or none at all. A game without its own card now shows the general Async Games one instead.",
            },
            {
                title: "Kingdom Builder's world map no longer hides its own ground art",
                detail: "A settlement site drew as a solid terracotta circle a tile and a half wide, and every tappable site on top of that in a thick gold ring sized for a much bigger board — between the two, a site-dense map was more circle than art. Both are gone in favour of a small dot and the \"Open site\"/\"Your town\" label already sitting next to it, whose own text used to render as an illegible dark blob. A big field of grass now draws from several tiles instead of repeating one, so the map reads as a picture again.",
                game: "kingdombuilder",
            },
            {
                title: "Signing in with Google no longer leaves the form tappable underneath",
                detail: "In the app, tapping Continue with Google could sit for a moment while your account was checked and our side of the handshake finished — and until now the sign-in card underneath stayed fully clickable the whole time, so a stray tap could fight the sign-in already under way. It's now covered by a pulsing loading bar and locked until the check is done.",
            },
            {
                title: "Google and Microsoft sign-in work in the Android app",
                detail: "Signing in to the app with Google or Microsoft dumped you into your phone's browser and left you there on an error instead of signing you in. Google now uses the phone's own account picker — tap the account you're already signed in to and you're in, no password and no browser — and Microsoft stays in the app where it belongs. Email and password were never affected. You'll need the latest version of the app from the Play Store.",
            },
            {
                title: "The party size line no longer spills past the edge of the setup screen",
                detail: "On a game's setup screen, the \"Party size N · supports X–Y players\" line sat flush against the left and right edges of the phone instead of lining up with the seats and turn-timer rows above it. It now sits inside the same margin as the rest of the page.",
            },
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
        ],
    },
];
