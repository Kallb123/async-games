import { useEffect, useRef, useState } from "react";

// Shared open/outside-click/Escape shell for small anchored popups (kebab
// menus, reaction pickers, etc). Attach `rootRef` to the popup's positioning
// wrapper; the popup closes on a pointerdown outside that wrapper or on Escape.
export function useDismissablePopup<T extends HTMLElement = HTMLDivElement>() {
    const [open, setOpen] = useState(false);
    const rootRef = useRef<T>(null);

    useEffect(() => {
        if (!open) return;
        const onPointerDown = (e: PointerEvent) => {
            if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setOpen(false);
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);

    return { open, setOpen, rootRef };
}
