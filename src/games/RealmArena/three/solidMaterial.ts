// How the 3D board shades its solids — the figures and the raised ground — as
// the sprite renderer shades the characters (scripts/lib/isoRender.mjs
// `shade`): an ambient sky that is brighter on what faces up, diffuse light from
// the upper left fixed to the camera, a highlight on what `shine`s, and
// anything that `glow`s at its own colour whatever the light. Worked in the
// colours as written (sRGB), as the sprites were, and written out as they are,
// so a figure in 3D is the colour of its sprite.
//
// Each vertex brings its colour and its flags (team, glow, shine:
// characterModels.ts). An instance's colour (`InstancedMesh.setColorAt`) is
// its owner's: it tints the vertices flagged team.
//
// A solid can also be drawn faded a figure at a time (`perInstance`: a figure
// the action downs fading out as its fallen one fades in), or only where
// something nearer hides it (`behind`: the faint figure a wall hides), or as
// its outline alone (`outline`: an inverted hull, the solid's back faces pushed
// out along their normals and drawn dark, which shows round the solid's edge).

import { BackSide, CustomBlending, FrontSide, GreaterDepth, OneMinusSrcAlphaFactor, ShaderMaterial, SrcAlphaFactor, type Texture, Vector3 } from "three";
import type { Vec3 } from "./iso3d";

/** How far nearer the camera a figure drawn `behind` is drawn, in world units: so a figure's feet, level with the ground they stand on, are never taken for hidden by it. */
const BEHIND_BIAS = 0.04;

/** How far an outline stands out from its solid, in world units (a square's side): about a pixel on a phone at the fit. */
export const OUTLINE_WIDTH = 0.018;
/** The colour an outline is drawn in. */
const OUTLINE_COLOUR = "vec3(0.07, 0.05, 0.04)";

const vertexShader = /* glsl */ `
attribute vec3 flags;
#ifdef MAPPED
attribute vec3 instanceSkin;
varying vec2 vUv;
varying float vFacesUp;
varying float vFoot;
#endif
#ifdef INSTANCE_OPACITY
attribute float instanceOpacity;
#endif
varying float vOpacity;
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vFlags;
varying vec3 vTint;
void main() {
    mat4 placed = modelMatrix;
#ifdef USE_INSTANCING
    placed = placed * instanceMatrix;
#endif
    vNormal = normalize(mat3(placed) * normal);
#ifdef USE_COLOR
    vColour = color;
#else
    vColour = vec3(1.0);
#endif
    vTint = vec3(1.0);
#ifdef USE_INSTANCING_COLOR
    vTint = instanceColor;
#endif
    vFlags = flags;
#ifdef MAPPED
    // A unit box stood to a size: the texture is laid on at the world's scale, so a narrow chunk shows a part of the brick and not all of it squeezed in. Its side's v runs down from the top by the world height (MAPPED_ROWS of it a repeat of the texture). Each instance is shifted by its own skin (a flip, a drop, a slide across) so a run of squares isn't one picture repeated.
    float stood = length(placed[1].xyz);
    vFacesUp = step(0.5, normal.y);
    float along = abs(normal.x) > 0.5 ? length(placed[2].xyz) : length(placed[0].xyz);
    float across = vFacesUp > 0.5 ? length(placed[2].xyz) : along;
    float u = instanceSkin.x > 0.5 ? 1.0 - uv.x : uv.x;
    vUv = vFacesUp > 0.5 ? vec2(uv.x * length(placed[0].xyz), uv.y * across) + instanceSkin.z : vec2(u * along + instanceSkin.z, 1.0 - (1.0 - position.y) * stood / MAPPED_ROWS - instanceSkin.y / MAPPED_ROWS);
    vFoot = position.y * stood;
#endif
    vOpacity = 1.0;
#ifdef INSTANCE_OPACITY
    vOpacity = instanceOpacity;
#endif
    vec3 where = position;
#ifdef OUTLINE
    where += normal * OUTLINE;
#endif
    gl_Position = projectionMatrix * viewMatrix * placed * vec4(where, 1.0);
#ifdef BEHIND
    gl_Position.z -= BEHIND * abs(projectionMatrix[2][2]) * gl_Position.w;
#endif
}`;

