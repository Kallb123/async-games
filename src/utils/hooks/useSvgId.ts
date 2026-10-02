import { useId } from "react";

/**
 * An id for an SVG definition — a mask, a pattern, a clip — that's unique to
 * this component on the page and safe to refer to as `url(#…)`, which not all
 * of `useId`'s own characters are.
 */
export function useSvgId(prefix: string): string {
    return `${prefix}-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
}
