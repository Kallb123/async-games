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
                title: "Profile tabs",
                detail: "Your profile is split into Results, Achievements and Friends tabs, so each is a tap away instead of a long scroll. Friends only appear on your own profile.",
            },
            {
                title: "Achievements",
                detail: "Unlock achievements as you play — First win, Explorer, Mine Baron in Dice Cities, Double Honours in Settlements & Cities, and Race Cars' nods to real racing moments like Donington '93 and Rascassegate. A toast tells you the moment you earn one, a finished game's results list every achievement anyone at the table unlocked, and your profile (and your friends') shows the lot, with how close you are to the rest.",
            },
            {
                title: "Game results show each player's stats in their colour",
                detail: "Every player's stats on a finished game's result carry a bar in their colour down the side, so you can match them to their line on the charts at a glance.",
            },
            {
                title: "See the final board on a Settlements & Cities result",
                detail: "A finished game's result page now shows the board as the game ended — every settlement, city and road in its owner's colour. Hover or press a bar in the dice roll chart to see how many of those rolls each player threw.",
                game: "settlementsandcities",
            },
            {
                title: "Dice Cities: play on the Outer Rim",
                detail: "Pick the new Outer Rim theme when you set up a game and your city becomes a frontier outpost on a galactic trade lane: Moisture Farms and Spice Mines, cantinas that charge the pilot, credits from the Exchange, and a Docking Bay and Sensor Array to finish. Same rules and numbers as ever — only the names and the card art change.",
                game: "dicecities",
            },
            {
                title: "Kingdom Builder's world map has new badges",
                detail: "Towns, barbarian camps, open sites, forests, quarries and mines each wear a round painted badge. Every town's ring is its owner's colour, your own towns show their town centre level, and each barbarian camp shows how tough it is, from I to III.",
                game: "kingdombuilder",
            },
            {
                title: "Pull down to refresh your games",
                detail: "Drag the home screen down from the top and let go to check for new turns, invites and messages straight away, rather than waiting for it to catch up on its own.",
            },
            {
                title: "Settlements & Cities: the points race, who rolled what, and who gathered what",
                detail: "A finished game's results now chart every player's victory points round by round — hidden Victory Point cards revealed, and the dips when Longest Road or Largest Army changed hands — split every bar of the dice chart by who rolled it, and add a table of the resources each player gathered, the most of each in bold.",
                game: "settlementsandcities",
            },
            {
                title: "Settlements & Cities: trade with other players",
                detail: "Post an offer — \"1 🪵 for 1 🐑, anyone?\" — and any other player can take it up on any turn, so a trade never waits for the dice to come round. The new Trade offers panel lists every open offer and tells you straight away whether you have what it asks for.",
                game: "settlementsandcities",
            },
            {
                title: "Kingdom Builder worlds have chat",
                detail: "Talk strategy with everyone in your world from the world map, with the same messages, GIFs and notifications as your other games.",
                game: "kingdombuilder",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Settlements & Cities results cover the whole game",
                detail: "A game that was already under way when turns began pausing for Undo could finish with its victory points and resources charts stopping two rounds in, and no resources table at all. Those games now chart every round, and a player who dropped out keeps the lines and the column they left with instead of falling to nothing. The results page of a game you played in also has a Regenerate results link at the bottom, to work them out again from the game's moves while they're still kept.",
                game: "settlementsandcities",
            },
            {
                title: "Kingdom Builder armies fight the scouts they meet",
                detail: "A rival army could share a tile with your scouts and their settlers or caravans and do nothing at all, since scouts counted as a full escort. Scouts are now cheap rather than untouchable: an army with soldiers in it fights any scouts on its tile, alone or escorting, and once the last scout falls it takes the settlers and caravans they guarded. Both sides get the fight in their Battles list.",
                game: "kingdombuilder",
            },
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
        ],
    },
];
