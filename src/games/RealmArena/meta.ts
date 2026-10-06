import type { GameMeta } from "@/utils/ui/games";

export const meta: GameMeta = {
    url: "realmarena",
    name: "Realm Arena",
    categories: ["Strategy"],
    // Two on the Ruined Fort, or a free-for-all of three on the Ring Fort or
    // four on the Four-Gate Fort (docs/games/realm-arena.md §17.4 B2, §19).
    players: "2–4 players",
    minPlayers: 2,
    maxPlayers: 4,
    tagline: "Muster a squad in secret, then fight for the centre one action at a time.",
    accent: "#8a2c2c",
    glyph: "⚔️",
    // Version 2 is the rules it launched with (§17.3 PR 10). Every battle
    // before that was a playtest, played while the rules were still changing
    // under it — elevation (§25) among them — and recorded as version 1 or
    // with no version at all, so none of them can be replayed faithfully.
    // Refusing them leaves a playtest battle without a recap rather than with
    // a wrong one (docs/command-versions.md).
    // Version 4 lets a muster name its faction (§32): a tab from before it
    // can't, and would only be refused in a battle without the Realm, so it's
    // asked to reload instead. Version 3's musters replay unchanged, as the Realm.
    // Version 5 grows every Hold Out wave a character on the last (§30.10): an
    // End turn from before it lands a wave that only refills, on a replay too.
    commandVersion: 5,
    oldestReplayableCommandVersion: 2,
    available: true,
};
