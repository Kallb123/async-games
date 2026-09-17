# Interactive game tutorials

**Status: plan, not yet built.** This is the design for the feature and the
order to build it in. Nothing described here exists yet; the pieces it reuses
do, and are linked as they come up.

A tutorial is a guided tour of a game's real screen: it points at a thing,
says what the thing is, and moves on — and where the thing is something the
player does, it waits for them to do it. It is what a player wants instead of
reading a wall of text, and it sits beside the existing
[game guide](../src/utils/ui/gameGuides.ts) rather than replacing it: same
per-account "show it once, then keep it in the ⋮ menu" contract, same
data-only authoring, one file per game.

## 1. What it is, and what it isn't

| | Game guide (today) | Interactive tutorial (this) |
|---|---|---|
| Shape | A modal: title + five headed sections | A spotlight on the live screen + one short message at a time |
| Content | Prose the player reads up front | Steps tied to things actually on their board |
| Length | Read in a minute | Six to ten steps, tapped through |
| Asks anything of the player? | No | Optionally: a step can wait for them to roll, build, end their turn |
| When | Auto once per account per game, then ⋮ | Auto once per account per game **in place of** the guide's auto-show, then ⋮ |
| Authoring | `guide.ts` beside the game's `meta.ts` | `tutorial.ts` beside it, same idiom |
| Still there afterwards? | Yes — the ⋮ row stays, as the reference text | Yes — the ⋮ row is the way back in |

Three things it deliberately is **not**:

- **Not a sandbox.** The tour runs on the player's own live match, against the
  real state, with the real board. There is no second, fake game state per
  game to build and keep in step with the rules. That is the biggest cost
  decision in this plan, and §9 is the price of it.
- **Not a wizard the player is trapped in.** Every step has a visible way out,
  the scrim never blocks the board (§6), and closing it is one tap. A tour
  over somebody's real game has to be abandonable mid-step.
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
| `GameTutorial`, `TutorialStep`, `GAME_TUTORIALS`, `hasTutorial`, `TOUR_ANCHORS`, `anchorSelector`, `applicableSteps` | `src/utils/ui/gameTutorials.ts` | The shared shapes, the registry (one import + one line per game, exactly like `GAME_GUIDES`), the anchor names (§4) and the pure step-filtering `useTutorialRun` is built on (§11). |
| `useTutorialRun` | `src/utils/hooks/useTutorialRun.ts` | The run: which step we're on, where its element is on screen, and the self-advance watch. Everything decidable without a DOM is `applicableSteps`, in the file above. |
| `GameTutorialOverlay` | `src/components/ui/GameTutorialOverlay.tsx` | The scrim, the ring and the card. Presentational — every decision comes from the hook. |
| `useGameIntro` | `src/utils/hooks/useGameIntro.ts` | Today's `useGameGuide`, grown to cover both first-runs (§7). Replaces it. |
| `GameShell` | `src/components/ui/GameShell.tsx` | Owns both ⋮ rows and renders both the guide modal and the tour, the way it already owns the turn-history log and the chat thread (§8). |
| `.ag-tour-*` | `src/app/ag-theme.css` | Two modifiers and a scrim. The card is `.ag-banner` + `.ag-cta--dark`; the pulse is `ag-pulse`. There is no new visual language here. |
| The game's own steps | `src/games/<Game>/tutorial.ts` | What this game's tour says, and which signals it leans on. |
| The signals | the game's board page | The handful of booleans a do-it step waits on (§5). The page already computes all of them for its own subtitle. |

## 4. Anchoring: named anchors, and `data-tour` for a game's own bits

A step names its element with a single string, and `anchorSelector` resolves it
in one step:

```ts
// src/utils/ui/gameTutorials.ts
export const TOUR_ANCHORS = {
    scoreboard: '.ag-scorestrip',
    board:      '.ag-board-area',
    turnSheet:  '.ag-actionsheet',
    menu:       '.ag-gom',
} as const;

export type TourAnchor = keyof typeof TOUR_ANCHORS;

/** A step's anchor as a selector: a shared name, or a game's own data-tour. */
export function anchorSelector(anchor: string): string {
    return TOUR_ANCHORS[anchor as TourAnchor] ?? `[data-tour="${anchor}"]`;
}
```

