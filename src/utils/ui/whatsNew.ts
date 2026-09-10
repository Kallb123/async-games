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
                title: "Send a meme in a game's chat",
                detail: "There's now an IMG button beside the GIF one: tap it to search KLIPY's meme collection and send a result the same way — tap to send, with whatever you've typed going underneath as a caption.",
            },
            {
                title: "Send a GIF in a game's chat",
                detail: "There's a GIF button beside the message box now: tap it, search for what you're after, and tap a result to send it. Type a line first and it goes underneath as a caption. GIFs play in the thread, or sit still with a play button if you've asked your phone for less motion, and if they can't be reached you can still send a message as normal.",
            },
            {
                title: "Chat says who's talking with their avatar",
                detail: "Every message in a game's chat now leads with the sender's avatar, ringed in the colour they're playing as, instead of the small colour dot that used to sit beside it — so a glance down the thread tells you who said what.",
            },
            {
                title: "Result charts mark the moments that mattered",
                detail: "The charts on the result page now drop a small icon right on the turn something big happened: a biohazard mark where Outbreak drew an epidemic card, a building where a Dice Cities player bought a landmark, and an explosion or an ambulance wherever Fires Out's fire blew or a victim made it out — so you can see exactly how it lines up with the swings in the line around it.",
            },
            {
                title: "Play Fires Out! on your own",
                detail: "Fires Out! now has a solo mode. Pick Solo when you set a game up, choose how big a crew you want, and every firefighter on the board is yours to run — each one takes their own turn with their own action points, and the fire still advances after each of them, so a bigger crew is more to spend and more to keep alive. There's nobody to invite and nothing to wait for, though you can still set a turn timer if you want the pressure: it runs per firefighter's turn, and going quiet for long enough ends the game the same way walking away from any other does. Playing the Experienced game solo, a Fire Captain can now spend their command points directing any other firefighter in your crew. Carrying a victim is easier to find in every game too: once you're standing on one, the \"Carry the victim here\" switch sits right under the Move action instead of hiding until you'd already tapped Move.",
                game: "firesout",
            },
            {
                title: "Reactions now show up in the turn history log",
                detail: "A reaction used to only ever reach the one player it was sent to, as a push notification. It now sits right on that move in the turn history log too, so anyone flipping back through what happened can see what landed and on which line — and a move used to take one reaction total, whichever opponent got there first, but now every player has their own to give, so a big roll can pick up an 😱 from one opponent and a Nice! from another, all shown together wherever that move appears, recap screen included. You can drop yours straight from the turn history log too, not just from the recap screen — its 💬 trigger is now a plain grey smiley, and the chat and turn history panels both say which end is newest.",
            },
            {
                title: "Play Dice Cities in the wasteland",
                detail: "Dice Cities now has themes: pick one when you set up a game and everyone plays in it. Alongside the original there's Rust & Bottlecaps — a post-nuclear wasteland where you're an Overseer rebuilding a settlement, the Wheat Field is a Hydroponic Plot, the Ranch is a Brahmin Pen, and everything is paid for in caps. Only the names and the look change: every cost, number and rule is identical, so it plays exactly the same. Its card art is still being drawn, so some cards still wear the original faces for now.",
                game: "dicecities",
            },
            {
                title: "Your own card leads the scoreboard",
                detail: "The player strip at the top of every game now puts you first and seats everyone else in the order they actually play, instead of the order you all joined — so you're never hunting for your own card in the middle of the row. Your card carries a soft tint to say it's yours; a bold ring now marks whoever's turn it is instead.",
            },
            {
                title: "See whether building early pays off in Dice Cities",
                detail: "The result page now charts how many establishments each player owned at the end of every turn, alongside the coins chart — so you can see whether building up early snowballed into a win, or whether saving for the big cards paid off instead.",
                game: "dicecities",
            },
            {
                title: "Dice Cities rolls now show who got paid",
                detail: "Every roll's payout now names who gained or lost coins and how many, right under the dice — no more working it out from the coin counts changing. And if it leaves you with nothing to spend and no free reroll left, your turn ends on its own instead of waiting for you to tap End turn.",
                game: "dicecities",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
            {
                title: "Solitaire's Hint stops repeating a move that goes nowhere",
                detail: "When the only card that could move was a run bouncing between two columns forever, Hint kept recommending that same swap instead of anything else — even with cards still sitting in the stock. It now tells you to draw or recycle the stock instead whenever a real move isn't available.",
                game: "solitaire",
            },
            {
                title: "No more “Alarms and reminders” prompt on Android",
                detail: "The Android app asked for permission to set alarms and reminders even though it never actually schedules one — a notification's plugin quietly carried the request along. It's gone for good now.",
            },
            {
                title: "Dice Cities' Amusement Park can be built again",
                detail: "Buying the Amusement Park quietly asked for the Radio Tower instead — so it was refused unless you could afford the more expensive one, and if you could, you got the wrong landmark for the wrong price. The two also had each other's powers: the extra turn on doubles belonged to the Radio Tower and the Amusement Park did nothing at all. Both now build, and cost, and do what their cards say.",
                game: "dicecities",
            },
            {
                title: "Chat opens on a game nobody has said anything in yet",
                detail: "Tapping 💬 on a board where the thread was still empty broke the screen instead of opening it — “That didn't go to plan” — which was every game until someone got the first message in somehow. An empty thread now opens ready for it.",
            },
            {
                title: "City names on a map no longer sit on top of each other",
                detail: "Outbreak, World Domination and Train Time all print their names straight onto the board, and where the map got busy they piled up — a city's name buried under its neighbour's, or under the disease cubes, pawns and stations crowding the dot next door. Every name on a board is now placed around the others: it keeps the side of its dot it has always used wherever there is room, steps round to a free side where there isn't, and turns inwards instead of running off the edge of the map.",
            },
            {
                title: "Notifications no longer go missing when the app is open",
                detail: "With Async Games open — on any screen, in any game — an arriving notification was quietly dropped instead of shown, so a turn could come round with nothing to tell you about it. They now appear whether you're in the app or not.",
            },
            {
                title: "Going home keeps you signed in",
                detail: "Coming back to the home page sometimes showed the sign-in page for visitors instead of your games — and pressing Sign in let you straight through, because you had never actually been signed out. Home now shows your games whenever you're signed in.",
            },
        ],
    },
];
