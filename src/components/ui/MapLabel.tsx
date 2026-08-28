'use client'
import React from 'react';

interface MapLabelProps {
    x: number;
    y: number;
    textAnchor?: 'start' | 'middle' | 'end';
    fontSize?: number;
    fontWeight?: number;
    fill?: string;
    stroke?: string;
    strokeWidth?: number;
    strokeLinejoin?: 'round' | 'miter' | 'bevel';
    letterSpacing?: string;
    children: React.ReactNode;
}

/**
 * A name label meant to sit directly on a board's map art — outlined
 * (`paintOrder="stroke"`) so it reads over whatever colour is underneath it.
 * Shared by every board that labels its own nodes/regions on the art itself
 * rather than only in a hover tooltip: WorldDomination's continents,
 * TrainTime's and Outbreak's cities.
 */
export default function MapLabel({
    x, y, textAnchor = 'middle', fontSize = 9, fontWeight = 800,
    fill = '#fff', stroke = 'rgba(0,0,0,0.6)', strokeWidth = 3,
    strokeLinejoin, letterSpacing, children,
}: MapLabelProps) {
    return (
        <text
            x={x} y={y}
            textAnchor={textAnchor}
            fontSize={fontSize} fontWeight={fontWeight}
            fill={fill} stroke={stroke} strokeWidth={strokeWidth}
            strokeLinejoin={strokeLinejoin}
            letterSpacing={letterSpacing}
            paintOrder="stroke"
            pointerEvents="none"
        >
            {children}
        </text>
    );
}
