import { useCallback, useState } from "react";

/**
 * State that falls back to `initial` whenever `resetKey` changes — a territory
 * selection changing, a phase advancing, a new pending occupation arriving.
 *
 * The obvious way to write this is `useEffect(() => setX(initial), [key])`, but
 * that's a synchronous setState inside an effect (react-hooks/set-state-in-effect):
 * React renders the stale value, runs the effect, then renders again. Holding the
 * value alongside the key it belongs to and ignoring it once the key moves on
 * gets the reset for free during the render that already knows about the change.
 */
export function useResettingState<T>(initial: T, resetKey: string): [T, (next: T) => void] {
    const [held, setHeld] = useState<{ key: string; value: T } | null>(null);
    const value = held?.key === resetKey ? held.value : initial;
    const setValue = useCallback((next: T) => setHeld({ key: resetKey, value: next }), [resetKey]);
    return [value, setValue];
}
