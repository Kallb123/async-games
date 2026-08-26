'use client'

import { Children, Fragment, isValidElement, ReactElement, ReactNode, useEffect, useRef, useState } from "react";
import Collapse, { ANIM_MS } from "@/components/ui/Collapse";

/** A row on screen: one still in `children`, one on its way out, or a
 *  placeholder standing in for a row that hasn't loaded yet. */
type Slot = { key: string; node: ReactElement; placeholder: boolean };

export interface AnimatedListOptions {
    /** True until the first response lands — see `useRefreshableData`. */
    isLoading?: boolean;
    /** The row to stand in with while loading, and how many of it — a `count` of
     *  0 for a list that shows nothing at all until it has loaded. */
    placeholder?: { node: ReactNode; count: number };
}

/** Where every row ends up when `next` replaces `prev`. */
export interface ListPlan {
    /** Every key still on screen, in render order: those in `next`, plus those still leaving. */
    order: string[];
    /** Placeholders an arriving row has taken the place of, each mapped to the row
     *  that took it — dropped this render, unanimated, but the row transitions
     *  from the height the placeholder was standing at. */
    handovers: Map<string, string>;
    /** Arrivals with no placeholder to take over, which grow in from nothing. */
    entering: string[];
}

/**
 * Pairs the placeholders leaving with the rows arriving, in order, so the
 * hand-over from skeleton to real data animates only the *difference* between
 * the two counts: two rows landing on two placeholders moves nothing, three
 * rows grows the third in, one row collapses the spare placeholder, and a
 * response with nothing in it collapses both rather than blinking them away.
 *
 * Anything with no counterpart animates as usual, and keys that have left keep
 * the slot they held in `prev`, so a row on its way out stays where it was
 * instead of jumping to the end of the list.
 */
export function planList(prev: readonly { key: string; placeholder: boolean }[], next: readonly string[]): ListPlan {
    const live = new Set(next);
    const held = new Set(prev.map(slot => slot.key));
    const arrivals = next.filter(key => !held.has(key));
    const spare = prev.filter(slot => slot.placeholder && !live.has(slot.key));
    const swapped = Math.min(spare.length, arrivals.length);
    const handovers = new Map(spare.slice(0, swapped).map((slot, i) => [slot.key, arrivals[i]]));

    const order = [...next];
    prev.forEach((slot, i) => {
        if (live.has(slot.key) || handovers.has(slot.key)) return;
        order.splice(Math.min(i, order.length), 0, slot.key);
    });
    return { order, handovers, entering: arrivals.slice(swapped) };
}

/**
 * Wraps each keyed child so it grows in from nothing when it arrives and
 * shrinks back to nothing when it leaves — a row removed from `children` stays
 * rendered until it has finished collapsing. Returns the wrapped children to
 * drop into whatever container the caller already uses (`ag-list`, `ag-stack`);
 * its length counts rows still animating out, so a caller can keep its section
 * on screen until the last one has gone.
 *
 * Pass the skeleton as `placeholder` rather than rendering it yourself: it then
 * takes part in the same animation, and `planList` above turns the hand-over
 * into the smallest movement that gets from N placeholders to M rows — down to
 * the height each row lands at, which a placeholder can only ever guess.
 */
export default function useAnimatedList(children: ReactNode, options: AnimatedListOptions = {}): ReactNode[] {
    const { isLoading = false, placeholder } = options;
    const shown = isLoading && placeholder
        ? Array.from({ length: placeholder.count }, (_, i) => <Fragment key={`placeholder-${i}`}>{placeholder.node}</Fragment>)
        : children;
    const live = Children.toArray(shown).filter(isValidElement) as ReactElement[];
    const liveNodes = new Map(live.map(child => [String(child.key), child]));
    const liveKeys = [...liveNodes.keys()];

    const [slots, setSlots] = useState<Slot[]>(() => live.map(child => ({ key: String(child.key), node: child, placeholder: isLoading })));
    const [entering, setEntering] = useState<string[]>([]);
    // Rows that took a placeholder's place, and the height it was standing at,
    // so each transitions to its own height instead of snapping to it. Both are
    // state rather than a measurement read back mid-render: the height has to be
    // in hand *before* the render that mounts those rows.
    const [handedOver, setHandedOver] = useState<string[]>([]);
    const [placeholderHeight, setPlaceholderHeight] = useState(0);
    // False until the list has finished loading once — an empty list that has
    // settled is still settled, so its first row counts as an arrival.
    const [hasSettled, setHasSettled] = useState(false);
    const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    const plan = planList(slots, liveKeys);
    if (plan.order.length !== slots.length || plan.order.some((key, i) => key !== slots[i].key)) {
        // A row that has just left is no longer in `children`, so it carries on
        // rendering from the node the last change captured.
        const held = new Map(slots.map(slot => [slot.key, slot]));
        setSlots(plan.order.map(key => {
            const was = held.get(key);
            return { key, node: liveNodes.get(key) ?? was!.node, placeholder: was ? was.placeholder : isLoading };
        }));
        // Arrivals have to be marked in the same render they first mount in —
        // the `--enter` class is what gives them a collapsed starting style. A
        // first load with no placeholders lands whole instead: nothing was on
        // screen for those rows to grow out of.
        const grown = hasSettled || plan.handovers.size > 0 ? plan.entering : [];
        if (grown.length > 0) setEntering(current => [...current, ...grown]);
        // Same story for the rows that did have a placeholder to take over: they
        // have to be handed its height in the render they mount in, before the
        // browser has painted them at their own.
        if (plan.handovers.size > 0 && placeholderHeight > 0) {
            setHandedOver([...plan.handovers.values()]);
        }
    }
    if (!hasSettled && !isLoading) {
        setHasSettled(true);
    }

    // Drop each departed key once it has finished collapsing, and cancel that if
    // it comes back before then.
    useEffect(() => {
        const timers = exitTimers.current;
        slots.forEach(({ key }) => {
            if (liveNodes.has(key) || timers.has(key)) return;
            timers.set(key, setTimeout(() => {
                timers.delete(key);
                setSlots(current => current.filter(slot => slot.key !== key));
            }, ANIM_MS));
        });
        timers.forEach((timer, key) => {
            if (!liveNodes.has(key)) return;
            clearTimeout(timer);
            timers.delete(key);
        });
    });

    // Arrivals only need marking while they are moving; keeping it would leave
    // the wrapper clipping shadows and focus rings for good, and would hand a
    // stale height to a key that leaves and comes back.
    useEffect(() => {
        if (entering.length === 0 && handedOver.length === 0) return;
        const timer = setTimeout(() => {
            setEntering([]);
            setHandedOver([]);
        }, ANIM_MS);
        return () => clearTimeout(timer);
    }, [entering, handedOver]);

    useEffect(() => {
        const timers = exitTimers.current;
        return () => timers.forEach(timer => clearTimeout(timer));
    }, []);

    return slots.map(({ key, node, placeholder: isPlaceholder }, i) => {
        const leaving = !liveNodes.has(key);
        return (
            <Collapse
                key={key}
                phase={leaving ? "exit" : entering.includes(key) ? "enter" : undefined}
                from={handedOver.includes(key) ? placeholderHeight : undefined}
                // One placeholder, still standing at its full height, is all
                // there is to measure: they are all the same node, and one on
                // its way out is already collapsing to nothing. Measuring costs
                // a layout, so only the first slot is asked.
                onMeasure={i === 0 && isPlaceholder && !leaving ? setPlaceholderHeight : undefined}
            >
                {liveNodes.get(key) ?? node}
            </Collapse>
        );
    });
}
