// A battlefield drawn inline, for tests: each argument is a row of `TERRAIN`
// letters, top first.

import { buildBattlefield, squareAt, type Battlefield, type Square } from "./terrain";

export function fieldOf(...rows: string[]): Battlefield {
    return buildBattlefield({ name: "Test field", rows, deployments: [], objectives: {} });
}

/** The square at a column and row, which the test knows is on the map. */
export function at(field: Battlefield, col: number, row: number): Square {
    const square = squareAt(field, col, row);
    if (square === undefined) throw new Error(`(${col}, ${row}) is off the test field`);
    return square;
}
