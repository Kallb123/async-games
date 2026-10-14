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

import { ShaderMaterial, Vector3 } from "three";
import type { Vec3 } from "./iso3d";

const vertexShader = /* glsl */ `
attribute vec3 flags;
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
    gl_Position = projectionMatrix * viewMatrix * placed * vec4(position, 1.0);
}`;

const fragmentShader = /* glsl */ `
uniform vec3 light;
uniform vec3 halfway;
uniform float opacity;
varying vec3 vColour;
varying vec3 vNormal;
varying vec3 vFlags;
varying vec3 vTint;
void main() {
    vec3 n = normalize(vNormal);
    vec3 base = vColour;
    if (vFlags.x > 0.5) base *= vTint;
    vec3 shaded = base;
    if (vFlags.y < 0.5) {
        float ambient = 0.42 + 0.16 * n.y;
        float diffuse = max(0.0, dot(n, light));
        float highlight = vFlags.z * pow(max(0.0, dot(n, halfway)), 24.0);
        shaded = min(vec3(1.0), base * (ambient + 0.72 * diffuse) + highlight);
    }
    gl_FragColor = vec4(shaded, opacity);
}`;

/**
 * A material for solids drawn this way. Its light follows the camera
 * (`lightSolids`). Geometry needs a `color` and a `flags` attribute: a plain
 * solid gets one colour and zero flags (`coloured`, terrain3d.ts).
 */
export function solidMaterial({ opacity = 1 }: { opacity?: number } = {}): ShaderMaterial {
    return new ShaderMaterial({
        vertexShader,
        fragmentShader,
        vertexColors: true,
        transparent: opacity < 1,
        uniforms: {
            light: { value: new Vector3(0, 1, 0) },
            halfway: { value: new Vector3(0, 1, 0) },
            opacity: { value: opacity },
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
