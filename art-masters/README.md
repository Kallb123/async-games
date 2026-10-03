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

## Realm Arena's effect and item marks

`realmarena/effects.svg` and `realmarena/items.svg` are drawn as code rather
than exported, so their masters are the SVGs themselves: the served
`public/art/realmarena/effects.png` and `items.png` are rendered from them,
never saved by hand. After changing either, run `npm run ra-marks` (it renders
every SVG in `realmarena/`) and commit the PNGs it writes. The sheets are a few
KB, so `optimise-art` leaves them alone.
