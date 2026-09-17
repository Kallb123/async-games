# Interactive game tutorials

**Status: plan, not yet built.** This is the design for the feature and the
order to build it in. Nothing described here exists yet; the pieces it reuses
do, and are linked as they come up.

A tutorial is a guided tour of a game's real screen: it points at a thing,
says what the thing is, and moves on — and where the thing is something the
player does, it waits for them to do it. It is the thing a player wants
instead of reading a wall of text, and it sits beside the existing
[game guide](../src/utils/ui/gameGuides.ts) rather than replacing it: same
per-account "show it once, then keep it in the ⋮ menu" contract, same
data-only authoring, one file per game.

## 1. What it is, and what it isn't

| | Game guide (today) | Interactive tutorial (this) |
|---|---|---|
| Shape | A modal: title + five headed sections | A scrim over the live screen: one highlighted element + one short message at a time |
| Content | Prose the player reads up front | Steps tied to things actually on their board |
| Length | Read in a minute | Six to ten steps, tapped through |
| Asks anything of the player? | No | Optionally: a step can wait for them to roll, build, end their turn |
| When | Auto once per account per game, then ⋮ | Auto once per account per game **in place of** the guide's auto-show, then ⋮ |
| Authoring | `guide.ts` beside the game's `meta.ts` | `tutorial.ts` beside it, same idiom |
| Still there afterwards? | Yes — the ⋮ row stays, as the reference text | Yes — the ⋮ row is the way back in |

Three things it deliberately is **not**:

- **Not a sandbox.** The tour runs on the player's own live match, against the
  real state, with the real board. There is no second, fake game state per
  game to build and keep in step with the rules. That is the single biggest
  cost decision in this plan and §9 explains what it costs us in exchange.
- **Not a wizard the player is trapped in.** Every step has a visible way out,
  the scrim never blocks the board (§6), and closing it is one tap. A tour
  over somebody's real game has to be abandonable at any moment, including
  mid-step.
- **Not a replacement for the guide's *content*.** "Your turn" as five
  sentences is still the right thing to be able to re-read. The tutorial
  replaces the guide's *auto-show*, not the guide.

## 2. What the player sees

```
  ┌──────────────────────────────┐
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │   ← scrim: everything dimmed…
  │ ░┌──────────────────────┐░░░ │
  │ ░│  Alice 3/6   You 2/6 │░░░ │   ← …except the spotlit element,
  │ ░└──────────────────────┘░░░ │      ringed and gently pulsing
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
  ├──────────────────────────────┤
  │ The scoreboard          2/8  │   ← the card: title, body, progress
  │ How close everyone is to     │
  │ winning. Tap it to open it   │
  │ up for the detail.           │
  │  Skip tour      ‹ Back  Next›│
  └──────────────────────────────┘
```

Two kinds of step:

- **A narration step** — the common case. Spotlight, message, `Next`.
- **A do-it step** — the spotlight lands on a control and the card says what
  to do ("Tap **Roll the dice**"). `Next` is replaced by that hint, and the
  step advances **itself** the moment the game state says it happened. If the
  player would rather not, `Skip` steps over it.

A step with no anchor at all is the third, degenerate case: a centred card
with no spotlight, for the opening "This is your first game of Dice Cities —
here's the two-minute tour" and the closing "That's it. The guide is under ⋮
whenever you want it."

## 3. The pieces, and who owns what

Same split as themes and guides: the generic half knows a tutorial exists, can
run one and can remember it was run; only the game knows what its steps say.

