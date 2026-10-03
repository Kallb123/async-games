import { useResettingState } from "@/utils/hooks/useResettingState";
import type { Battlefield, Square } from "@/utils/games/battlefield/terrain";
import { REALM, type ItemId, type OptionId, type PlayerCount } from "./characters";
import type { Ranks } from "./mastery";
import { musterPoints, musterRefusal, pickOf, readyMadeMuster, type MusterPick } from "./rules";
import { placeTap, squadCounts, squadOf, type Placement, type SquadCounts } from "./ui";

/**
 * A squad being mustered, before it's sent (docs/games/realm-arena.md §17.3
 * PR 6): the characters picked, and then where each stands. Held on this
 * device alone until the sealed `RealmArenaMuster` goes, and dropped when
 * `turnKey` moves on.
 *
 * It starts from the faction's ready-made squad, the one a timed-out muster
 * gets (§17.2), so a player happy with it musters in two taps. Placing starts
 * from the same spread a ready-made squad stands in, so every pick already has
 * a square, and the player only moves the ones they want elsewhere — and gives
 * an item (§21.1) to whichever they pick up, out of the same points, and an
 * option (§23.2) its rank has unlocked.
 */
export function useMusterDraft(field: Battlefield, seat: number, playerCount: number, budget: number, ranks: Ranks, turnKey: string) {
    const readyMade = REALM.readyMade[playerCount as PlayerCount] ?? [];
    const [counts, setCounts] = useResettingState<SquadCounts>(squadCounts(readyMade), turnKey);
    const [placement, setPlacement] = useResettingState<Placement | null>(null, turnKey);

    const squad = squadOf(counts);
    const zone = field.deployments[seat] ?? [];
    // Only a seat with a zone can muster; anyone else has nothing to place.
    const spread = zone.length > 0 ? readyMadeMuster(field, seat, squad) : [];
    const picks = placement?.picks ?? spread;
    // The server's own rule, so nothing it would refuse is offered.
    const refusal = musterRefusal(field, seat, picks, budget, ranks);

    // Changes what the character picked up goes into battle with.
    const outfit = (change: Pick<MusterPick, "item" | "option">) => {
        if (placement?.selected == null) return;
        const { selected } = placement;
        setPlacement({ ...placement, picks: placement.picks.map((pick, i) => i === selected ? pickOf({ ...pick, ...change }) : pick) });
    };

    return {
        counts,
        setCounts,
        /** What's left of the budget, items included. */
        pointsLeft: budget - musterPoints(picks),
        refusal,
        /** The player's own ranks, as the battle snapshotted them: what unlocks an option. */
        ranks,
        /** The squad as placed so far, or null while it's still being picked. */
        placement,
        zone,
        place: () => setPlacement({ picks: spread, selected: null }),
        unplace: () => setPlacement(null),
        tap: (square: Square) => placement && setPlacement(placeTap(placement, square, zone)),
        /** Gives the character picked up `item` to carry, in place of whatever it had, or nothing. */
        carry: (item: ItemId | null) => outfit({ item: item ?? undefined }),
        /** Musters the character picked up with `option`, or as the starter character. */
        choose: (option: OptionId | null) => outfit({ option: option ?? undefined }),
    };
}

export type MusterDraft = ReturnType<typeof useMusterDraft>;
