# GAME DESIGN DOCUMENT: KLONDIKE SOLITAIRE (SINGLE PLAYER)

**Document Version:** 1.0.0

**Game Title:** Klondike Solitaire (Classic Base Edition)

**Target Audience:** Casual Gamers, Puzzle Enthusiasts, All Ages

**Player Count:** 1 Player

**Play Time:** 3 – 10 Minutes

**Core Mechanics:** Tableau Building, Card Sorting, Pattern Recognition, Resource Management (Stock/Waste), Deck Manipulation

---

## 1. High-Level Concept & Core Loop

### 1.1 Overview

*Klondike Solitaire* is a classic single-player card game played with a standard 52-card deck. The player attempts to sort a shuffled deck into four dedicated foundation piles arranged by suit in ascending rank order (Ace through King). Victory requires navigating hidden cards, optimizing tableau columns, and strategically managing the stock pile draw.

### 1.2 Core Game Loop

Each turn follows an open-ended decision-and-execution loop until victory or a stalemate is reached:

```
+-------------------------------------------------------------+
|                     1. SCAN BOARD STATE                     |
|  - Evaluate face-up cards across 7 Tableau Columns          |
|  - Inspect Waste Pile top card & available Foundation moves  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                     2. EXECUTE LEGAL MOVE                   |
|  - Tableau -> Foundation (Build Up by Suit)                 |
|  - Waste -> Tableau / Foundation                            |
|  - Tableau -> Tableau (Build Down in Alternating Colors)    |
|  - Stock -> Waste (Draw 1 or Draw 3 cards)                  |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                    3. REVEAL & OPEN SPACE                   |
|  - Flip exposed face-down Tableau cards                     |
|  - Move Kings to empty Tableau slots                        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                  4. CHECK GAME STATUS                       |
|  - Win Condition: All 52 cards in Foundations               |
|  - Deadlock Condition: No legal moves remain in system      |
+-------------------------------------------------------------+

```

---

## 2. Components & Board Architecture

### 2.1 The Deck Specification

The game utilizes **one standard 52-card playing deck** without Jokers:

* **4 Suits:** Spades ($\spadesuit$), Clubs ($\clubsuit$) [Black]; Hearts ($\heartsuit$), Diamonds ($\diamondsuit$) [Red].
* **13 Ranks per Suit:** Ace (1), 2, 3, 4, 5, 6, 7, 8, 9, 10, Jack (11), Queen (12), King (13).

### 2.2 Board Layout Architecture

The playing field (Layout) is divided into **4 distinct operational zones**:

```
[ STOCK ]  [ WASTE ]             [ FND 1 ] [ FND 2 ] [ FND 3 ] [ FND 4 ]
 (Draw)     (Talon)               (♠)       (♥)       (♣)       (♦)

 [ TAB 1 ]  [ TAB 2 ]  [ TAB 3 ]  [ TAB 4 ]  [ TAB 5 ]  [ TAB 6 ]  [ TAB 7 ]
   [🂠]        [🂠]        [🂠]        [🂠]        [🂠]        [🂠]        [🂠]
              [🂠]        [🂠]        [🂠]        [🂠]        [🂠]        [🂠]
                         [🂠]        [🂠]        [🂠]        [🂠]        [🂠]
                                    [🂠]        [🂠]        [🂠]        [🂠]
                                               [🂠]        [🂠]        [🂠]
                                                          [🂠]        [🂠]
                                                                     [🂠]

```

| Zone | Quantity | Description | Initial Card Count |
| --- | --- | --- | --- |
| **Stock Pile** | 1 | Face-down draw pile for extra cards. | 24 Cards |
| **Waste Pile** | 1 | Face-up discard pile resulting from Stock draws. | 0 Cards |
| **Foundations** | 4 | Target build piles (1 per suit: $\spadesuit, \heartsuit, \clubsuit, \diamondsuit$). | 0 Cards |
| **Tableau** | 7 | Main playing area columns (Columns 1 through 7). | 28 Cards |