| Piece | Where | What it does |
|---|---|---|
| `GameTutorial`, `TutorialStep` | `src/utils/ui/gameTutorials.ts` | The shared shapes, plus `GAME_TUTORIALS` keyed by url slug and `hasTutorial(url)`. One import + one line per game, exactly like `GAME_GUIDES`. |
| `TOUR_ANCHORS`, `anchorSelector` | `src/utils/ui/tourAnchors.ts` | The named anchors for shared chrome, and the one function that turns an anchor name into a selector (§4). |
| `useTutorialRun` | `src/utils/hooks/useTutorialRun.ts` | The run: which steps apply, which one we're on, where its element is on screen, and the self-advance watch. |
| `GameTutorialOverlay` | `src/components/ui/GameTutorialOverlay.tsx` | The scrim, the ring and the card. Presentational — every decision comes from the hook. |
| `useGameIntro` | `src/utils/hooks/useGameIntro.ts` | Today's `useGameGuide`, grown to cover both first-runs (§7). Replaces it. |
| `.ag-tour-*` | `src/app/ag-theme.css` | Scrim, ring, card. Reuses `ag-pulse`, the `ag-btn` family and the `ag-hint` type scale — there is no new visual language here. |
| The game's own steps | `src/games/<Game>/tutorial.ts` | What this game's tour says, and which signals it leans on. |
| The signals | the game's board page | The handful of booleans a do-it step waits on (§5). The page already computes all of them for its own subtitle. |

## 4. Anchoring: named anchors, and `data-tour` for a game's own bits

A step names its element with a single string. `anchorSelector` resolves it in
one step, and that is the whole mechanism:

```ts
// src/utils/ui/tourAnchors.ts
export const TOUR_ANCHORS = {
    scoreboard: '.ag-scorestrip',
    board:      '.ag-board-area',
    boardFrame: '.ag-board-frame',
    turnSheet:  '.ag-actionsheet',
    buildList:  '.ag-build-list',
    myHand:     '.ag-hand--me',
    topbar:     '.ag-game-topbar',
    menu:       '.ag-gom',
    chat:       '[aria-label="Chat"]',
    zoom:       '.ag-board-tag--action',
} as const;

export type TourAnchor = keyof typeof TOUR_ANCHORS;

/** A step's anchor as a selector: a shared name, or a game's own data-tour. */
export function anchorSelector(anchor: string): string {
    return TOUR_ANCHORS[anchor as TourAnchor] ?? `[data-tour="${anchor}"]`;
}
```

Why this way round:

- **Shared chrome costs nothing to anchor.** Every one of those selectors is a
  class the design system already puts on the element — the scoreboard, the
  board area, the turn sheet, the viewer's own hand, the kebab menu. Ten games
  get ten anchors for free, and no shared component grows a prop or an
  attribute for the tutorial's sake.
- **A game's own bits are explicit.** "The market", "the landmark track", "the
  infection rate" are not shared concepts and should not be reached by a
  private class name. They get `data-tour="dc-market"` on markup that already
  exists — one attribute, no new element, no new prop — and the anchor name is
  the attribute's value.
- **One rule to remember:** if it's in the table, use the name; if it's yours,
  add the attribute. Nobody has to know the CSS.
- A raw selector in a step is deliberately *not* supported. It would work, and
  it would leave us with steps pointing at `.ag-dc-market-grid > div:nth-child(2)`
  inside a year.

The `data-tour` values are namespaced by the game's initials (`dc-`, `ob-`,
`tt-`) so a grep for one game's anchors finds exactly them, and a test (§11)
holds every anchor honest.

## 5. Signals: how a do-it step knows

A do-it step needs to read the game — but the tutorial content must stay
data-only, and nothing in `src/utils/ui/` may learn what a Dice Cities roll is.
So the step doesn't read the state; it names a **signal**, and the board page
supplies the booleans:

```ts
// src/games/DiceCities/tutorial.ts
export type DiceCitiesSignal = 'myTurn' | 'hasRolled' | 'canBuild';

export const tutorial: GameTutorial<DiceCitiesSignal> = {
    title: 'Dice Cities tour',
    steps: [
        { title: 'Welcome to your city', body: 'Six landmarks, first to build all six wins. Two minutes and you\'ll have it.' },
        { anchor: 'scoreboard', title: 'The scoreboard', body: 'How close everyone is to winning. Tap it open for the detail.' },
        { anchor: 'board',      title: 'Your city', body: 'Every card you have built, and what each one pays out.' },
        { anchor: 'dc-roll',    title: 'Your roll', body: 'Everything starts here.', when: 'myTurn', unless: 'hasRolled',
          advanceOn: 'hasRolled', hint: 'Tap Roll the dice' },
        { anchor: 'dc-market',  title: 'The market', body: 'Spend the coins the roll paid you on one card a turn.', when: 'canBuild' },
        { anchor: 'menu',       title: 'Anything else', body: 'The full rules, the match history and this tour again all live here.' },
    ],
};
```

