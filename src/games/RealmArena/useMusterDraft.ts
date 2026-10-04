import { useResettingState } from "@/utils/hooks/useResettingState";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import { pluralize } from "@/utils/ui/text";
import { REALM, squadPoints, type ItemId, type OptionId, type PlayerCount } from "./characters";
import type { Ranks } from "./mastery";
import { itemsPoints, musterRefusal, pickOf, readyMadeMuster, type MusterPick } from "./rules";
import { handItem, handOut, itemsOf, NO_ITEMS, placeTap, squadCounts, squadOf, type ItemCounts, type Placement, type SquadCounts } from "./ui";

/**
 * A squad being mustered, before it's sent (docs/games/realm-arena.md §17.3
 * PR 6): the characters and the items (§21.1) bought for them, and then where
 * each stands and which carries what. Held on this device alone until the
 * sealed `RealmArenaMuster` goes, and dropped when `turnKey` moves on.
 *
 * It starts from the faction's ready-made squad, the one a timed-out muster
 * gets (§17.2), so a player happy with it musters in two taps. Every point is
 * spent on the first step, items included. Placing starts from the same spread
 * a ready-made squad stands in, with the items handed down the squad one each,
 * so every pick already has a square and an item if there's one for it; the
 * player only moves the ones they want elsewhere, passes the items between
 * them, and picks an option (§23.2) a rank has unlocked.
 */
export function useMusterDraft(field: Battlefield, seat: number, playerCount: number, budget: number, ranks: Ranks, turnKey: string) {
    // Every player fights as the Realm (§29.3).
    const readyMade = REALM.readyMade[playerCount as PlayerCount] ?? [];
    const [counts, setCounts] = useResettingState<SquadCounts>(squadCounts(readyMade), turnKey);
    const [items, setItems] = useResettingState<ItemCounts>(NO_ITEMS, turnKey);
    const [placement, setPlacement] = useResettingState<Placement | null>(null, turnKey);

    const squad = squadOf(counts);
    const bought = itemsOf(items);
    const zone = field.deployments[seat] ?? [];
    // Only a seat with a zone can muster; anyone else has nothing to place.
    const spread = zone.length > 0 ? readyMadeMuster(field, seat, squad) : [];
    const picks = placement?.picks ?? handOut(spread, items);
    // The server's own rule, so nothing it would refuse is offered. A pick
    // holds one item at most, so the server can't be sent more items than
    // characters: only a draft can buy them, and handing out would drop the rest.
    const refusal = squad.length > 0 && bought.length > squad.length
        ? `Your squad can carry ${pluralize(squad.length, "item")}, one each`
        : musterRefusal(field, seat, picks, budget, ranks, REALM);

    // Changes what the character picked up goes into battle with.
    const outfit = (change: (picks: MusterPick[], selected: number) => MusterPick[]) => {
        if (placement?.selected == null) return;
        setPlacement({ ...placement, picks: change(placement.picks, placement.selected) });
    };

    return {
        /** The characters the squad is bought from: its faction's roster, as the server holds it to. */
        roster: REALM.characters,
        counts,
        setCounts,
        /** The items bought for the squad to carry. */
        items,
        setItems,
        /** What's left of the budget, items included — every item bought, even one the squad has no hands for yet. */
        pointsLeft: budget - squadPoints(squad) - itemsPoints(bought),
        refusal,
        /** The player's own ranks, as the battle snapshotted them: what unlocks an option. */
        ranks,
        /** The squad as placed so far, or null while it's still being picked. */
        placement,
        zone,
        place: () => setPlacement({ picks, selected: null }),
        unplace: () => setPlacement(null),
        tap: (square: Square) => placement && setPlacement(placeTap(placement, square, zone)),
        /** Picks up the `index`th of the squad, from the list under the board rather than its figure. */
        select: (index: number) => placement && setPlacement({ ...placement, selected: index }),
        /** Gives the character picked up `item`, swapping with whoever of the squad carried it. */
        carry: (item: ItemId) => outfit((all, selected) => handItem(all, selected, item)),
        /** Musters the character picked up with `option`, or as the starter character. */
        choose: (option: OptionId | null) => outfit((all, selected) =>
            all.map((pick, i) => i === selected ? pickOf({ ...pick, option: option ?? undefined }) : pick)),
    };
}

export type MusterDraft = ReturnType<typeof useMusterDraft>;