---

## 3. Game Setup & Initial Deal Protocol

1. **Shuffle:** The 52-card deck is thoroughly shuffled.
2. **Tableau Deployment:** Cards are dealt left-to-right into 7 columns:
* **Column 1:** 1 card (Face-up).
* **Column 2:** 2 cards (1 Face-down, 1 Face-up on top).
* **Column 3:** 3 cards (2 Face-down, 1 Face-up on top).
* ...
* **Column $n$:** $n$ cards ($n-1$ Face-down, 1 Face-up on top).
* **Column 7:** 7 cards (6 Face-down, 1 Face-up on top).


3. **Stock Placement:** The remaining **24 cards** are placed face-down in the Stock pile.
4. **Foundations Initialization:** All 4 Foundation slots begin completely empty.

---

## 4. Comprehensive Rules & Move Mechanics

### 4.1 Zone Rules & Valid Operations

#### 1. Foundation Piles (Build Up)

* **Starting Condition:** Only an **Ace** of the corresponding suit can be placed onto an empty Foundation slot.
* **Building Rule:** Must build upward in ascending rank order of the **same suit**:

$$\text{Ace} \longrightarrow 2 \longrightarrow 3 \longrightarrow \dots \longrightarrow \text{Queen} \longrightarrow \text{King}$$


* **Source Eligibility:** Cards can be moved to the Foundation from the Tableau columns or the top of the Waste pile.
* *Optional Advanced Rule (Reverse Move):* Cards may be pulled *back* down from the Foundation to the Tableau if valid according to Tableau build rules.

#### 2. Tableau Columns (Build Down & Alternate)

* **Building Rule:** Must build downward in descending rank order using **alternating colors** (Red on Black, Black on Red):

$$\text{Black King} \longrightarrow \text{Red Queen} \longrightarrow \text{Black Jack} \longrightarrow \dots$$


* **Sequence Movement:** A contiguous, ordered sequence of face-up cards can be moved as a collective unit onto another column if the top card of the sequence forms a valid placement.
* **Empty Column Rule:** Only a **King** (or a valid sequence starting with a King) can be placed into an empty Tableau column slot.
* **Card Uncovering:** When a move exposes a face-down card at the top of a Tableau column, that card is immediately flipped face-up.

#### 3. Stock & Waste Management

* **Draw-1 Variant (Standard Casual):** Drawing moves 1 card from Stock to Waste (Face-up).
* **Draw-3 Variant (Standard Competitive):** Drawing moves 3 cards from Stock to Waste, displaying them stacked so only the 3rd (top) card is directly playable.
* **Stock Recycling:** When the Stock is exhausted, the player flips the entire Waste pile face-down without reshuffling to form a new Stock pile.

---

## 5. Scoring Systems & Conditions

### 5.1 Standard Game Modes

```
+---------------------------------------------------------------------------------+
|                               SCORING COMPARISON                                |
+----------------------------------+----------------------------------------------+
| Standard (Microsoft Rules)       | Vegas Solitaire Rules                        |
+----------------------------------+----------------------------------------------+
| Waste -> Tableau:        +5 pts  | Deck Purchase Cost:  -$52                   |
| Waste -> Foundation:    +10 pts  | Card -> Foundation:  +$5 per card            |
| Tableau -> Foundation:  +10 pts  | Break-even point:     11 cards to Foundation |
| Turn over Tableau card:  +5 pts  | Max Profit:          +$208 (Win game)        |
| Foundation -> Tableau:  -15 pts  | Stock Passes:        1 (Draw-3) or 3 (Draw-1)|
| Stock Recycle (after 3):-20 pts  |                                              |
| Time Penalty: -2 pts / 10s       |                                              |
+----------------------------------+----------------------------------------------+

```

### 5.2 End Game States

