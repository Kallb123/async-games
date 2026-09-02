// Release notes for the "What's new" section at the bottom of the home page.
//
// KEEP THIS UP TO DATE: when a change lands that a player would notice — a new
// game, an enhancement, a fix — add a line to the right group in the same PR,
// newest first, and drop the oldest line once a group runs past five. This is
// a "what changed since you last played" note, not a full changelog: write it
// in the player's language and leave the internals out.

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

export const WHATS_NEW: WhatsNewGroup[] = [
    {
        label: "New games",
        icon: "🎲",
        items: [
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
                title: "Fires Out's board now matches the real thing",
                detail: "Smoke and fire are flippable tokens instead of a flat colour wash, victims and hazards sit on their own marker badges instead of floating text, and the board art now lines up properly with the grid.",
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
        ],
    },
];
