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
                title: "Tapping back to your games starts right away",
                detail: "Heading home used to leave the tap looking like it hadn't registered for a moment while the page worked out what to show you. It now shows straight away and fills in as it's ready, so nothing feels stuck.",
            },
            {
                title: "Rows grow into the space they need",
                detail: "A placeholder row can only guess how tall the real thing will be, so when your games arrived the list used to snap to its real size and shunt everything under your thumb. Each row now slides from the placeholder's height to its own — up or down — so the page settles instead of hopping.",
            },
            {
                title: "A game's result fills in where it will sit",
                detail: "Opening a finished game used to flash a stack of placeholder rows and then throw the whole page away for a different one. The summary and the stats now load into the shape they'll take — and the little match pop-up on your profile fills in the same way instead of saying “Loading…”.",
            },
            {
                title: "Swiping back closes what's open",
                detail: "The back gesture used to walk you out of the game whenever a sheet or menu was open. It now closes whatever is on top — the claim sheet, a trade, the options menu — and only leaves the screen once there's nothing left to close.",
            },
            {
                title: "Lists settle instead of jumping",
                detail: "When your games finish loading, the placeholder rows hand over to the real ones in place — a spare one shrinks away, an extra one grows in, and a list with nothing in it closes up gently rather than snapping shut under your thumb. Your profile's recent form settles the same way now.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
