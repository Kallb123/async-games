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
                title: "Train Time remembers what you missed",
                detail: "Open a Train Time game and you get the same welcome-back recap the other games have — every route claimed while you were away, plus a nudge at what your hand can pay for. You can step back through the whole match too, and the log has moved to the ⋯ menu so it's there on anyone's turn.",
                game: "traintime",
            },
            {
                title: "Turn review, in the game's colours",
                detail: "Stepping back through a match now happens on a warm dark scrubber with a turn track, and the screen stays in the app's theme instead of running to white below it.",
            },
            {
                title: "The match log reads like a timeline",
                detail: "Open the log in any game and the moves run down a thread, each dotted in the colour of the player who made it.",
            },
            {
                title: "Zoom in on the World Domination map",
                detail: "Tap Zoom in to blow the map up and pan around it, so those crowded territories are easy to hit — the same toggle Train Time has.",
                game: "worlddomination",
            },
            {
                title: "Guests get a warning before signing out",
                detail: "Signing out of a guest account now asks you to confirm first — there's no way back in, and your games and history go with it.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Whose turn it is, at a glance",
                detail: "Every game's scoreboard now marks the player to move with a caret next to their name — it was easy to miss in Train Time and missing altogether in Dice Cities.",
            },
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
        ],
    },
];
