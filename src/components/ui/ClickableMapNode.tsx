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
export default function ClickableMapNode({ x, y, radius, isValid = false, isSelected = false, onClick, title, children }: ClickableMapNodeProps) {
    const clickable = !!onClick && (isValid || isSelected);
    return (
        <g onClick={() => clickable && onClick?.()} style={{ cursor: clickable ? 'pointer' : 'default' }}>
            <title>{title}</title>
            {isValid && (
                <circle cx={x} cy={y} r={radius + 4.5} fill="none" stroke="var(--ag-gold)" strokeWidth={2.5} />
            )}
            {isSelected && (
                <circle cx={x} cy={y} r={radius + 4.5} fill="none" stroke="#fff" strokeWidth={2.5} />
            )}
            {children}
        </g>
    );
}
