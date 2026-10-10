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
                title: "Home page and games load faster",
                detail: "Going back to a game or to the home page now shows it straight away, from what you saw a moment ago, and brings it up to date underneath. A game also starts loading the moment you touch its card, before you let go. The server is quicker too, above all when you check back often: players' names and pictures are no longer looked up afresh every time, and the home page reads only what it shows rather than every game you've ever finished. A new name or picture can take up to five minutes to reach other players.",
            },
            {
                title: "Quicker to open",
                detail: "Opening the app, or a game from a notification, no longer waits on an extra sign-in check before the page starts to arrive. The home page and a game's screen now come ready-made instead of being built for you each time you open them, so they show up straight away.",
            },
            {
                title: "Realm Arena rebalanced: tougher Hold Out defenders, melee can miss, cover matters more at range, a longer-reaching Mage",
                detail: "In Hold Out your characters now have 50% more HP, and against the Renegades every hit on them does 1 less. The enemy warbands muster one step smaller, and a two-player Hold Out lasts 13 rounds instead of 15. In every battle a blow in melee hits 80% of the time rather than always, a target's cover counts double against a shot from further than 10 squares (so those in cover are much safer at a distance, and those in the open no safer), the Mage's Bolt becomes the Mage Bolt (80% to hit, 12 squares), a Cleric can Heal every turn (once a turn, no waiting), and Raise can be used again four turns after the last one instead of once a battle. Battles already under way keep the rules they started with.",
                game: "realmarena",
            },
            {
                title: "Open a game from home in a new tab",
                detail: "Your turn cards and finished games on the home page are proper links now: press and hold, or middle-click, to open one in a new tab. And a game's screen starts loading as soon as its card is on screen, before you tap it.",
            },
            {
                title: "World Domination and Fires Out: a few seconds to take a move back",
                detail: "World Domination: put armies in the wrong territory, cashed in cards you meant to hold, or moved too many into a conquest? Tap Undo and put it right — battles are dice, so those stay. And when you fortify or skip fortifying, your turn now waits ten seconds before it passes, so you can still change your mind. Fires Out's End turn now does the same: tap it straight after a move you regret and it waits ten seconds, with Undo and Pass now beside the countdown, before the fire advances.",
                game: "worlddomination",
            },
            {
                title: "Realm Arena: watch the battle play back",
                detail: "Open Review actions and press Play to watch the match play itself forward, every action animated over the board in turn — characters walking along the path they took — with the view following each one, a move framed from where it began to where it ended — and in a co-op battle, each of the enemy's moves played out one at a time rather than all at once. The \"since you were last here\" screen has a button to replay everything from your last turn. The board now opens on your own squad, and comes back to it rather than zooming out across the whole map when there's nothing in particular to look at. Hunkering down, shield walls, overwatch and guard now say so over the character, and a step that happened out of sight shows a faint question mark over the map.",
                game: "realmarena",
            },
            {
                title: "Board zooming keeps up with your fingers, and Realm Arena zooms in closer",
                detail: "Pinching to zoom a big board — Realm Arena's battlefield above all, but World Domination, Outbreak, Race Cars and the rest too — used to redraw the whole map on every frame, so it lagged well behind your fingers while scrolling around stayed smooth. The map now just stretches while you pinch, looking a touch soft until you let go, when it sharpens at its new zoom. In Realm Arena, picking a target from the list now zooms in close on your character and the target rather than out across the map, and selecting a character frames the nearer half of where it could move instead of most of it.",
            },
            {
                title: "Realm Arena: Hold Out on the Sacked Fort",
                detail: "Hold Out has a battlefield of its own. Your team starts in a ruined keep in the middle of the map, and the enemy closes in from every edge, where each fresh wave lands too. Its walls are full of gaps, so there's no corner to sit in. The host picks it, or the gate forts, when setting up.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: Hold Out and achievements",
                detail: "Choose a new co-op mission and survive repeated enemy waves: fallen warband fighters return every third round, and your team wins by keeping anyone standing to the end. Realm Arena now has five achievements too, for veterans and co-op teams that win together, bring everybody home or survive Hold Out.",
                game: "realmarena",
            },
            {
                title: "Realm Arena: points for an assist",
                detail: "In a free-for-all, wounding a character is worth it even when somebody else finishes it off: whoever downs it still scores the knock-out, and every other player who hurt it since it last stood up scores half that, rounded up.",
                game: "realmarena",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
        ],
    },
];
