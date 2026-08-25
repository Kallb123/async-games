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
                title: "Join codes stay alive as long as your game does",
                detail: "A lobby used to close after an hour whatever game you set up. Now the code lasts as long as one turn of it — up to a week for the slow ones — and the lobby tells you when it runs out.",
            },
            {
                title: "Share a game and the link sells it for you",
                detail: "Drop a join link into a group chat and the preview now shows who's inviting you, how many seats are left, and a card for the game itself — instead of the same plain site link every time.",
            },
            {
                title: "Find your Train Time tickets on the map",
                detail: "Tap a ticket — while you're choosing which to keep, or in your ticket list — and its two cities light up on the board. Tap it again to put them out.",
                game: "traintime",
            },
            {
                title: "See how the Train Time race actually ran",
                detail: "A finished game now charts route points turn by turn, and the Long Haul race beside it — so you can see where the game was won, not just the final total.",
                game: "traintime",
            },
            {
                title: "Train Time remembers what you missed",
                detail: "Open a Train Time game and you get the same welcome-back recap the other games have — every route claimed while you were away, plus a nudge at what your hand can pay for. You can step back through the whole match too, and the log has moved to the ⋯ menu so it's there on anyone's turn.",
                game: "traintime",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Solitaire tells you when a deal is dead",
                detail: "A game you can't win now says so. It used to keep insisting there were moves left as long as a single card sat in the stock — even when nothing left in the pile could go anywhere, however many times you cycled it.",
                game: "solitaire",
            },
            {
                title: "Solitaire stops suggesting pointless King moves",
                detail: "Sliding a King that's already the base of its column into an empty space changes nothing, so it no longer clutters the move list or gets offered as a hint — and a board with nothing left but that shuffle is now correctly called out as stuck.",
                game: "solitaire",
            },
            {
                title: "Your hand is actually your hand",
                detail: "World Domination sent every player's territory cards to everyone, and Settlements & Cities did the same with resource hands and development cards — hidden on screen, but sitting in plain sight for anyone who went looking. Now only you get yours; everyone else sees a count, the way the games always meant it.",
            },
            {
                title: "Whose turn it is, at a glance",
                detail: "Every game's scoreboard now marks the player to move with a caret next to their name — it was easy to miss in Train Time and missing altogether in Dice Cities.",
            },
            {
                title: "One seat each, however many devices",
                detail: "Entering a code you're already in with takes you back to your own seat instead of quietly claiming a second one.",
            },
        ],
    },
];
