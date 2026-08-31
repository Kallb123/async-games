'use client'
import React from 'react';
import MapLabel, { MAP_LABEL_FONT_SIZE, MAP_LABEL_FONT_WEIGHT, type MapLabelProps } from '@/components/ui/MapLabel';
import { circleRect, resolveMapLabels, type MapLabelDir, type Rect } from '@/utils/ui/mapLabels';

export interface MapLabelSpec {
    key: React.Key;
    /** Centre of the node this label names. */
    x: number;
    y: number;
    text: string;
    /** The side it sits on when nothing is in the way; the layer moves it only
     *  if that side is taken. Defaults to north. */
    dir?: MapLabelDir;
    /** The node's own radius. Set it and the layer fences the node off for you,
     *  so every board doesn't have to remember to dodge its own dots. Leave it
     *  out when the label names something other than a node (World Domination's
     *  continents) and pass the fences as `obstacles` instead. */
    radius?: number;
    fontSize?: number;
    fontWeight?: number;
    fill?: string;
}

interface MapLabelLayerProps extends Omit<MapLabelProps, 'x' | 'y' | 'textAnchor' | 'children' | 'letterSpacing'> {
    labels: MapLabelSpec[];
    /** Anything else the labels must keep off — the markers drawn beside the
     *  nodes, and any label placed outside this pass. The nodes themselves come
     *  from each label's own `radius`. */
    obstacles?: Rect[];
    /** The board's viewBox, so no label is pushed off the map. */
    width: number;
    height: number;
    /** Clearance from a node centre to its name. */
    offset?: number;
    /** Extra tracking, in em — drawn as `letterSpacing` and allowed for when
     *  the label's width is worked out. */
    letterSpacingEm?: number;
}

const DEFAULT_OFFSET = 12;

/**
 * Every name label a map board prints on its art, laid out in one pass so that
 * no two of them — and no label and marker — end up printed on top of each
 * other (see `resolveMapLabels`). Each label names the side of its node it
 * would like to sit on and gets it whenever it's free.
 *
 * It has to be one layer per board rather than a label inside each node's own
 * group, because a label can only dodge its neighbours if something knows
 * about all of them at once. Drawing them last is the bonus: a name now always
 * reads over the next node's markers instead of under them.
 */
export default function MapLabelLayer({
    labels, obstacles, width, height,
    offset = DEFAULT_OFFSET,
    fontSize = MAP_LABEL_FONT_SIZE, fontWeight = MAP_LABEL_FONT_WEIGHT, fill,
    letterSpacingEm, ...style
}: MapLabelLayerProps) {
    const placed = resolveMapLabels(
        labels.map(label => ({
            x: label.x,
            y: label.y,
            text: label.text,
            fontSize: label.fontSize ?? fontSize,
            offset,
            dir: label.dir ?? 'n',
            letterSpacingEm,
        })),
        {
            bounds: { x: 0, y: 0, width, height },
            obstacles: [
                ...(obstacles ?? []),
                ...labels.flatMap(l => l.radius === undefined ? [] : [circleRect(l.x, l.y, l.radius)]),
            ],
        },
    );

    return (
        <>
            {labels.map((label, i) => (
                <MapLabel
                    key={label.key}
                    x={placed[i].x} y={placed[i].y} textAnchor={placed[i].textAnchor}
                    fontSize={label.fontSize ?? fontSize}
                    fontWeight={label.fontWeight ?? fontWeight}
                    fill={label.fill ?? fill}
                    letterSpacing={letterSpacingEm === undefined ? undefined : `${letterSpacingEm}em`}
                    {...style}
                >
                    {label.text}
                </MapLabel>
            ))}
        </>
    );
}
