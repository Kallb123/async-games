import { useCallback, useEffect, useRef, useState } from "react";
import { useCloseRequest } from "./useCloseRequest";

// How far a finger may travel and still count as a tap rather than a swipe.
const TAP_SLOP_PX = 12;

// Shared open/outside-tap/close-request shell for small anchored popups (kebab
// menus, reaction pickers, etc). Attach `rootRef` to the popup's positioning
// wrapper; the popup closes on a tap outside that wrapper, or on a close
// request — Escape on a keyboard, the Android back gesture in the installed app
// (see useCloseRequest).
export function useDismissablePopup<T extends HTMLElement = HTMLDivElement>() {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<T>(null);

    const close = useCallback(() => setOpen(false), []);
    useCloseRequest(open, close);

    useEffect(() => {
        if (!open) return;

        // Only a *tap* outside closes the popup — pressed and lifted in roughly
        // the same place, outside it both times. Closing on the `pointerdown`
        // alone, which is what this did, also closed the popup at the start of
        // an Android back gesture: that gesture begins as a pointerdown at the
        // very edge of the screen, so the popup was gone — and its close watcher
        // destroyed with it — before the gesture had been recognised, leaving the
        // back to go through to the router and take the player out of the game.
        // A swipe now leaves the popup alone however the browser reports it:
        // usually the pointer is cancelled outright, and if it isn't, the finger
        // has still travelled too far to be a tap.
        let tap: { id: number; x: number; y: number } | null = null;
        const outside = (target: EventTarget | null) =>
            !!rootRef.current && !rootRef.current.contains(target as Node);

        const onPointerDown = (e: PointerEvent) => {
            tap = outside(e.target) ? { id: e.pointerId, x: e.clientX, y: e.clientY } : null;
        };
        const onPointerUp = (e: PointerEvent) => {
            const moved = tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > TAP_SLOP_PX;
            if (tap?.id === e.pointerId && !moved && outside(e.target)) {
                setOpen(false);
            }
            tap = null;
        };
        const onPointerCancel = () => { tap = null; };

        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('pointerup', onPointerUp);
        document.addEventListener('pointercancel', onPointerCancel);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('pointerup', onPointerUp);
            document.removeEventListener('pointercancel', onPointerCancel);
        };
    }, [open]);

    return { open, setOpen, rootRef };
}
