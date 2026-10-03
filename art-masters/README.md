# Art masters

The untouched original of every picture the app draws — one file per piece of
art, exactly as it came out of whatever drew it.

**Nothing here is served.** That is the point of the folder. Everything under
`public/` is fetchable by a browser and shipped in the deploy, so keeping ~59MB
of originals there meant paying for files no page ever asks for. These sit
outside it instead, tracked so a face can be redrawn or re-encoded from source
at any time, and ignored by the Docker build.

## Layout

It mirrors `public/art` exactly, so a master is found by swapping one path
segment and nothing has to keep a list:

```
art-masters/dicecities/wasteland/bakery.png   # the original export
public/art/dicecities/wasteland/bakery.png    # what the app draws
```

## Adding art

Save the export here **and** under the matching path in `public/art`, then run
`npm run optimise-art`. That quantises the served copy — about two thirds off
the file at the same resolution, for nothing an eye can find — and never walks
this folder, so the original stays as it arrived.

## Kingdom Builder's world map

`kingdombuilder/v2` is the one folder that doesn't mirror `public/art` file for
file. Its ~500 tiles are served as a single sheet, shrunk to the size the map
is drawn at, and its map badges as one small PNG per scene, rendered from the
badge kit's own generator (`badges/map-badges-2d.js`). After changing anything
in it, run `npm run kb-atlas` (not `optimise-art`) and commit the
`public/art/kingdombuilder/v2/` files and `src/games/KingdomBuilder/terrainAtlas.json`
it writes.

## Realm Arena's effect and item marks, and scorched ground

`realmarena/effects.svg`, `realmarena/items.svg` and `realmarena/scorched.svg`
are drawn as code rather than exported, so their masters are the SVGs
themselves: the served `public/art/realmarena/effects.png`, `items.png` and
`scorched.png` are rendered from them, never saved by hand. After changing any
of them, run `npm run ra-marks` (it renders every SVG in `realmarena/`) and
commit the PNGs it writes. The sheets are a few KB, so `optimise-art` leaves
them alone.

## Realm Arena's characters

`realmarena/characters/` holds a master per character, named by its id in
`src/games/RealmArena/characters.ts`: a model built in code out of boxes,
balls, capsules and tapered cylinders, dressed from the shared body and palette
in `kit.mjs`. `npm run ra-characters` draws every one of them from all eight
directions a figure can face, standing and fallen (`POSES` in `kit.mjs`), in
the battlefield's own isometric projection (`scripts/lib/isoRender.mjs`), into
`public/art/realmarena/characters.png` (a row per character per pose, a column
per facing — `CHARACTER_ART` in `src/games/RealmArena/art.ts` is the layout)
and `characters-team.png` (just the owner's colour, grey and shaded, which the
board tints per seat and lays over the figure). Commit both after changing a
master. While working on one, `npm run ra-characters -- --only knight
--preview /tmp/knight.png` draws just that character, tinted and standing on
its square, without touching the sheets.
