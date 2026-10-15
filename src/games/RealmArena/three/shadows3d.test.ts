import { describe, expect, it } from "vitest";
import { SHADOW_RADIUS } from "@/games/RealmArena/ui";
import { ISO_HALF_HEIGHT, ISO_HALF_WIDTH } from "@/utils/ui/isometric";
import { BOARD_UNIT } from "./billboards";
import { azimuthOf, cameraBasis, onScreen, type Vec3 } from "./iso3d";
import { shadowBox, shadowRadius } from "./shadows3d";

describe("the shadow on the ground", () => {
    it("is the isometric board's ellipse once the camera foreshortens its circle", () => {
        // A circle on the ground of the shadow's radius, seen from the camera, at every quarter turn.
        for (const turn of [0, 1, 2, 3]) {
            const basis = cameraBasis(azimuthOf(turn));
            const seen = Array.from({ length: 360 }, (_, degrees): { x: number; y: number } => {
                const angle = degrees * Math.PI / 180, round = shadowRadius * BOARD_UNIT;
                const point: Vec3 = [round * Math.cos(angle), 0, round * Math.sin(angle)];
                return onScreen(basis, point);
            });
            expect(Math.max(...seen.map(({ x }) => x)) / BOARD_UNIT).toBeCloseTo(ISO_HALF_WIDTH * SHADOW_RADIUS, 2);
            expect(Math.max(...seen.map(({ y }) => y)) / BOARD_UNIT).toBeCloseTo(ISO_HALF_HEIGHT * SHADOW_RADIUS, 2);
        }
    });

    it("is drawn in a box that holds its diameter and its soft edge, and stays inside its square", () => {
        expect(shadowBox).toBeGreaterThan(2 * shadowRadius);
        // A square's side is a world unit: the box never reaches the next square's.
        expect(shadowBox * BOARD_UNIT).toBeLessThan(1);
    });
});
