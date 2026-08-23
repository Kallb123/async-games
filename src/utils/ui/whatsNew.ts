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
            {
                title: "Install it like an app",
                detail: "Add Async Games to your home screen and take your turns without the browser in the way.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Open seats count as players",
                detail: "Leaving seats open with nobody named no longer greys out the start button — set the seats, get your code and share it.",
            },
            {
                title: "Right names, right seats",
                detail: "A player Clerk couldn't look up used to shift every other name in the game out of place; now they just show as \"Unknown player\".",
            },
            {
                title: "Boards keep themselves up to date",
                detail: "An open board now refreshes on its own, so you see your opponent's move without reloading.",
            },
            {
                title: "Double-tapping setup no longer skips a turn",
                detail: "Sending the same command twice while a game is being set up can't push the turn out of step any more.",
            },
            {
                title: "Lists stop jumping about",
                detail: "Your games stay where they are while the screen refreshes in the background.",
            },
        ],
    },
];
