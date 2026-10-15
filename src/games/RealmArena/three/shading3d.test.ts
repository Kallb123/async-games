import { Color } from "three";
import { describe, expect, it } from "vitest";
import { overlaid, type ShadingLayer } from "./shading3d";

const paint = (colour: Color, alpha: number, on: number[] = [0]): ShadingLayer => square => on.includes(square) ? { colour, alpha } : null;
const RED = new Color(1, 0, 0), BLUE = new Color(0, 0, 1);

describe("overlaid", () => {
    it("is nothing where no layer paints", () => {
        expect(overlaid([], 0)).toBeNull();
        expect(overlaid([paint(RED, 0.5)], 3)).toBeNull();
        expect(overlaid([paint(RED, 0)], 0)).toBeNull();
    });

    it("is a lone layer as it is", () => {
        const shade = overlaid([paint(RED, 0.4)], 0)!;
        expect(shade.alpha).toBeCloseTo(0.4);
        expect(shade.colour.toArray()).toEqual([1, 0, 0]);
    });

    it("lays each layer over the ones before it", () => {
        const shade = overlaid([paint(RED, 0.5), paint(BLUE, 0.5)], 0)!;
        // The blue is half of what is seen of the colour, the red a quarter, and a quarter of nothing.
        expect(shade.alpha).toBeCloseTo(0.75);
        expect(shade.colour.r).toBeCloseTo(1 / 3);
        expect(shade.colour.b).toBeCloseTo(2 / 3);
        const other = overlaid([paint(BLUE, 0.5), paint(RED, 0.5)], 0)!;
        expect(other.colour.r).toBeCloseTo(2 / 3);
    });

    it("lets a solid layer cover whatever is under it", () => {
        const shade = overlaid([paint(RED, 0.3), paint(BLUE, 1)], 0)!;
        expect(shade.alpha).toBeCloseTo(1);
        expect(shade.colour.toArray()).toEqual([0, 0, 1]);
    });

    it("only paints the squares a layer paints", () => {
        const layers = [paint(RED, 0.5, [1, 2]), paint(BLUE, 0.5, [2])];
        expect(overlaid(layers, 1)!.colour.toArray()).toEqual([1, 0, 0]);
        expect(overlaid(layers, 2)!.alpha).toBeCloseTo(0.75);
    });
});
