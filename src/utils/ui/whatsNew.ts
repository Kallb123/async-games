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
                title: "Your home screen keeps up while you're looking at it",
                detail: "Invites accepted, seats claimed, a game starting — the lists now update while the screen is open, instead of waiting until you'd been away and come back. It loads quicker too.",
            },
            {
                title: "Say what you want to hear about",
                detail: "Settings now has a switch for game results — the one kind of notification that used to arrive however you'd set things — and the chat switch that never did anything has gone. Turning notifications off now really does turn all of them off.",
            },
            {
                title: "One notification per game, not a pile of them",
                detail: "A new notification about a game replaces the last one instead of stacking up behind it, so a week away no longer means a column of the same thing. Tapping one takes you into the app you already have open, rather than opening a second copy of it.",
            },
            {
                title: "The app says the same thing wherever you meet it",
                detail: "Install Async Games and the splash screen, the install prompt and the browser's own top bar are now the warm cream every screen is, not the slightly-off grey they used to be — and the prompt, a shared link and a search result all describe it the same way instead of three different ways.",
            },
            {
                title: "Join codes stay alive as long as your game does",
                detail: "A lobby used to close after an hour whatever game you set up. Now the code lasts as long as one turn of it — up to a week for the slow ones — and the lobby tells you when it runs out.",
            },
        ],
    },
    {
        label: "Bug fixes",
        icon: "🔧",
        items: [
            {
                title: "Friend requests stop springing out at you",
                detail: "Opening your profile used to make the requests you'd sent slide into place as though they had just arrived that second. They're simply there now — the sliding is saved for a request that actually turns up while you're looking.",
            },
            {
                title: "Everyone accepting at once no longer strands the game",
                detail: "If two of you accepted the same invite in the same moment, the game sometimes never started — the invite just sat there with everybody in it. It starts now, whoever taps last. A double-tapped accept can't deal you two copies of the same game any more either.",
            },
            {
                title: "Notifications stop switching themselves off on iPhone",
                detail: "The app used to send invisible background pings just to keep your open screens up to date. iPhones count those against an app and quietly revoke its notifications after a few — which is why yours kept going dead. They're all gone: screens refresh when you come back to them instead.",
            },
            {
                title: "A nudge is a nudge, not a nagging",
                detail: "Nudging the same game more than once an hour no longer buzzes the other player's phone again — the button used to come back to life on a page reload.",
            },
            {
                title: "Get back to a lobby you opened",
                detail: "An open game waiting in “Awaiting response” is now a tap away from its lobby, so you can read the code out again or see who has taken a seat — instead of only ever seeing it the once when you made it.",
            },
        ],
    },
];
