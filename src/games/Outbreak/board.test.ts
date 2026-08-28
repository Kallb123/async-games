import { describe, expect, it } from "vitest";
import {
    ADJACENCY,
    CITIES,
    CITY_COUNT,
    DISEASE_COLORS,
    EPIDEMIC_CARD_ID,
    EVENT_CARDS,
    EVENT_CARD_IDS,
    cityIdsForColor,
    eventCardName,
    isAdjacent,
    isCityCardId,
    isEventCardId,
} from "./board";

describe("Outbreak board", () => {
    it("has 48 cities", () => {
        expect(CITY_COUNT).toBe(48);
        expect(CITIES).toHaveLength(48);
    });

    it("gives every colour exactly 12 cities, covering the board with no overlap", () => {
        const seen = new Set<number>();
        for (const color of DISEASE_COLORS) {
            const ids = cityIdsForColor(color);
            expect(ids).toHaveLength(12);
            ids.forEach(id => seen.add(id));
        }
        expect(seen.size).toBe(CITY_COUNT);
    });

    it("is symmetric: every edge appears in both directions", () => {
        for (let from = 0; from < CITY_COUNT; from++) {
            for (const to of ADJACENCY[from]) {
                expect(isAdjacent(to, from)).toBe(true);
            }
        }
    });

    it("has no self-loops and no duplicate edges", () => {
        for (let id = 0; id < CITY_COUNT; id++) {
            expect(ADJACENCY[id]).not.toContain(id);
            expect(new Set(ADJACENCY[id]).size).toBe(ADJACENCY[id].length);
        }
    });

    it("is fully connected — every city is reachable from every other city", () => {
        const visited = new Set<number>([0]);
        const queue = [0];
        while (queue.length > 0) {
            const current = queue.shift()!;
            for (const neighbor of ADJACENCY[current]) {
                if (!visited.has(neighbor)) {
                    visited.add(neighbor);
                    queue.push(neighbor);
                }
            }
        }
        expect(visited.size).toBe(CITY_COUNT);
    });
});

// ─── Event cards (§12, §21.6 step 10) ──────────────────────────────────────

describe("event cards", () => {
    it("names exactly the five of §12, each with a unique negative sentinel id", () => {
        expect(EVENT_CARDS).toHaveLength(5);
        expect(EVENT_CARDS.map(c => c.name).sort()).toEqual(
            ['Airlift', 'Forecast', 'Government Grant', 'One Quiet Night', 'Resilient Population'].sort(),
        );
        expect(new Set(EVENT_CARD_IDS).size).toBe(5);
        for (const id of EVENT_CARD_IDS) {
            expect(id).toBeLessThan(0);
            expect(id).not.toBe(EPIDEMIC_CARD_ID);
        }
    });

    it("isCityCardId and isEventCardId partition city ids from event/epidemic ids", () => {
        for (let id = 0; id < CITY_COUNT; id++) {
            expect(isCityCardId(id)).toBe(true);
            expect(isEventCardId(id)).toBe(false);
        }
        expect(isCityCardId(EPIDEMIC_CARD_ID)).toBe(false);
        expect(isEventCardId(EPIDEMIC_CARD_ID)).toBe(false);
        for (const id of EVENT_CARD_IDS) {
            expect(isCityCardId(id)).toBe(false);
            expect(isEventCardId(id)).toBe(true);
        }
    });

    it("eventCardName resolves every event card id", () => {
        for (const card of EVENT_CARDS) {
            expect(eventCardName(card.id)).toBe(card.name);
        }
        expect(eventCardName(EPIDEMIC_CARD_ID)).toBe('Unknown event');
    });
});
