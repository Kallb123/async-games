// A plain material made to fade each instance of an `InstancedMesh` by its own
// opacity: the HP bar over a downed character fading with it (board3d.ts). The
// opacities are an `instanceOpacity` attribute of the geometry, one float an
// instance, multiplied into the material's own opacity.

import { DynamicDrawUsage, InstancedBufferAttribute, type BufferGeometry, type MeshBasicMaterial } from "three";

/** Gives `geometry` an opacity for each of `count` instances, all of them full to begin with. */
export function instanceOpacities(geometry: BufferGeometry, count: number): InstancedBufferAttribute {
    const attribute = new InstancedBufferAttribute(new Float32Array(count).fill(1), 1).setUsage(DynamicDrawUsage);
    geometry.setAttribute("instanceOpacity", attribute);
    return attribute;
}

/** `material`, fading each instance by its geometry's `instanceOpacities`. It must be `transparent`. */
export function fadedByInstance<T extends MeshBasicMaterial>(material: T): T {
    material.onBeforeCompile = shader => {
        shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;");
        shader.fragmentShader = shader.fragmentShader
            .replace("#include <common>", "#include <common>\nvarying float vInstanceOpacity;")
            .replace("#include <color_fragment>", "#include <color_fragment>\ndiffuseColor.a *= vInstanceOpacity;");
    };
    return material;
}
