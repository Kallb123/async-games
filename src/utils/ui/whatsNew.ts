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
            {
                title: "Banned Islet's water level and hands get easier to read",
                detail: "Tap the water level stat to see what each level means — the same trick Outbreak's infection rate uses — and check how many flood cards land at each one, right down to the skull. Every hand's cards now sit grouped by type instead of draw order, so it's easier to see what everyone's holding at a glance.",
                game: "bannedislet",
            },
            {
                title: "The home screen fills a big screen",
                detail: "On a laptop or a desktop, the dashboard stops being a phone-width strip: a rail down the left puts every game you have on the go one click away wherever you have scrolled to, the games waiting on you sit side by side across the middle, and invites you have sent, finished games and the two big buttons move into a panel of their own on the right. On a phone it is exactly the screen it was.",
            },
            {
                title: "See what a Settlements & Cities roll paid out",
                detail: "The dice that used to sit in the corner of the board are now a panel under it, and it says who collected what: \"Rolled 8 — You +2🪵 +1🌾, Bob +1⛏️\". A 7 names the cards it cost each player instead. The same breakdown is in the turn history and in the recap you get when it's your move again, so a roll you weren't there for still tells you who got rich.",
                game: "settlementsandcities",
            },
            {
                title: "Open chat and turn history from the bottom of the page too",
                detail: "Both panels used to only open from the 💬 and 📜 buttons up in the top bar — on a tall board that meant scrolling all the way back up just to open or close one. Their titles at the bottom of the page are now buttons of their own: tap either to open it, and tap it again to close, right where you already are.",
            },
            {
                title: "Send a meme in a game's chat",
                detail: "There's now an IMG button beside the GIF one: tap it to search KLIPY's meme collection and send a result the same way — tap to send, with whatever you've typed going underneath as a caption.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
            {
                title: "The panel you wait on stops looking tappable",
                detail: "Settlements & Cities keeps its build list on screen while you wait for your turn, but the rows and the Trade with the bank button looked exactly like the live buttons under them — the same white cards, the same terracotta \"Build\" — so tapping one did nothing and never said why. Everything in a waiting panel now reads as off: flat, dashed and soft-greyed, with the costs still there to plan with. Every game's waiting panel got the same treatment.",
                game: "settlementsandcities",
            },
            {
                title: "Settlements & Cities shows what's happening on an opponent's turn",
                detail: "The build/roll/trade panel used to disappear entirely while you waited for someone else's turn — including during setup, where it vanished right when you most wanted to see what was going on. It now stays on screen at all times, just greyed out and untappable until it's your move.",
                game: "settlementsandcities",
            },
            {
                title: "Match review controls stay on screen while you rewind",
                detail: "Stepping back through a match, the transport buttons sat at the very bottom of the page — so on a tall board the part of the game you were rewinding was off the top of the screen, and you couldn't see anything change as you moved. The scrubber is now pinned to the bottom of the screen while you review, with the board scrolling clear above it.",
            },
            {
                title: "Dice Cities' match review speaks plain English",
                detail: "Stepping back through a Dice Cities game's actions used to show raw internal labels like \"CardPurchase! Card? <id>\" instead of what actually happened. Every action in the rewind scrubber now reads the way the turn history does — \"rolled a 7 (3 and 4)\", \"bought a Wheat Field\", \"used the TV Station on Priya\" — and a roll names who it paid, same as the recap: \"rolled a 4 — Bob +1🪙, Alice -1🪙\".",
                game: "dicecities",
            },
            {
                title: "Result charts plot by round, and don't double-count doubles",
                detail: "Dice Cities' Amusement Park lets you go again on doubles without your turn actually ending, but its result-page charts were plotting that bonus roll as an extra turn — running ahead of the \"N turns\" line on the same page. Every per-turn chart across every game now agrees with the turn count, and since a multiplayer chart was still one point per player per turn, it now groups by round instead: one point per lap of the table, so a game with several players reads at a glance.",
            },
        ],
    },
];
