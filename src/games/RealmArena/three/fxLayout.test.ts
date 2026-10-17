import { describe, expect, it } from "vitest";
import { BURST_ART, SMOKE_ART } from "@/games/RealmArena/art";
import { FIGURE_RADIUS, FIGURE_RISE, FLIGHT, HIT_LABEL_DROP, HIT_LANE_RISE, HIT_MARK_GAP, HIT_MARK_SIZE, HIT_VALUE_RISE, TUMBLE, fxPointsAt, type FlightFrame, type HitTextFrame } from "@/games/RealmArena/ui";
import { BODY, burstBox, flightPlace, HEAD, hitTextLayout, SMOKE_PUFF } from "./fxLayout";

const rest: HitTextFrame = { opacity: 1, rise: 0, scale: 1 };

describe("where a figure's body and head are", () => {
    it("hangs the head a disc's radius over the body, which is the disc's rise over the square's middle", () => {
        expect(BODY).toEqual({ x: 0, y: -FIGURE_RISE });
        expect(HEAD).toEqual({ x: 0, y: -FIGURE_RISE - FIGURE_RADIUS });
    });

    it("is the same place the isometric board puts them, from any ground", () => {
        expect(fxPointsAt({ x: 30, y: 12 })).toEqual({ ground: { x: 30, y: 12 }, body: { x: 30, y: 12 + BODY.y }, head: { x: 30, y: 12 + HEAD.y } });
    });
});

describe("hit text", () => {
    it("stands the number over the head, the label under the number, and no mark that isn't asked for", () => {
        const layout = hitTextLayout({ label: "Graze" }, rest, 10);
        expect(layout.value).toEqual({ x: 0, y: HEAD.y - HIT_VALUE_RISE });
        expect(layout.label).toEqual({ x: 0, y: HEAD.y - HIT_VALUE_RISE + HIT_LABEL_DROP });
        expect(layout.mark).toBeNull();
        expect(hitTextLayout({}, rest, 10).label).toBeNull();
    });

    it("puts the mark clear of the end of the number, by the gap and half the mark's own size", () => {
        const layout = hitTextLayout({ mark: "burning" }, rest, 11);
        expect(layout.mark).toEqual({ x: 11 / 2 + HIT_MARK_GAP + HIT_MARK_SIZE / 2, y: layout.value.y });
    });

    it("raises each lane by a lane's height, and the rise by the rise", () => {
        const base = hitTextLayout({}, rest, 5).value.y;
        expect(hitTextLayout({ lane: 2 }, rest, 5).value.y).toBeCloseTo(base - 2 * HIT_LANE_RISE);
        expect(hitTextLayout({}, { ...rest, rise: -6 }, 5).value.y).toBeCloseTo(base - 6);
    });

    it("pops the three pieces about the number's middle, and leaves the rise alone", () => {
        const popped = hitTextLayout({ label: "x", mark: "burning" }, { opacity: 1, rise: -2, scale: 1.25 }, 8);
        const plain = hitTextLayout({ label: "x", mark: "burning" }, { opacity: 1, rise: -2, scale: 1 }, 8);
        expect(popped.scale).toBe(1.25);
        expect(popped.value).toEqual(plain.value);
        expect(popped.label!.y - popped.value.y).toBeCloseTo(1.25 * HIT_LABEL_DROP);
        expect(popped.mark!.x).toBeCloseTo(1.25 * plain.mark!.x);
    });
});

describe("a missile", () => {
    const frame = (heading: number, scale = 1): FlightFrame => ({ point: { x: 40, y: 20 }, heading, opacity: 0.5, scale });

    it("points the way it flies with its front on the point, its middle half its size behind", () => {
        const { size } = FLIGHT.arrow;
        const east = flightPlace("arrow", frame(0), 100, { x: 0, y: 0 });
        expect(east.x).toBeCloseTo(40 - size / 2);
        expect(east.y).toBeCloseTo(20);
        expect(east.rotate).toBe(0);
        const down = flightPlace("arrow", frame(90), 100, { x: 0, y: 0 });
        expect(down.x).toBeCloseTo(40);
        expect(down.y).toBeCloseTo(20 - size / 2);
        expect(down.rotate).toBe(90);
    });

    it("is measured from the point it hangs from", () => {
        const place = flightPlace("bolt", frame(0), 0, { x: 30, y: 5 });
        expect(place.x).toBeCloseTo(10 - FLIGHT.bolt.size / 2);
        expect(place.y).toBeCloseTo(15);
    });

    it("keeps the size it is drawn at, as bright as it is seen, and grows its offset with it", () => {
        const place = flightPlace("bolt", frame(0, 2), 0, { x: 0, y: 0 });
        expect(place.size).toBe(FLIGHT.bolt.size);
        expect(place.scale).toBe(2);
        expect(place.opacity).toBe(0.5);
        expect(place.x).toBeCloseTo(40 - FLIGHT.bolt.size);
    });

    it("tumbles a flask about its middle, which is on the point, however it is heading", () => {
        const place = flightPlace("fireFlask", frame(33), 200, { x: 0, y: 0 });
        expect(place.x).toBe(40);
        expect(place.y).toBe(20);
        expect(place.rotate).toBeCloseTo(200 * TUMBLE);
    });
});

describe("a burst", () => {
    it("lies over the square it went off on, as wide as the square, its foot on the square's front corner", () => {
        const box = burstBox(BURST_ART.fire, 0);
        expect(box.width).toBe(20);
        expect(box.height).toBe(10);
        // The front corner is half a diamond below the middle; its foot is there.
        expect(box.y + box.height / 2).toBe(5);
    });

    it("spreads over a 3×3 three squares wide, its foot along the area's front corner", () => {
        const box = burstBox(BURST_ART.blast, 1);
        expect(box.width).toBe(60);
        expect(box.y + box.height / 2).toBe(15);
    });

    it("keeps the smoke pot's cloud square", () => {
        const box = burstBox(BURST_ART.smoke, 1);
        expect(box.height).toBe(box.width);
    });

    it("stands a puff of smoke a square across, its foot at the front of its square", () => {
        expect(SMOKE_ART.width).toBe(SMOKE_ART.height);
        expect(SMOKE_PUFF.y + SMOKE_PUFF.width / 2).toBe(5);
    });
});
