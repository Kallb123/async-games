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
            {
                title: "What's new folds away",
                detail: "These notes now start folded up at the bottom of the home page, so your games have the screen to themselves — tap the heading whenever you want to see what has changed.",
            },
            {
                title: "A screen that breaks now offers you a way out",
                detail: "If something goes wrong drawing a page, you get a proper Async Games screen with a “try again” button and a way back to your games — instead of a blank page with an error on it and nothing to tap.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Your badge no longer flashes a stranger's initial",
                detail: "For a moment before your profile loaded, the little circle on the home page and your profile showed a “T” or a “Y” — the first letter of the words standing in for your name. You now get a plain silhouette until your real initials or photo are ready.",
            },
            {
                title: "The back arrow sits in the middle of its button",
                detail: "The little round back arrow at the top of the library, your profile, settings and every other screen was leaning down and to one side of its circle. It's centred now.",
            },
            {
                title: "A join link opens on the invitation, not a blank page",
                detail: "Tapping a friend's join link used to leave you looking at an empty page while the app worked out who you were. It now opens straight onto their invitation — the code already filled in, a name picked for you, ready to take your seat.",
            },
            {
                title: "The banner at the bottom stops sitting on your content",
                detail: "The “install the app” and “turn on notifications” strips used to cover the last thing on the page — the bottom of a list, or the button you were reaching for. Pages now leave room for whichever one is showing, and give the space back the moment you wave it away.",
            },
            {
                title: "The home page stops flashing the wrong screen at you",
                detail: "Arriving at Async Games without being signed in used to show you an empty version of somebody's games list, loading, before throwing it away and showing you the welcome page. You now land on the right screen first time.",
            },
        ],
    },
];