const fragmentShader = /* glsl */ `
uniform vec3 light;
uniform vec3 halfway;
uniform float opacity;
#ifdef MAPPED
uniform sampler2D sideMap;
uniform sampler2D topMap;
varying vec2 vUv;
varying float vFacesUp;
varying float vFoot;
#endif
varying float vOpacity;
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vFlags;
varying vec3 vTint;
void main() {
    vec3 n = normalize(vNormal);
    vec3 base = vColour;
#ifdef MAPPED
    base *= vFacesUp > 0.5 ? texture2D(topMap, vUv).rgb : texture2D(sideMap, vUv).rgb * mix(0.72, 1.0, smoothstep(0.0, 0.14, vFoot));
#endif
    if (vFlags.x > 0.5) base *= vTint;
    vec3 shaded = base;
    if (vFlags.y < 0.5) {
        float ambient = 0.42 + 0.16 * n.y;
        float diffuse = max(0.0, dot(n, light));
        float highlight = vFlags.z * pow(max(0.0, dot(n, halfway)), 24.0);
        shaded = min(vec3(1.0), base * (ambient + 0.72 * diffuse) + highlight);
    }
#ifdef OUTLINE
    shaded = OUTLINE_SHADE;
#endif
    gl_FragColor = vec4(shaded, opacity * vOpacity);
}`;

/** How a solid is drawn, beyond opaque and lit. */
export interface SolidOptions {
    /** How much of it is there, 0–1. */
    opacity?: number;
    /** Each instance fades by its own `instanceOpacity` attribute on the geometry, on top of `opacity`: blended and not written to the depth buffer. */
    perInstance?: boolean;
    /** Drawn only where something already drawn is nearer — the faint figure a wall hides — and so drawn before the figures that might hide it, after the terrain that does. */
    behind?: boolean;
    /** Blended even at full opacity, but still written to the depth buffer: whole solids fading, like cover blasted away. */
    translucent?: boolean;
    /** Only the solid's outline: its back faces, pushed out `OUTLINE_WIDTH` and dark. */
    outline?: boolean;
    /**
     * Coloured by textures as well as by each vertex's colour (multiplied): a
     * unit box's sides by `side`, which repeats every `rows` world units up, and
     * its top by `top`, both laid on at the world's scale. The geometry needs its
     * `uv`, and each instance an `instanceSkin` (flip, drop and slide).
     */
    mapped?: { side: Texture; top: Texture; rows: number };
}

/**
 * A material for solids drawn this way. Its light follows the camera
 * (`lightSolids`). Geometry needs a `color` and a `flags` attribute: a plain
 * solid gets one colour and zero flags (`coloured`, terrain3d.ts).
 */
export function solidMaterial({ opacity = 1, perInstance = false, behind = false, translucent = false, outline = false, mapped }: SolidOptions = {}): ShaderMaterial {
    const blended = opacity < 1 || perInstance || translucent;
    return new ShaderMaterial({
        vertexShader,
        fragmentShader,
        vertexColors: true,
        defines: {
            ...(perInstance && { INSTANCE_OPACITY: "" }),
            ...(behind && { BEHIND: BEHIND_BIAS.toFixed(3) }),
            ...(mapped && { MAPPED: "", MAPPED_ROWS: mapped.rows.toFixed(4) }),
            ...(outline && { OUTLINE: OUTLINE_WIDTH.toFixed(4), OUTLINE_SHADE: OUTLINE_COLOUR }),
        },
        side: outline ? BackSide : FrontSide,
        transparent: blended && !behind,
        // Blended by hand, so it stays among the opaque draws and its place in them is its render order's.
        ...(behind && { blending: CustomBlending, blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, depthFunc: GreaterDepth }),
        depthWrite: !perInstance && !behind,
        uniforms: {
            light: { value: new Vector3(0, 1, 0) },
            halfway: { value: new Vector3(0, 1, 0) },
            opacity: { value: opacity },
            ...(mapped && { sideMap: { value: mapped.side }, topMap: { value: mapped.top } }),
        },
    });
}

/** Turns the light of every material drawn this way to the camera's. */
export function lightSolids(materials: readonly ShaderMaterial[], { light, halfway }: { light: Vec3; halfway: Vec3 }): void {
    for (const material of materials) {
        (material.uniforms.light.value as Vector3).set(...light);
        (material.uniforms.halfway.value as Vector3).set(...halfway);
    }
}