```tsx
// src/app/games/dicecities/[gameid]/page.tsx — the booleans already exist above
<GameTutorialOverlay
    tutorial={tutorial}
    signals={{ myTurn: isMyTurn, hasRolled, canBuild: isMyTurn && hasRolled }}
    onClose={intro.close}
/>
```

The generic type is what makes this safe rather than stringly-typed:
`GameTutorial<S>` constrains `when`, `unless` and `advanceOn` to `S`, and
`GameTutorialOverlay` takes `signals: Record<S, boolean>` — so a step naming a
signal the page doesn't pass, or a page passing one no step uses, is a
**type error**, not a step that silently never fires. `GAME_TUTORIALS` holds
them as `GameTutorial<string>`, which only ever answers "does this game have
one"; the page imports its own typed tutorial directly, the way it already
imports `buildDiceCitiesGuide`.

Three fields, three jobs, and they compose:

- `when` — include the step only while the signal is true. A step about the
  market is pointless on an opponent's turn.
- `unless` — drop the step when the signal is true. "Tap Roll" is wrong if the
  player already rolled before the tour caught up.
- `advanceOn` — the step waits, then advances itself when the signal flips.

`when`/`unless` are evaluated **once, when the run starts** — the step list for
this run is fixed at that moment. Re-filtering live would renumber the steps
under the player's finger and could pull the step they are reading out from
under them. `advanceOn` is the only thing watched continuously, and only for
the current step.

A themed game builds its tutorial from the theme the same way it builds its
guide: `buildDiceCitiesTutorial(theme)` instead of a const, so a tour of the
post-nuclear re-skin says "bottlecaps" (see [game-themes.md](./game-themes.md)).

## 6. The overlay: spotlight, card, and keeping it in view

### The spotlight is one element

```css
.ag-tour-spot {
    position: fixed;
    border-radius: 12px;
    pointer-events: none;                       /* the board stays usable */
    box-shadow: 0 0 0 100vmax var(--ag-tour-scrim),  /* dims everything else */
                0 0 0 3px var(--ag-terracotta);      /* the ring */
    transition: top .28s ease, left .28s ease, width .28s ease, height .28s ease;
}
```

One absolutely-positioned box, sized to the anchor's
`getBoundingClientRect()`, with a scrim-coloured shadow spread wide enough to
cover any viewport. That one declaration gives us the dim, the hole and the
ring, it animates from step to step for free, and — because the element covers
only the hole and takes no pointer events — **nothing on the page is ever
blocked**. A do-it step needs the highlighted control to be tappable; every
other step needs the player to be able to bail out to the board. Both fall out
of the same element.

