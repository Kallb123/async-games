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
                title: "Everyone waits in the lobby",
                detail: "Claim a seat with a code and you wait on the lobby screen with the host, watching the last seats fill instead of guessing.",
            },
            {
                title: "Join a game with a code",
                detail: "Open a few seats when you set up a game and share the code — anyone who enters it grabs a spot, no invite required.",
            },
            {
                title: "Invites show which game you've been asked to play",
                detail: "Each invite now carries the game's icon next to the sender, so you can tell them apart at a glance.",
            },
            {
                title: "Your finished games have their own page",
                detail: "The home screen keeps the ten most recent; the rest are a tap away instead of buried.",
            },
            {
                title: "Profile pictures",
                detail: "Upload a photo of your own, or keep the one from the account you signed in with.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "One seat each, however many devices",
                detail: "Entering a code you're already in with takes you back to your own seat instead of quietly claiming a second one.",
            },
            {
                title: "Your lobby takes you into the game",
                detail: "Waiting on the lobby screen when the last seat fills now drops everyone straight onto the board instead of back at the home screen.",
            },
            {
                title: "Open-seat games get their code",
                detail: "Setting up a game with open seats and nobody invited no longer fails with an error — you get the code to share straight away.",
            },
            {
                title: "Open seats count as players",
                detail: "Leaving seats open with nobody named no longer greys out the start button — set the seats, get your code and share it.",
            },
            {
                title: "Right names, right seats",
                detail: "A player Clerk couldn't look up used to shift every other name in the game out of place; now they just show as \"Unknown player\".",
            },
        ],
    },
];
