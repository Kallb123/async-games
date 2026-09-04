# Game themes

How a game gets more than one dressing: the same rules, costs and numbers,
played under different names and artwork. Dice Cities is the first game to use
it — the shipped Japanese-inspired region of rival towns, and the post-nuclear
"Rust & Bottlecaps" re-skin written up in
[`docs/games/dice-cities.md` §11](./games/dice-cities.md#11-appendix-alternative-theme--rust--bottlecaps).

## 1. What a theme is (and is not)

A theme is **presentation only**. It changes what a card is called, what its
rules text says, which folder its illustration comes from, and the handful of
nouns the screens print around it ("coins", "the bank", "landmarks"). It never
changes a cost, an activation number, an activation colour, an icon group, a
per-player limit, a bank total or a win condition. A Brahmin Pen is a Ranch
with a different picture on it.

That line is load-bearing, and it is enforced rather than trusted:
`src/games/DiceCities/themes.test.ts` walks every card in every theme and
asserts that only `title`, `text` and `art` differ from the base table in
`cards.ts`.

Two consequences worth stating:

- The **engine never reads a theme**. Rules resolution goes through the base
  `DiceCitiesCards` table exactly as it always did. The only server-side use of
  a theme is writing the history log, so a player who bought a Brahmin Pen does
  not find a Ranch in the log.
- A theme can therefore be **added, renamed or withdrawn** without touching a
  game already in progress. A stored id nobody recognises resolves to the
  game's default and the game plays on.

## 2. The pieces, and who owns what

| Piece | Where | What it does |
|---|---|---|
| `GameTheme`, `GAME_THEMES` | `src/utils/ui/gameThemes.ts` | The shared shape (id, name, description, glyph, optional note) and the registry keyed by game url slug. The **first entry of each list is that game's default**. |
| `themesForGame`, `themeIdFor` | same | The two questions generic code asks: what can this game be played as, and is this id still real? `themeIdFor` is the normaliser — see §4. |
| `ThemeSelect` | `src/components/ui/ThemeSelect.tsx` | The picker on a New Game screen. Game-agnostic: it asks the registry what the game offers, and renders **nothing** for a game with fewer than two themes, so it is safe to drop into any setup screen. |
| `theme` on the invitation | `src/utils/mongodb/InvitationData.ts` | A base-level field like `turnTimer`, so the lobby route carries it for every game with no per-game branch. |
| The game's own theme list | `src/games/<Game>/themes.ts` | What the theme *means* for that game — everything above this row is generic. |

The split is deliberate: the generic half knows a theme exists and can be
picked and stored; only the game knows that its theme renames a Wheat Field.

## 3. Where a theme is stored

On the invitation while the game is being set up, and then on **the game's own
`specificGameState`**, beside the other settings fixed at creation
(`enabledDocks`, `bankTotal`). Not on the base game document, because:

- the replay engine rebuilds a game from `commandHistory` against a starting
  state it constructs itself, and a recap that renamed every card because a
  theme was picked *after* the game started would be lying about what happened;
- the recap adapter and the `tip` box are handed a response-shaped
  `specificGameState` and nothing else, so this is the only place they can read
  it from;
- the client already receives it, so no new response field is needed beyond the
  game's own state DTO.

Dice Cities threads it through in these places:

- `buildInitialDiceCitiesState(userIdList, enabledDocks, bankTotal, theme)` —
  and `registerReplayAdapter` in `src/utils/games/replay.ts` passes the played
  game's theme back in, so a replay names cards the way the board did.
- `gameStateToModel` normalises it on the way out, so the client is never handed
  an id it cannot resolve.

## 4. Never a 400

`themeIdFor(gameUrl, requested)` is total: anything unrecognised — a missing
field, a typo, a withdrawn theme, a client sending an object where a string
belongs — resolves to the game's default. A theme is presentation, so no choice
of one can make a game unplayable, and there is nothing here worth failing a
request over. The two write paths (`/api/newgame/<game>` and `/api/lobby`) both
go through it before storing, and `diceCitiesTheme(id)` does the same on every
read.

The same totality covers games that predate themes: their stored state has no
`theme` at all, and reads back as the game as it shipped.

## 5. Adding a theme to a game

1. Write `src/games/<Game>/themes.ts` exporting the game's list, its default,
   and a `<game>Theme(id)` resolver that is total. Model it on Dice Cities':
   the theme carries a card table with *the same keys* as the base one, so a
   screen looks a card up in `theme.cards` exactly as it used to look it up in
   the base table — and resolve anything else per-card (its art path) into that
   table too, so only the screens that print the game's *nouns* need the theme
   itself.
2. Import the list into `GAME_THEMES` in `src/utils/ui/gameThemes.ts`. This
   one-liner is guarded — `src/games/gameRegistry.test.ts` fails CI for a game
   that ships a `themes.ts` and isn't in the registry.
3. Add `<ThemeSelect gameUrl="<slug>" value={theme} onChange={setTheme} />` to
   the game's setup screen, put `theme` on its invitation request, and
   normalise it in its `/api/newgame/<game>` route.
4. Store it in `CreateGame` and read it wherever the game names things: the
   board, the turn sheet, the guide, the recap adapter and the history lines
   its commands write.
5. Add a `theme` guard test asserting the theme changes nothing but names.

## 6. Art

Every theme keeps its card faces in its own folder under the game's art
directory (`/public/art/dicecities/<artDir>/`), and **every theme names its
files identically** — `wheat-field.png` is the Hydroponic Plot's picture in the
wasteland folder. So the card says which picture and the theme says which set.

The two are combined once, when the themed card table is built: `cards.ts` holds
the bare file name and `theme.cards[id].art` is the resolved path. That is why
no component that *draws* a card takes a theme — the card it is handed already
knows its own name, its own rules text and its own picture.

A theme whose art has not been drawn yet simply leaves `artDir` off and borrows
the default theme's folder; its `note` is what tells the host so on the setup
screen. Shipping the art later is two steps: drop the files in, and add
`artDir` to the theme. Nothing else changes.

Themes that cannot rely on art still get to look different: Dice Cities' board
gradient is driven by `--ag-dc-sky-1` / `--ag-dc-sky-2`, set per game from the
theme, so the wasteland sits under a dust-ochre sky rather than a blue one.

## 7. Known edges

- **Post-game stats** (`formatDiceCitiesResultStats`) are computed from the
  `GameResult` document, which does not carry the theme, so the result screen
  still says "Earned 12 coins". Fixing that means storing the theme on
  `GameResult` too, and is deliberately out of scope until a second themed game
  makes the shape worth settling.
- **App-wide vocabulary is not themed.** "Your turn", "End turn", the turn timer
  and the push copy stay as they are — they belong to the app, not the game, and
  a game that renamed half of them would read as two products at once. The
  wasteland's "scavenging run" therefore stays in the flavour text.
