# The share card's typeface

Bricolage Grotesque, the app's own `--ag-font`, in the two weights
`scripts/generate-icons.mjs` sets: 400 for a game's tagline, 800 for everything
else.

These are here so `npm run icons` draws the same cards on every machine. The
script used to ask fontconfig for a **system** install and skip the cards with a
warning when it found none — so a contributor adding a game got no share card,
usually without noticing, and the set in `public/icons/` drifted towards
"whoever last had the font installed". The script now points fontconfig at this
folder, so the only way to get the wrong type is to change what is in it.

## Where they came from

Google Fonts, v9, unsubsetted, exactly as served — no conversion and no
retouching, so these are byte-for-byte upstream and re-fetching them is how you
update them:

```
curl -A "Mozilla/4.0" \
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;800"
```

A user agent that predates woff2 is what makes that return plain `.ttf` URLs
rather than the subsetted woff2 a browser gets. Download the two it names as
`BricolageGrotesque-Regular.ttf` and `BricolageGrotesque-ExtraBold.ttf`.

Licensed under the OFL (`OFL.txt`), which permits redistributing them here as
long as that file travels with them.

## Not @fontsource, and not a subset

The obvious route — `@fontsource/bricolage-grotesque` out of npm — gives you
woff2 split by subset, and **none of its subsets carries `U+2192`**. Snakes &
Ladders' catalogue glyph is `1→100`, so on a subsetted build that arrow falls
back to whatever else the machine has and prints a thin, light arrow beside
type set in ExtraBold. It is a one-character regression on one card, which is
exactly the kind that survives review. The unsubsetted files above carry 527
glyphs and have it.

If you do swap the source, the check is `npm run icons` followed by
`git status`: every existing card must come back byte-identical. One that
doesn't is either this problem or a card whose game metadata changed.

## Why two files are one family

`OS/2.usWeightClass` is 400 and 800, and the ExtraBold carries name IDs 16/17
(`Bricolage Grotesque` + `ExtraBold`) on top of a RIBBI-legal name ID 1/2 pair.
That is what makes fontconfig read the two files as one family with two faces
rather than two unrelated families — and it matters, because a family with only
a 400 in it answers a request for weight 800 with a *synthesised* bold, which
is what the heavy display type on these cards is least able to survive.

Google Fonts ships its statics named that way already, which is the other
reason these are the upstream files rather than something rebuilt here.