* **Absolute Victory:** All 52 cards reside in the 4 Foundation piles ($13 \times 4$).
* **Auto-Win State:** Achieved when all 28 Tableau cards are face-up and the Stock/Waste contains no unplayed cards that block sequential progression.
* **Stalemate / Deadlock:** No further legal moves are available across Stock, Waste, and Tableau, leaving $< 52$ cards in the Foundations.

---

## 6. Systems Design, Solvability & Mathematical Complexity

### 6.1 State Space & Combinatorics

The total permutations of a 52-card deck yield $52! \approx 8.065 \times 10^{67}$ possible initial states. Accounting for initial Tableau distribution:

* Initial Tableau configurations: $\binom{52}{28} \times 28!$
* Stock combinations: $24!$

### 6.2 Solvability Matrix

Unlike games with perfect information, Klondike contains hidden information (face-down cards) and draw-order dependencies.

```
       [ ALL POSITIONS: ~8.06 x 10^67 ]
                     |
       +-------------+-------------+
       |                           |
[ Theoretical Solvability ]   [ Human Practical Win Rate ]
  (~82% - Thoughtful Rules)     (10% - 30% Draw-3)
                                (40% - 50% Draw-1)

```

* **Thoughtful Solitaire (Perfect Information):** If all face-down cards are known, approximately **82%** of random deals are theoretically winnable.
* **Unwinnable Scenarios:** Structural blockages occur when lower-rank cards are trapped beneath higher-rank cards of the same suit/color in a single Tableau column (e.g., $4\spadesuit$ buried underneath $3\spadesuit$).

---

## 7. Player Telemetry & Statistics Engine Design

For digital implementations, performance, difficulty curve, and play behavior should be logged via a telemetry framework.

### 7.1 Tracked Telemetry Metrics

| Category | Field Name | Type | Description |
| --- | --- | --- | --- |
| **Session** | `game_id` | UUID | Unique game session identifier |
| **Session** | `draw_mode` | Enum | `DRAW_1` or `DRAW_3` |
| **Performance** | `time_elapsed_sec` | Integer | Total active play time in seconds |
| **Performance** | `total_moves` | Integer | Total legal moves executed |
| **Performance** | `undo_count` | Integer | Number of undo operations performed |
| **Strategy** | `tableau_clear_rate` | Float | Percentage of initial hidden cards flipped |
| **Strategy** | `foundation_yield` | Integer | Total cards moved to Foundation (0-52) |
| **Efficiency** | `stock_recycle_count` | Integer | Number of times the Stock pile was reset |
| **Outcome** | `result_state` | Enum | `VICTORY`, `STALEMATE_ABANDON`, `RESTART` |

### 7.2 Derived Analytical Indicators

#### 1. Decision Latency Index ($DLI$)

Measures average time spent per move to evaluate player hesitation or puzzle difficulty:


$$DLI = \frac{\text{Active Play Time (seconds)}}{\text{Total Successful Moves}}$$

#### 2. Move Efficiency Ratio ($MER$)

Quantifies wasteful moves (e.g., shuffling cards back and forth between Tableau columns):


$$MER = \frac{\text{Minimum Theoretical Moves}}{\text{Actual Player Moves Executed}}$$

---

## 8. Appendix: Board State Transition Matrix

The table below defines all legal source-to-destination card transfers within the game system:

| Source \ Destination | Stock | Waste | Tableau | Foundation |
| --- | --- | --- | --- | --- |
| **Stock** | — | **Legal** (Draw rule) | Illegal | Illegal |
| **Waste** | Illegal | — | **Legal** (Alt Color / $-1$ Rank) | **Legal** (Same Suit / $+1$ Rank) |
| **Tableau** | Illegal | Illegal | **Legal** (Alt Color / $-1$ Rank) | **Legal** (Same Suit / $+1$ Rank) |
| **Foundation** | Illegal | Illegal | **Legal** *(Optional rule)* | — |