Why this way round:

- **Shared chrome costs nothing to anchor.** Each of those selectors is a class
  the design system already puts on the element — `GameScoreboard`'s strip, the
  board area every game wraps its board in, a turn sheet, the kebab menu. Ten
  games get them for free, and no shared component grows a prop or an attribute
  for the tutorial's sake.
- **A game's own bits are explicit.** "The market", "the landmark track", "the
  infection rate" are not shared concepts and should not be reached by a
  private class name. They get `data-tour="dc-market"` on markup that already
  exists — one attribute, no new element, no new prop — and the anchor name is
  the attribute's value.
- **One rule to remember:** if it's in the table, use the name; if it's yours,
  add the attribute. Nobody has to know the CSS. The one piece of shared chrome
  with no class worth targeting — `GameShell`'s 💬 button — gets
  `data-tour="chat"` rather than an `[aria-label="Chat"]` entry in the table, so
  the rule has no exception and §11's test has no special case.
- **The table starts at four entries, and grows one line at a time.** Only the
  anchors a shipped step actually uses belong in it: an anchor nobody points at
  is a line the test has to keep honest forever. `myHand` is the cautionary
  example — `.ag-hand--me` only exists on games that use `PlayerHands`, i.e.
  the open-handed co-ops, so it is the wrong thing to offer every game up front.
- A raw selector in a step is deliberately *not* supported. It would work, and
  it would leave us with steps pointing at `.ag-dc-market-grid > div:nth-child(2)`
  inside a year.

The `data-tour` values are namespaced by the game's initials (`dc-`, `ob-`,
`tt-`) so a grep for one game's anchors finds exactly them.

## 5. Signals: how a do-it step knows

A do-it step needs to read the game — but the tutorial content must stay
data-only, and nothing in `src/utils/ui/` may learn what a Dice Cities roll is.
So the step doesn't read the state; it names a **signal**, and the board page
supplies the booleans:

```ts
// src/games/DiceCities/tutorial.ts
export type DiceCitiesSignal = 'myTurn' | 'hasRolled' | 'canBuild';

export const tutorial: GameTutorial<DiceCitiesSignal> = {
    steps: [
        { title: 'Welcome to your city', body: 'Six landmarks, first to build all six wins. Two minutes and you\'ll have it.' },
        { anchor: 'scoreboard', title: 'The scoreboard', body: 'How close everyone is to winning. Tap it open for the detail.' },
        { anchor: 'board',      title: 'Your city', body: 'Every card you have built, and what each one pays out.' },
        { anchor: 'dc-roll',    title: 'Your roll', body: 'Everything starts here.',
          when: 'myTurn', advanceOn: 'hasRolled', hint: 'Tap Roll the dice' },
        { anchor: 'dc-market',  title: 'The market', body: 'Spend the coins the roll paid you on one card a turn.', when: 'canBuild' },
        { anchor: 'menu',       title: 'Anything else', body: 'The full rules, the match history and this tour again all live here.' },
    ],
};
```

```tsx
// src/app/games/dicecities/[gameid]/page.tsx — the booleans already exist above
<GameShell
    …
    tutorial={tutorialRun(tutorial, { myTurn: isMyTurn, hasRolled, canBuild: isMyTurn && hasRolled }, { active: nav.isLive && !complete })}
/>
```

Two fields, two jobs:

- `when` — include the step only while the signal is true. A step about the
  market is pointless on an opponent's turn.
- `advanceOn` — the step waits, then advances itself when the signal flips. It
  also **drops itself when the signal is already true at run start**, which is
  the only sane reading: "tap Roll" is wrong if the player already rolled. (An
  earlier draft had a separate `unless` for that. It had one user, and that
  user was this.)