The tradeoff, stated plainly: a stray tap during a narration step lands on the
board and can submit a real command. We accept it (it is the player's own
game, and a tour they can't escape is worse), and if playtesting says
otherwise the fix is known — swap the one box for four dim panels around the
rect plus a transparent blocker over the hole on narration steps only, which
keeps the same API and touches only this component.

The ring reuses `ag-pulse` (`--ag-pulse-min`, as the map highlight ring and the
score pill already do), so it honours `prefers-reduced-motion` through the same
`@media` block the rest of the app's pulses sit in, and the position transition
is dropped there too.

### The card is a bottom sheet, on both breakpoints

No popover, no arrow, no collision solving. The message sits in a fixed card
along the bottom of the `.ag-app` column — the place the design system already
puts `BottomBanner` and `PanelToggleRow`, reachable by a thumb on a phone and
centred under the column on a desktop. This is where tour libraries spend most
of their code, and we get to not have the problem: the spotlight says *where*,
the card says *what*, and they don't have to be adjacent to be read together.

The card carries: the step title, the body, `2/8` progress, `Skip tour` on the
left, and `‹ Back` / `Next ›` on the right (or the do-it hint in place of
`Next`). On the last step `Next` becomes `Done`.

### Getting the element into view

On every step change, in this order:

1. **Wait for the element.** `document.querySelector(anchorSelector(step.anchor))`,
   retried on a couple of animation frames — a panel that just opened, or a
   board that just finished laying out, is not there on the first tick.
2. **Scroll it into view.** `el.scrollIntoView({ block: 'center', behavior })`,
   `behavior: 'auto'` under reduced motion, exactly as
   [`useScrollIntoViewOnOpen`](../src/utils/hooks/useScrollIntoViewOnOpen.ts)
   already does. This walks *every* scrollable ancestor, which is what makes a
   board node inside `BoardZoom`'s `.ag-board-scroll` pane work at all.
3. **Keep the card off it.** `block: 'center'` can still leave a tall anchor
   under the card, so after the scroll settles we measure again and nudge by
   the overlap if the rect intrudes into the card's band.
4. **Track it.** A `ResizeObserver` on the anchor plus `scroll`/`resize`
   listeners (passive, coalesced through one `requestAnimationFrame`) re-measure
   the rect, so the spotlight follows the element when the player scrolls, the
   scoreboard expands, or the phone rotates.

Anchors on a zoomed board are the one place this gets thin: at `fit` width, a
map node can be a few pixels across, and the spotlight will honestly point at a
few pixels. **v1 rule: board steps anchor the frame or a labelled region, not an
individual node.** Per-node anchoring — which wants a `BoardZoom` that can be
asked to zoom-and-centre on a node — is listed in §12 as a follow-up, not
smuggled into this build.

## 7. First run, and getting back in

The rule the answer to "how do these two relate" settles: **a game with a
tutorial never auto-shows its guide.** One welcome per game, and the tutorial
is the better one. The guide keeps its ⋮ row as the reference text.

That makes the existing first-run machinery *almost* right, and it should grow
rather than be copied:

- **The route stays.** `/api/gameguides` keeps its URL (a rename would only
  strand the POSTs of clients running cached JS, for no gain) and grows a
  second list: `GET` answers `{ seen, seenTutorials }`, and `POST { game, kind }`
  writes to the list `kind` names, defaulting to `'guide'`. Its allowlist check
  becomes "in `GAME_GUIDES` or in `GAME_TUTORIALS`", by kind.
- **The metadata grows a key.** `privateMetadata.seenGameTutorials`, beside
  `seenGameGuides`. `src/utils/users/gameGuideProgress.ts` already has the three
  functions this needs (`getSeen`, `hasSeen`, `withSeen`); they take the key as
  an argument instead of hard-coding it. Per-account and not per-browser, for
  the reason it always was: the welcome shouldn't repeat on a new device.
- **The hook grows a second answer.** `useGameGuide` becomes `useGameIntro`,
  with the same single fetch, the same `loaded` flag (which
  [`RoleIntroPopup`](../src/components/ui/RoleIntroPopup.tsx) still needs to
  wait on, and which now waits for whichever intro has the floor):

```ts
const intro = useGameIntro('dicecities', { hasTutorial: true });
// → { tutorialOpen, guideOpen, loaded, startTutorial, openGuide, close }
```

  `tutorialOpen` is true when the account hasn't seen this game's tutorial (or
  the player picked it from ⋮); `guideOpen` is true when they open it from ⋮,
  or — for a game with no tutorial — on their first match, exactly as today.
  Never both: the tutorial wins. Closing marks only the list that was auto-shown
  (opening one from ⋮ is a look, not a first visit — unchanged).

**A player who already saw the guide still gets the tutorial once**, because
the lists are separate. That is the intent: the tutorial is new and better, and
one tour is a fair thing to spend an existing player's attention on.

The ⋮ menu for a game with a tutorial gets two rows, tutorial first:

```
🎓  Take the tutorial
📖  Game guide
```

## 8. Restarting, and finishing

- `Skip tour` and `Done` are the same close: mark seen, unmount. A tour that
  was skipped is not offered again automatically — the ⋮ row is the way back.
- Re-running from ⋮ starts from step 1, refiltered against the state the game
  is in *now*. A player halfway through a match gets the steps that make sense
  halfway through a match, which is more useful than the opening ones.
- The tour does not survive a reload or a navigation, and shouldn't: the
  interesting state (which step) is worth nothing once the screen is gone.

## 9. When a step can't run

Everything below is a degradation, never an error, and never a dead screen.
This is the part a tour over live state has to get right, and the part a
sandbox would have let us skip.

| Situation | What happens |
|---|---|
| The anchor never appears (a panel the player closed, a game state the step assumed) | After the retry frames, the step is **skipped** silently and the run moves to the next one. A tour with a hole in it beats a tour stuck on a missing pill. |
| Every step's anchor is missing | The run ends immediately and marks itself seen. No empty scrim. |
| The step's element is bigger than the viewport | The spotlight is clamped to the viewport with a margin, so the ring stays visible rather than sitting entirely off-screen. |
| A do-it step's signal is never satisfied (the player's turn ends, an opponent moves) | The step keeps its hint but its `Skip` is always there; and if `when` stops holding, the hint is replaced by `Next ›` so the run can't trap the player. |
| The game is complete, abandoned, or being reviewed turn-by-turn | The tutorial doesn't auto-run at all. A finished board is the wrong thing to be toured, and the recap/review screens have their own chrome. |
| The state fetch hasn't landed | `loaded` gates it, as the guide's already does — nothing flashes open and shut. |
| A step names a signal the page doesn't pass | A type error at build time (§5). |
| The account's seen-list write fails | Logged and swallowed, as the guide's already is. The worst case is a tour offered twice. |

