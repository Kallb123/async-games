'use client'
import React from 'react';

interface ClickableMapNodeProps {
    x: number;
    y: number;
    radius: number;
    /** Highlight this node as a legal tap target (gold ring). */
    isValid?: boolean;
    /** Highlight this node as the already-chosen selection (white ring). */
    isSelected?: boolean;
    /** Highlight this node as something pointed at from elsewhere on screen
     *  (e.g. a tapped card) — purely informational, so it never affects
     *  whether the node is clickable. */
    isHighlighted?: boolean;
    /** Draw the `isValid`/`isSelected` ring at all — on by default. The ring's
     *  offset is a fixed handful of board units, tuned for World Domination's
     *  and Outbreak's much larger nodes; a board whose own nodes are that
     *  small (Kingdom Builder) or that already says what is tappable some
     *  other way (a label) can turn it off here while `isValid`/`isSelected`
     *  keep deciding whether the node is clickable and what its cursor is. */
    showRing?: boolean;
    onClick?: () => void;
    /** Hover/long-press tooltip — becomes the SVG `<title>`. */
    title: React.ReactNode;
    /** The node's own shape and markers, drawn after the rings. */
    children: React.ReactNode;
}

/**
 * The tap target every board's SVG node needs — the click handler, its
 * legal/selected ring and a hover tooltip — identical across World
 * Domination's territories and Outbreak's cities even though what each node
 * actually draws (an owner-coloured circle vs. a disease-coloured circle with
 * cube stacks, a station marker and pawns) is not. Render a node's own
 * content as `children`; this only owns the interaction chrome around it.
 */
export default function ClickableMapNode({ x, y, radius, isValid = false, isSelected = false, isHighlighted = false, showRing = true, onClick, title, children }: ClickableMapNodeProps) {
    const clickable = !!onClick && (isValid || isSelected);
    return (
        <g onClick={() => clickable && onClick?.()} style={{ cursor: clickable ? 'pointer' : 'default' }}>
            <title>{title}</title>
            {isHighlighted && (
                <circle className="ag-map-highlight-ring" cx={x} cy={y} r={radius + 6.5} fill="none" stroke="var(--ag-danger)" strokeWidth={2.5} strokeDasharray="3 2" />
            )}
            {isValid && showRing && (
                <circle cx={x} cy={y} r={radius + 4.5} fill="none" stroke="var(--ag-gold)" strokeWidth={2.5} />
            )}
            {isSelected && showRing && (
                <circle cx={x} cy={y} r={radius + 4.5} fill="none" stroke="#fff" strokeWidth={2.5} />
            )}
            {children}
        </g>
    );
}
