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
                title: "See every city in Dice Cities",
                detail: "Everyone's cards are face up on the table, but you could only ever see your own — so there was no way to tell what a roll of 3 was about to pay an opponent, or who was one landmark from winning. The landmark track at the top now shows every player's progress at once, a dot each per landmark, and every opponent's city sits under yours to open and close as you like.",
                game: "dicecities",
            },
            {
                title: "Outbreak tells you how you lost",
                detail: "\"The team lost\" was all you got, whether a colour's cube supply had run dry, the outbreak marker had maxed out, or you had simply run out of player cards. The finish banner, the result page and the notification now all name which of the three it was — and the result page adds a chart of every colour's remaining cubes, turn by turn, so you can see which supply was draining while you were curing something else.",
                game: "outbreak",
            },
            {
                title: "What's new goes back further",
                detail: "These notes used to show only the last handful of changes in each group, and everything older simply vanished. Each group now keeps the three newest in full and lists the ones before them underneath by name alone, so you can see everything that has landed since you last played without scrolling through paragraphs you have already read.",
            },
            {
                title: "Dice Cities cards you can actually read",
                detail: "The card art in your city, on the landmark track and in the market was too small to make out. Every card is now drawn as large as the space it sits in allows — the market fits another column and gives each card the full width of its slot — so most of them can be read where they are, and tapping any card opens it bigger still: the number it pays on, the cost and what it does, all legible at last. It works while you are waiting for your turn too, so you can plan your next build.",
                game: "dicecities",
            },
            {
                title: "Turn history behaves like chat now",
                detail: "Tapping 📜 on the board now scrolls straight to the turn history panel, the way 💬 already does for chat, and it has its own ✕ to close it instead of only the ⋮ menu.",
            },
            {
                title: "Fires Out's Experienced setup is clearer",
                detail: "Starting an Experienced game now shows exactly what its dice rolled in the turn log — where each explosion caught, and which rooms its hazmats, hot spots and POI markers landed in — and the setup screen's Recruit/Veteran/Heroic descriptions now say what's actually different between them.",
                game: "firesout",
            },
            {
                title: "See which friends are around right now",
                detail: "A green dot now sits on a friend's picture in your friends list while they're taking turns — anyone who has moved in a game in the last five minutes — so you can tell at a glance who is worth challenging now rather than tomorrow.",
            },
            {
                title: "Talk to your opponents during a game",
                detail: "Every game now has a chat thread: tap 💬 on the board to say something to the other players, and they get a nudge on their phone. It stays readable after the game ends, so “gg” has somewhere to go — and you can turn the notifications off in Settings if you'd rather just read it when you next open the board. Reading it on one device now clears it everywhere, the home screen shows how many messages are waiting in each game, and opening a game you're behind on tells you who messaged while you were away.",
            },
            {
                title: "Check your notifications actually work",
                detail: "Allowing notifications was only half of it: a phone can allow them and still quietly fail to sign itself up, and nothing told you. Settings now says where this device stands, has a Send a test notification button that tells you exactly what became of it, and a ? explaining everything which can stop one arriving — including the Android battery and per-app settings that block them without asking.",
            },
            {
                title: "Every game has a game guide",
                detail: "Not sure what a phase does or which pile to worry about? A game guide now opens the first time you join a match of Dice Cities, Settlements & Cities, Train Time, World Domination or Outbreak, and any time after that from the ⋮ menu at the top of the board.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
            {
                title: "Map connections that go round the world stay off the map",
                detail: "On the World Domination and Outbreak boards, the routes that cross from one side of the world to the other — Alaska to Kamchatka, San Francisco to Tokyo — used to be drawn as a long line straight across the whole map, over everything in the way. Each now heads off its own edge with a label naming where it comes out on the far side.",
            },
            {
                title: "The logo on a join link takes you home",
                detail: "Landing on a friend's join screen with nothing filled in used to be a dead end — there was no way back except the browser's own back button. Tapping the logo at the top now takes you home.",
            },
            {
                title: "Train Time's scores read properly when you look back",
                detail: "Stepping back through a Train Time match showed every score, train count and route tally as “NaN”. Reviewing a turn now shows the standings exactly as they stood at the time — and the points and longest-run graphs on a finished match are filled in again.",
                game: "traintime",
            },
            {
                title: "The name a guest picks is the name everyone sees",
                detail: "Take a seat as a guest and the name you typed now follows you everywhere — the move you just made, the recap of what you missed, stepping back through the turns, your profile, the reaction you send someone and the “you won” line. They used to show the jumble of letters your account was filed under instead.",
            },
            {
                title: "Your badge no longer flashes a stranger's initial",
                detail: "For a moment before your profile loaded, the little circle on the home page and your profile showed a “T” or a “Y” — the first letter of the words standing in for your name. You now get a plain silhouette until your real initials or photo are ready.",
            },
            {
                title: "The back arrow sits in the middle of its button",
                detail: "The little round back arrow at the top of the library, your profile, settings and every other screen was leaning down and to one side of its circle. It's centred now.",
            },
        ],
    },
];
