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
                title: "Outbreak shows how many actions you have left",
                detail: "Your turn's action list now has an “Actions” heading with the count still to spend beside it, so you can see at a glance how much of your turn is left before you draw and the diseases spread.",
                game: "outbreak",
            },
            {
                title: "Open a seat in Outbreak for anyone with the code",
                detail: "Setting up an Outbreak game now lets you leave seats open and share a code, so a friend can grab one and play as a guest without an account — the same way the other games already work.",
                game: "outbreak",
            },
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
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
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
        ],
    },
];