## 10. Accessibility

- The card is a `role="dialog"` with `aria-modal="false"` — it is deliberately
  not modal, because the page underneath stays live and usable.
- Each step change moves focus to the card's heading, and announces the step
  through the card being an `aria-live="polite"` region, so a screen reader
  reads the new message without the player hunting for it.
- `Escape` closes the tour; `useCloseRequest` gives us the Android back
  gesture for free, the same way [`InfoModal`](../src/components/ui/InfoModal.tsx)
  has it.
- `Next`/`Back`/`Skip` are real buttons in DOM order, so the whole tour is
  keyboard-operable with no arrow-key handling of our own.
- The spotlight is decorative: it is `aria-hidden`, and the card's text names
  the thing it points at in words ("the scoreboard", "Roll the dice") rather
  than relying on the ring. A tour that only works if you can see the
  highlight isn't a tour for everybody.
- Reduced motion: no pulse, no position transition, instant scroll (§6).

## 11. Tests

Three, all cheap, in the spirit of the theme guard test:

1. **`src/utils/ui/gameTutorials.test.ts` — every anchor resolves.** For each
   step of each registered tutorial, the anchor is either a `TOUR_ANCHORS` key
   or appears as `data-tour="<name>"` somewhere under `src/`. A grep over the
   tree, which is exactly how a renamed market would otherwise rot a step
   silently.
2. **Same file — every `TOUR_ANCHORS` selector still exists.** Each named
   selector's class appears in `ag-theme.css` (or, for the `[aria-label]` one,
   in a component). Catches the rename from the other direction.
3. **`useTutorialRun.test.ts` — the filtering and the self-advance.**
   `when`/`unless` include and drop steps as specified; a step with `advanceOn`
   advances when its signal flips and not before; a run with no applicable
   steps reports itself done. Pure logic, no DOM.

Plus the usual gates before committing: `npm run build`, `npx tsc --noEmit`,
`npm run lint` (`--max-warnings 0`), and `npm test` because the registry is
touched.

## 12. Build order

Each phase is shippable on its own; the first two are the whole feature.

