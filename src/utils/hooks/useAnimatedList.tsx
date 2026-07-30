'use client'

import { Children, isValidElement, ReactElement, ReactNode, useEffect, useRef, useState } from "react";

/** Must match the `.ag-anim-item` transition in `ag-theme.css`. */
const ANIM_MS = 450;

/** A row on screen: the one that is still in `children`, or one on its way out. */
type Slot = { key: string; node: ReactElement };

/**
 * Keeps keys that have left `next` in the slot they held in `prev`, so a row on
 * its way out stays where it was instead of jumping to the end of the list.
 */
function mergeKeys(prev: string[], next: string[]): string[] {
    const live = new Set(next);
    const merged = [...next];
    prev.forEach((key, i) => {
        if (!live.has(key)) merged.splice(Math.min(i, merged.length), 0, key);
    });
    return merged;
}

/**
 * Wraps each keyed child so it grows in from nothing when it arrives and
 * shrinks back to nothing when it leaves — a row removed from `children` stays
 * rendered until it has finished collapsing. Returns the wrapped children to
 * drop into whatever container the caller already uses (`ag-list`, `ag-stack`);
 * its length counts rows still animating out, so a caller can keep its section
 * on screen until the last one has gone.
 *
 * The first batch of rows appears without animating — that is the skeleton
 * handing over to real content, not a change to the list. Everything after it
 * animates.
 */
export default function useAnimatedList(children: ReactNode): ReactNode[] {
    const live = Children.toArray(children).filter(isValidElement) as ReactElement[];
    const liveNodes = new Map(live.map(child => [String(child.key), child]));
    const liveKeys = [...liveNodes.keys()];

    const [slots, setSlots] = useState<Slot[]>(() => live.map(child => ({ key: String(child.key), node: child })));
    const [entering, setEntering] = useState<string[]>([]);
    const [hasHadRows, setHasHadRows] = useState(liveKeys.length > 0);
    const exitTimers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

    const order = mergeKeys(slots.map(slot => slot.key), liveKeys);
    if (order.length !== slots.length || order.some((key, i) => key !== slots[i].key)) {
        // A row that has just left is no longer in `children`, so it carries on
        // rendering from the node the last change captured.
        const departed = new Map(slots.map(slot => [slot.key, slot.node]));
        setSlots(order.map(key => ({ key, node: liveNodes.get(key) ?? departed.get(key)! })));
        // Arrivals have to be marked in the same render they first mount in —
        // the `--enter` class is what gives them a collapsed starting style.
        const arrived = hasHadRows ? liveKeys.filter(key => !departed.has(key)) : [];
        if (arrived.length > 0) setEntering(previous => [...previous, ...arrived]);
    }
    if (!hasHadRows && liveKeys.length > 0) {
        setHasHadRows(true);
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

    // Arrivals only need the class while they are growing; keeping it would
    // leave the wrapper clipping shadows and focus rings for good.
    useEffect(() => {
        if (entering.length === 0) return;
        const timer = setTimeout(() => setEntering([]), ANIM_MS);
        return () => clearTimeout(timer);
    }, [entering]);

    useEffect(() => {
        const timers = exitTimers.current;
        return () => timers.forEach(timer => clearTimeout(timer));
    }, []);

    return slots.map(({ key, node }) => {
        const isLeaving = !liveNodes.has(key);
        const phase = isLeaving ? " ag-anim-item--exit" : entering.includes(key) ? " ag-anim-item--enter" : "";
        return (
            <div key={key} className={`ag-anim-item${phase}`}>
                <div className="ag-anim-item-inner">{liveNodes.get(key) ?? node}</div>
            </div>
        );
    });
}
