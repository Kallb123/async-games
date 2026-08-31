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
                title: "Check your notifications actually work",
                detail: "Allowing notifications was only half of it: a phone can allow them and still quietly fail to sign itself up, and nothing told you. Settings now says where this device stands, has a Send a test notification button that tells you exactly what became of it, and a ? explaining everything which can stop one arriving — including the Android battery and per-app settings that block them without asking.",
            },
            {
                title: "Every game has a game guide",
                detail: "Not sure what a phase does or which pile to worry about? A game guide now opens the first time you join a match of Dice Cities, Settlements & Cities, Train Time, World Domination or Outbreak, and any time after that from the ⋮ menu at the top of the board.",
            },
            {
                title: "Your cards stay on screen between your turns",
                detail: "Waiting for someone else to move used to leave you looking at the board and nothing else. Your hand, the face-up cards and what's left in the deck now stay put in Train Time, the market in Dice Cities and the cards you're holding in World Domination — greyed out until it's your go, so you can plan the move but not make it early.",
            },
            {
                title: "Change the name friends invite you by",
                detail: "The username you picked when you signed up used to be yours for good, typo and all. Your profile now has an Edit username button — take a new one and it follows you straight away: your friends' invite lists, the games you're already in, and your match history.",
            },
            {
                title: "Open a seat in Outbreak for anyone with the code",
                detail: "Setting up an Outbreak game now lets you leave seats open and share a code, so a friend can grab one and play as a guest without an account — the same way the other games already work.",
                game: "outbreak",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
        ],
    },
];