`when` is evaluated **once, when the run starts** — the step list for this run
is fixed at that moment. Re-filtering live would renumber the steps under the
player's finger and could pull the step they are reading out from under them.
`advanceOn` is the only thing watched continuously, and only for the current
step.

### Keeping the signals honest without making `GameShell` generic

`GameTutorial<S>` constrains `when` and `advanceOn` to `S`, so the page must
supply exactly those booleans — a step naming a signal the page doesn't pass is
a **build error**, not a step that silently never fires. But `GameShell` is the
most-used component in the app and shouldn't grow a type parameter for this, so
one generic function does the checking and hands back an erased pair:

```ts
// src/utils/ui/gameTutorials.ts
export interface TutorialRun {
    tutorial: GameTutorial<string>;
    signals: Record<string, boolean>;
    /** False on a finished, abandoned or turn-by-turn-reviewed board (§9). */
    active: boolean;
}

export function tutorialRun<S extends string>(
    tutorial: GameTutorial<S>,
    signals: Record<S, boolean>,
    opts: { active: boolean },
): TutorialRun {
    return { tutorial, signals, active: opts.active };
}
```

The page keeps the type check at the call site; `GameShell` takes a
`TutorialRun | undefined` and stays exactly as generic as it is today.

A themed game builds its tutorial from the theme the same way it builds its
guide: `buildDiceCitiesTutorial(theme)` instead of a const, so a tour of the
post-nuclear re-skin says "bottlecaps" (see [game-themes.md](./game-themes.md)).

There is no `title` on a `GameTutorial`. The card shows the *step*'s title and
the ⋮ row says "Take the tutorial"; a tour-level title would have nowhere to
appear.

## 6. The overlay: spotlight, card, and keeping it in view

### The spotlight is one element

```css
.ag-tour-spot {
    position: fixed;
    z-index: 1020;                              /* under the banner rung, over the page */
    border-radius: 12px;
    pointer-events: none;                       /* the board stays usable */
    box-shadow: 0 0 0 100vmax var(--ag-tour-scrim),  /* dims everything else */
                0 0 0 3px var(--ag-terracotta);      /* the ring */
    transition: top .28s ease, left .28s ease, width .28s ease, height .28s ease;
    scroll-margin-block: 96px;                  /* keeps the card clear — see below */
}
```

One absolutely-positioned box, sized to the anchor's
`getBoundingClientRect()`, with a scrim-coloured shadow spread wide enough to
cover any viewport. That single declaration gives us the dim, the hole and the
ring, it animates from step to step for free, and — because the element covers
only the hole and takes no pointer events — **nothing on the page is ever
blocked**. A do-it step needs the highlighted control to be really tappable;
every other step needs the player to be able to bail out to the board. Both
fall out of the same element.

