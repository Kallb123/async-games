'use client'
import dynamic from "next/dynamic";
import type { ComponentProps } from "react";
import RealmArenaBoard from "@/games/RealmArena/components/RealmArenaBoard";

/** The 3D board's code (three.js and all), fetched only when a battle is opened. */
const RealmArenaBoard3D = dynamic(() => import("@/games/RealmArena/components/RealmArenaBoard3D"), { ssr: false });

/** Whether this browser can draw the 3D board. Asked once: a context is not free to make. */
let webgl: boolean | undefined;
function hasWebGL(): boolean {
    if (webgl === undefined) {
        try {
            webgl = !!document.createElement("canvas").getContext("webgl2");
        } catch {
            webgl = false;
        }
    }
    return webgl;
}

/**
 * The battlefield a player sees: the 3D board (docs/realm-arena-3d.md), or the isometric SVG
 * board where the browser has no WebGL. Both take exactly the same props. The SVG board stays
 * in the codebase, as the fallback and as the rendering bench's baseline.
 */
export default function RealmArenaPlayBoard(props: ComponentProps<typeof RealmArenaBoard>) {
    return hasWebGL() ? <RealmArenaBoard3D {...props} /> : <RealmArenaBoard {...props} />;
}
