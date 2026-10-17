// What `npm run ra-characters` serves the 3D board as Realm Arena's character
// models (`CHARACTER_MODELS_HREF`, src/games/RealmArena/art.ts): the masters in
// art-masters/realmarena/characters as data. The script writes it and a test
// (src/games/RealmArena/three/characterModels.test.ts) holds the file to it, so
// the served models never fall behind the masters.

/**
 * The models as the 3D board reads them, `{ materials, parts }`: a line a
 * character, so a change to one master is a change to one line, and every
 * number to a millionth of a square, so a sum like 0.9500000000000001 doesn't
 * churn the file.
 */
export function modelsJson(materials, parts) {
    const line = value => JSON.stringify(value, (_key, n) => typeof n === 'number' ? Math.round(n * 1e6) / 1e6 : n);
    const characters = Object.entries(parts).map(([id, list]) => `  ${JSON.stringify(id)}: ${line(list)}`);
    return `{\n "materials": ${line(materials)},\n "parts": {\n${characters.join(',\n')}\n }\n}\n`;
}