The tradeoff, stated plainly: a stray tap during a narration step lands on the
board and can submit a real command. We accept it (it is the player's own game,
and a tour they can't escape is worse), and if playtesting says otherwise the
fix is known — swap the one box for four dim panels around the rect plus a
transparent blocker over the hole on narration steps only, which keeps the same
API and touches only this component.

The ring reuses `ag-pulse` (`--ag-pulse-min`, as `.ag-map-highlight-ring` and
`.ag-score-pill--highlighted` already do), so it honours
`prefers-reduced-motion` through the same `@media` block the rest of the app's
pulses sit in, and the position transition is dropped there too.

### The card is the bottom banner, on both breakpoints

No popover, no arrow, no collision solving. The message goes in the slot the
design system already owns for a fixed card across the bottom of the app:

```
.ag-banner                       fixed, full width, click-through, z-index 1030,
                                 safe-area padding                    (exists)
  .ag-banner-inner.ag-cta.ag-cta--dark   the dark card itself, max-width the
                                 .ag-app column, lifted shadow        (exists)
    .ag-cta-title                the step title                       (exists)
    .ag-cta-sub                  the step body                        (exists)
    .ag-tour-actions             Skip / ‹ Back / Next ›               (new, ~6 lines)
```

`ag-theme.css:913` documents that slot as "named for the slot rather than the
pitch", which is exactly the invitation to reuse it: fixed-to-viewport,
click-through outer with a `pointer-events: auto` inner, `--ag-app-width`,
`env(safe-area-inset-bottom)`, `--ag-shadow-lift` and a place on the documented
z-index ladder (banner 1030 < Bootstrap modal 1050 < toast 1100) are all
already solved. The new CSS is one flex row of buttons and the scrim above.

That ladder also settles a thing the overlay would otherwise get wrong: a
`box-shadow: 0 0 0 100vmax` scrim dims *everything* below it, its own card
included. The scrim sits at 1020, one rung under the banner, so the card reads
at full contrast without a second stacking context to reason about.

**One real collision.** `BottomBanner` is mounted for the whole app by
`Providers` and can be showing an install, notifications or keep-your-account
offer in that same strip. Rather than suppressing it — which would mean a new
global "a tour is running" signal — the tour card stacks above it using the
variable that already exists for exactly this: `.ag-toast-container` sits at
`bottom: var(--ag-banner-height)`, measured by `useHeightVar`. The tour card's
one modifier does the same:

```css
.ag-tour-card { bottom: var(--ag-banner-height, 0); }
```

No suppression, no new mechanism, and the two cards stack in the order a player
would expect. (If a bright undimmed offer during a tour looks busy in
playtesting, suppressing the banner is the fallback — but it costs a shared
signal, so it isn't the opening move.)

### Getting the element into view

On every step change, in this order:

1. **Wait for the element.** `document.querySelector(anchorSelector(step.anchor))`,
   retried on a couple of animation frames — a panel that just opened, or a
   board that just finished laying out, is not there on the first tick.
2. **Scroll it into view.** `el.scrollIntoView({ block: 'center', behavior })`,
   with `behavior: 'auto'` under reduced motion via `prefersReducedMotion()`
   from [`usePrefersReducedMotion.ts`](../src/utils/hooks/usePrefersReducedMotion.ts) —
   the same helper `useScrollIntoViewOnOpen` calls, and the reason that helper
   was extracted in the first place. `scrollIntoView` walks *every* scrollable
   ancestor, which is what makes an anchor inside `BoardZoom`'s
   `.ag-board-scroll` pane work at all.
3. **Let CSS keep the card clear.** `scroll-margin-block` on the spotlight
   element (above) makes the browser leave room for the card by itself. No
   second measure-and-nudge pass, which is a decent slice of the fiddly part
   this feature would otherwise have to pay for.
4. **Track it.** A `ResizeObserver` on the anchor plus passive
   `scroll`/`resize` listeners, coalesced through one `requestAnimationFrame`,
   re-measure the rect — so the spotlight follows the element when the player
   scrolls, the scoreboard expands, or the phone rotates.

Anchors on a zoomed board are the one place this gets thin: at `fit` width a
map node can be a few pixels across, and the spotlight will honestly point at a
few pixels. **v1 rule: board steps anchor the board area or a labelled region,
not an individual node.** Per-node anchoring — which wants a `BoardZoom` that
can be asked to zoom-and-centre on a node — is listed in §12 as a follow-up,
not smuggled into this build.

## 7. First run, and getting back in

The rule: **a game with a tutorial never auto-shows its guide.** One welcome
per game, and the tutorial is the better one. The guide keeps its ⋮ row as the
reference text.

That makes the existing first-run machinery *almost* right, and it should grow
rather than be copied:

- **The route stays.** `/api/gameguides` keeps its URL (a rename would only
  strand the POSTs of clients running cached JS, for no gain) and grows a
  second list: `GET` answers `{ seen, seenTutorials }`, and `POST { game, kind }`
  writes to the list `kind` names, defaulting to `'guide'`. Its allowlist check
  becomes "in `GAME_GUIDES` or in `GAME_TUTORIALS`", by kind — that check is
  what makes the registry line mandatory, the same way `gameRegistry.test.ts`
  guards the engine's.
- **The metadata grows a key.** `privateMetadata.seenGameTutorials`, beside
  `seenGameGuides`. `src/utils/users/gameGuideProgress.ts` already has the three
  functions this needs (`getSeen`, `hasSeen`, `withSeen`); they take the key as
  an argument instead of hard-coding it. Per-account and not per-browser, for
  the reason it always was: the welcome shouldn't repeat on a new device.
- **The hook grows a second answer.** `useGameGuide` becomes `useGameIntro`,
  with the same single fetch and the same `loaded` flag that
  [`RoleIntroPopup`](../src/components/ui/RoleIntroPopup.tsx) waits on — which
  now waits for whichever intro has the floor:

```ts
const intro = useGameIntro('dicecities');
// → { tutorialOpen, guideOpen, loaded, startTutorial, openGuide, close }
```

  It asks `hasTutorial(gameUrl)` itself rather than taking a flag, so a page
  can't disagree with the registry. `tutorialOpen` is true when the account
  hasn't seen this game's tutorial (or the player picked it from ⋮);
  `guideOpen` is true when they open it from ⋮, or — for a game with no
  tutorial — on their first match, exactly as today. Never both: the tutorial
  wins. Closing marks only the list that was auto-shown (opening one from ⋮ is
  a look, not a first visit — unchanged).

**A player who already saw the guide still gets the tutorial once**, because
the lists are separate. That is the intent: the tutorial is new and better, and
one tour is a fair thing to spend an existing player's attention on.

## 8. `GameShell` owns the wiring, for both of them

Every board page currently repeats the same five lines of guide plumbing — two
imports, the hook call, a `{ key: 'guide', label: 'Game guide', icon: '📖' }`
row, and the `{gameGuide.open && <GameGuideModal …/>}` render. That is eight
pages of it, nine counting Race Cars' slightly different `guideForGame` lookup.
Adding a tutorial the same way would make it nine or ten copies of *two*
features, which is the thing AGENTS.md calls a defect — and `GameShell`'s own
docblock already says why: it owns the turn-history log because that "used to be
three pasted pieces in each of the eight board screens."

So the shell owns this too. It already prepends its own rows to a game's
`options`, and already renders panels of its own:

```tsx
<GameShell
    title="Dice Cities"
    …
    intro={intro}                       // from useGameIntro, in the page (see below)
    guide={buildDiceCitiesGuide(theme)}
    tutorial={tutorialRun(tutorial, signals, { active: nav.isLive && !complete })}
/>
```

and adds, to the rows it already contributes:

```
🎓  Take the tutorial     (only when `tutorial` is passed)
📖  Game guide            (only when `guide` is passed)
```

plus `{intro.guideOpen && <GameGuideModal …/>}` and
`{intro.tutorialOpen && <GameTutorialOverlay …/>}`.

**The hook call stays in the page**, and the page passes the object down. Two
`useGameIntro` calls would mean two fetches, and Outbreak and Banned Islet read
`intro.loaded` / `intro.tutorialOpen || intro.guideOpen` themselves to hold
`RoleIntroPopup` back until the game's own welcome has had the floor. One
fetch, one source of truth, and the shell gets handed the result.

Net effect per board page: **two imports, one menu row and one render line
removed; one prop added.** The guide gets simpler as a side-effect of adding
the tutorial, which is the right direction.

## 9. When a step can't run

Everything below is a degradation, never an error, and never a dead screen.
This is the part a tour over live state has to get right, and the part a
sandbox would have let us skip.

| Situation | What happens |
|---|---|
| The anchor never appears (a panel the player closed, a game state the step assumed) | After the retry frames, the step is **skipped** silently and the run moves on. A tour with a hole in it beats a tour stuck on a missing pill. |
| Every step's anchor is missing | The run ends immediately and marks itself seen. No empty scrim. |
| The step's element is bigger than the viewport | The spotlight is clamped to the viewport with a margin, so the ring stays visible rather than sitting entirely off-screen. |
| A do-it step's signal is never satisfied (the player's turn ends, an opponent moves) | `Skip` is always there; and if the step's `when` signal stops holding, the hint is replaced by `Next ›` so the run can't trap the player. |
| The game is complete, abandoned, or being reviewed turn-by-turn | `active: false` on the run (§5) — the tour doesn't auto-run at all. A finished board is the wrong thing to tour, and the recap/review screens have their own chrome. |
| The state fetch hasn't landed | `loaded` gates it, as the guide's already does — nothing flashes open and shut. |
| A step names a signal the page doesn't pass | A build error (§5). |
| The account's seen-list write fails | Logged and swallowed, as the guide's already is. The worst case is a tour offered twice. |

## 10. Accessibility

- The card is a `role="dialog"` with `aria-modal="false"` — deliberately not
  modal, because the page underneath stays live and usable.
- **Each step change moves focus to the card's heading.** That announces the
  new message and puts the keyboard where the controls are, in one move. An
  earlier draft also made the card an `aria-live` region, which would have read
  every step twice.
- `Escape` closes the tour; `useCloseRequest` gives us the Android back gesture
  for free, the same way [`InfoModal`](../src/components/ui/InfoModal.tsx) has
  it.
- `Skip`/`Back`/`Next` are real buttons in DOM order, so the whole tour is
  keyboard-operable with no arrow-key handling of our own.
- The spotlight is decorative: `aria-hidden`, and the card's text names the
  thing it points at in words ("the scoreboard", "Roll the dice") rather than
  relying on the ring. A tour that only works if you can see the highlight
  isn't a tour for everybody.
- Reduced motion: no pulse, no position transition, instant scroll (§6).

## 11. Tests

`vitest` runs in the `node` environment with no jsdom and no
`@testing-library`, so nothing here pretends to render a hook. The repo's
answer to that is
[`useRefreshableData.test.ts`](../src/utils/hooks/useRefreshableData.test.ts):
export the pure piece and test *that*. So `applicableSteps(tutorial, signals)`
and the one-line "has this step's `advanceOn` fired" predicate live in
`gameTutorials.ts`, and `useTutorialRun` is only the measuring part — which
nothing unit-tests.

Three tests, all in `src/utils/ui/gameTutorials.test.ts`:

1. **Every anchor resolves.** For each step of each registered tutorial, the
   anchor is either a `TOUR_ANCHORS` key or appears as `data-tour="<name>"`
   somewhere under `src/`. Exactly how a renamed market would otherwise rot a
   step silently.
2. **Every `TOUR_ANCHORS` selector is still applied to something.** Grep the
   *components* (`src/**/*.tsx`) for each entry's class, not `ag-theme.css` — a
   CSS rule outlives its markup, so a selector that only proves a stylesheet
   entry exists proves nothing. Catches the rename from the other direction.
3. **The filtering.** `when` includes and drops steps as specified, a step
   whose `advanceOn` signal is already true at run start is dropped, and a
   tutorial with no applicable steps reports an empty run.

Plus the usual gates before committing: `npm run build`, `npx tsc --noEmit`,
`npm run lint` (`--max-warnings 0`), and `npm test` because a registry is
touched.

## 12. Build order

**Phase 1 — the machinery, and one game.** `gameTutorials.ts`,
`useTutorialRun.ts`, `GameTutorialOverlay.tsx`, the `.ag-tour-*` CSS,
`useGameGuide` → `useGameIntro` (with its route and metadata growing the second
list), `GameShell` taking over both ⋮ rows and both renders, and Dice Cities'
`tutorial.ts`.

This phase touches every board page **once** — not to add the tutorial, but to
hand the guide wiring to the shell (§8). That is the whole reason Phase 2 is
cheap, and it leaves the existing feature smaller than it found it.

Dice Cities first because it has a scoreboard, a board, a market, a themed
vocabulary and a do-it step (the roll) — if the design survives it, it survives.

**Phase 2 — the rest of the games that want one.** Settlements & Cities, World
Domination, Outbreak, Train Time, Fires Out!, Banned Islet. Each is one
`tutorial.ts`, one registry line, a couple of `data-tour` attributes and **one
prop** on the shell. No shared code should need to change; if it does, that's
the signal the shared piece is wrong, not that the game is special.

**Phase 3 — the seams worth polishing once it's real.** A "Take the tutorial"
row on the game's setup screen and in `GameLibrary`, so a player can tour a
game before committing to a match. Per-node board anchoring, via a `BoardZoom`
that can be asked to centre on a node. Neither is needed to ship.

Files touched, all told:

```
new     src/utils/ui/gameTutorials.ts              (shapes, registry, anchors, filtering)
new     src/utils/ui/gameTutorials.test.ts
new     src/utils/hooks/useTutorialRun.ts
new     src/components/ui/GameTutorialOverlay.tsx
new     src/games/<Game>/tutorial.ts               (one per game)
rename  src/utils/hooks/useGameGuide.ts          → useGameIntro.ts
edit    src/utils/users/gameGuideProgress.ts       (key as an argument)
edit    src/app/api/gameguides/route.ts            (second list, kind)
edit    src/components/ui/GameShell.tsx            (intro/guide/tutorial props, both ⋮ rows, both renders)
edit    src/app/ag-theme.css                       (scrim, card modifier, button row)
edit    src/app/games/<game>/[gameid]/page.tsx     (Phase 1: hand the guide over. Phase 2: one prop)
edit    src/utils/ui/whatsNew.ts                   (one line, enhancements)
edit    AGENTS.md, docs/new-game.md                (a tutorial is part of adding a game)
```

## 13. Upkeep

- **One "What's new" line for the whole branch**, in *Enhancements*, however
  many games the branch tours: "Guided tutorials — a tour of the board on your
  first game, pointing at the thing it's talking about." Per-game tours added
  later don't each get a line.
- **AGENTS.md** gains a sentence beside the game-guide paragraph: most games
  also want a `tutorial.ts`, registered in `GAME_TUTORIALS` and handed to
  `GameShell`. **`docs/new-game.md`** gains the same as a checklist row beside
  its existing `guide.ts` one.
- **`TOUR_ANCHORS` is a shared registry**: renaming an `ag-*` class that
  appears in it means updating it, and §11's tests are what tell you.
- Tutorial copy is player-language, like the guides — a step is one or two
  short sentences, never a paragraph, and never a restatement of the GDD.

## 14. Rejected, and why

- **A tour library** (driver.js, react-joyride). Both would arrive with their
  own visual language to override, their own popover positioning we've decided
  we don't want (§6), and a dependency to keep current — in exchange for one
  util, one hook and one component, of which the genuinely fiddly part
  (measure, scroll, track) is a quarter of one file. The spotlight is a single
  `box-shadow`.
- **A scripted sandbox game per game.** Every step could then be a real action
  with a guaranteed board, and the rules would have to be reimplemented, or the
  engine driven, twice per game — and kept in step forever. §9 is the price of
  not doing that, and it's cheap.
- **Wiring both features into each board page.** Nine copies of five lines, for
  the feature whose shell exists to prevent exactly that (§8).
- **A second bottom-card CSS block.** `.ag-banner` is that slot, and
  `--ag-banner-height` is how a second fixed layer stacks on it (§6).
- **A separate `tourAnchors.ts`.** Fifteen lines, one consumer, and both its
  tests live in the tutorial registry's test file — it is one concern.
- **`unless` as a third step field**, and a tour-level `title`: one had a single
  user that `advanceOn` already covers, the other had nowhere to render (§5).
- **A DOM test for `useTutorialRun`.** There is no jsdom in this repo; the
  answer is to export the pure part (§11).
- **Steps carrying raw CSS selectors.** Works on day one, rots quietly (§4).
- **A popover pinned to the element.** The collision math is most of a tour
  library, and on a phone the answer is nearly always "put it at the bottom"
  anyway (§6).
- **Live re-filtering of the step list.** Renumbers the tour under the player's
  finger (§5).
- **Blocking the board behind a modal scrim.** A tour of your own live game has
  to be escapable in one tap, and a do-it step needs the real control to be
  really tappable (§6).