**Phase 1 — the machinery, and one game.** `gameTutorials.ts`, `tourAnchors.ts`,
`useTutorialRun.ts`, `GameTutorialOverlay.tsx`, the `.ag-tour-*` block,
`useGameGuide` → `useGameIntro` (with its route and metadata growing the second
list), and Dice Cities' `tutorial.ts` wired into its board page. Dice Cities
first because it has a scoreboard, a board, a market, a themed vocabulary and a
do-it step (the roll) — if the design survives it, it survives.

**Phase 2 — the rest of the games that want one.** Settlements & Cities,
World Domination, Outbreak, Train Time, Fires Out!, Banned Islet. Each is one
`tutorial.ts`, one registry line, a couple of `data-tour` attributes and two
lines on the board page. No shared code should need to change; if it does,
that's the signal the shared piece is wrong, not that the game is special.

**Phase 3 — the seams worth polishing once it's real.** A "Take the tutorial"
row on the game's setup screen and in `GameLibrary`, so a player can tour a
game before committing to a match. Per-node board anchoring, via a `BoardZoom`
that can be asked to centre on a node. Neither is needed to ship.

Files touched, all told:

```
new     src/utils/ui/gameTutorials.ts
new     src/utils/ui/tourAnchors.ts
new     src/utils/ui/gameTutorials.test.ts
new     src/utils/hooks/useTutorialRun.ts
new     src/utils/hooks/useTutorialRun.test.ts
new     src/components/ui/GameTutorialOverlay.tsx
new     src/games/<Game>/tutorial.ts                (one per game)
rename  src/utils/hooks/useGameGuide.ts          → useGameIntro.ts
edit    src/utils/users/gameGuideProgress.ts       (key as an argument)
edit    src/app/api/gameguides/route.ts            (second list, kind)
edit    src/app/ag-theme.css                       (.ag-tour-* block)
edit    src/app/games/<game>/[gameid]/page.tsx     (one per game: hook, overlay, ⋮ row, data-tour)
edit    src/utils/ui/whatsNew.ts                   (one line, enhancements)
edit    AGENTS.md, docs/new-game.md                (a tutorial is part of adding a game)
```

## 13. Upkeep

- **One "What's new" line for the whole branch**, in *Enhancements*, however
  many games the branch tours: "Guided tutorials — a tour of the board on your
  first game, pointing at the thing it's talking about." Per-game tours added
  later don't each get a line.
- **AGENTS.md** gains a sentence beside the game-guide paragraph: most games
  also want a `tutorial.ts`, registered in `GAME_TUTORIALS` and rendered by the
  board page. **`docs/new-game.md`** gains the same as a checklist row.
- **`TOUR_ANCHORS` is a shared registry**: renaming an `ag-*` class that
  appears in it means updating it, and the test in §11 is what tells you.
- Tutorial copy is player-language, like the guides — a step is one or two
  short sentences, never a paragraph, and never a restatement of the GDD.

## 14. Rejected, and why

- **A tour library** (driver.js, react-joyride). Both would arrive with their
  own visual language to override, their own popover positioning we've decided
  we don't want (§6), and a dependency to keep current — in exchange for the
  ~250 lines above, of which the genuinely fiddly part (measure, scroll, track)
  is a quarter of one file. The spotlight is a single `box-shadow`.
- **A scripted sandbox game per game.** Every step could then be a real action
  with a guaranteed board, and the rules would have to be reimplemented, or the
  engine driven, twice per game — and kept in step forever. §9 is the price of
  not doing that, and it's cheap.
- **Steps carrying raw CSS selectors.** Works on day one, rots quietly (§4).
- **A popover pinned to the element.** The collision math is most of a tour
  library, and on a phone the answer is nearly always "put it at the bottom"
  anyway (§6).
- **Live re-filtering of the step list.** Renumbers the tour under the
  player's finger (§5).
- **Blocking the board behind a modal scrim.** A tour of your own live game has
  to be escapable in one tap, and a do-it step needs the real control to be
  really tappable (§6).
