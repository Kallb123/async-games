import { useCallback, useEffect, useRef, useState } from "react";
import { useCloseRequest } from "./useCloseRequest";

// Shared open/outside-click/close-request shell for small anchored popups
// (kebab menus, reaction pickers, etc). Attach `rootRef` to the popup's
// positioning wrapper; the popup closes on a pointerdown outside that wrapper,
// or on a close request — Escape on a keyboard, the Android back gesture in the
// installed app (see useCloseRequest).
export function useDismissablePopup<T extends HTMLElement = HTMLDivElement>() {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<T>(null);

    const close = useCallback(() => setOpen(false), []);
    useCloseRequest(open, close);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        return () => document.removeEventListener('pointerdown', onPointerDown);
    }, [open]);

    return { open, setOpen, rootRef };
}
