# GAME DESIGN DOCUMENT: WORLD DOMINATION (BASE EDITION)

**Document Version:** 1.0.0  
**Game Title:** World Domination: The Game of Global Conquest  
**Target Audience:** Strategy Gamers, Casual Enthusiasts, Age 10+  
**Player Count:** 2 – 6 Players (Optimal: 4–5 Players)  
**Play Time:** 120 – 240 Minutes  
**Core Mechanics:** Area Control, Dice Rolling, Territory Drafting, Set Collection, Player Elimination, Tactical Movement  

---

## 1. High-Level Concept & Core Loop

### 1.1 Overview
*World Domination* is a turn-based grand strategy board game of global conquest. Players command armies, form fragile tactical alliances, launch military invasions, and defend territories on a stylized political map of Earth divided into 42 territories across 6 continents. The overarching goal is simple yet absolute: conquer every territory on the board and eliminate all opposing forces.

### 1.2 Core Game Loop
Each turn follows a strict three-phase structure, followed by an optional card draw:

```
+-------------------------------------------------------------+
|                      PHASE 1: REINFORCE                     |
|  - Territory Base Yield = Max(3, floor(Territories / 3))   |
|  - Add Continent Ownership Bonuses                          |
|  - Cash in Risk Card Sets (Fixed or Progressive rules)       |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                       PHASE 2: ATTACK                       |
|  - Select Source & Target Territories                       |
|  - Roll Attack Dice (1-3) vs Defense Dice (1-2)             |
|  - Compare High Rolls; Suffer Casualties                    |
|  - Occupy Conquered Territories                             |
|  - Check for Player Elimination                             |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                       PHASE 3: FORTIFY                      |
|  - Relocate armies from Source A to Destination B          |
|  - Must follow connected chain of owned territories         |
|  - Must leave at least 1 unit behind                        |
+-------------------------------------------------------------+
                              |
                              v
+-------------------------------------------------------------+
|                   END OF TURN: CARD DRAW                    |
|  - Draw 1 Risk Card IF >= 1 enemy territory was conquered   |
+-------------------------------------------------------------+
```

---

## 2. Components & Hardware Specifications

### 2.1 The Game Board
The game board features a Mercator-projection political map of Earth divided into **42 distinct territories** grouped into **6 color-coded continents**:

| Continent | Total Territories | Color Code | Border Entrances / Chokepoints | Default Reinforcement Bonus |
| :--- | :---: | :--- | :---: | :---: |
| **Australia** | 4 | Magenta / Pink | 1 | +2 |
| **South America** | 4 | Green | 2 | +2 |
| **Africa** | 6 | Brown / Tan | 3 | +3 |
| **North America** | 9 | Yellow / Gold | 3 | +5 |
| **Europe** | 7 | Blue | 4 | +5 |
| **Asia** | 12 | Purple / Green | 5 | +7 |

### 2.2 Playing Pieces (Armies)
Armies are represented by plastic miniature tokens in six distinct player colors (e.g., Red, Blue, Green, Yellow, Black, Grey). The tokens signify unit denominations:
*   **Infantry Piece:** Represents **1 Army**.
*   **Cavalry Piece:** Represents **5 Armies** (Equivalent to 5 Infantry).
*   **Artillery Piece:** Represents **10 Armies** (Equivalent to 2 Cavalry or 10 Infantry).

### 2.3 Dice
*   **3 Red Attack Dice:** Used by the active attacking player.
*   **2 White/Blue Defense Dice:** Used by the defending player.

### 2.4 Risk Cards
The deck contains **56 cards** total:
*   **42 Territory Cards:** Each displaying a single territory name, its map location, and an insignia icon representing one of three unit types: Infantry, Cavalry, or Artillery.
*   **2 Wild Cards:** Displaying all three unit insignias, usable as any unit type during set cash-ins.
*   *(Note: Base Risk excludes secret mission cards or expansion modifiers).*

---

## 3. Game Setup & Initial Territory Allocation

### 3.1 Initial Army Pool Determination
Each player selects a color. The starting army pool depends directly on the total number of participating players:

| Total Players | Starting Armies (in Infantry units) |
| :---: | :---: |
| **2 Players** | 40 Infantry (Includes a special 2-player neutral army variant) |
| **3 Players** | 35 Infantry |
| **4 Players** | 30 Infantry |
| **5 Players** | 25 Infantry |
| **6 Players** | 20 Infantry |

---

### 3.2 Territory Distribution Protocols

#### Option A: Tactical Draft Setup (Standard Competition Mode)
1. Every player rolls a single die. The highest roll chooses who picks first; order continues clockwise.
2. Starting with the first player, players take turns placing **one Infantry unit** onto any unclaimed territory on the board until all 42 territories are occupied.
3. Once all 42 territories are claimed, players take turns placing their remaining Infantry units, one at a time, onto any territory they already control.
4. Setup completes when all players have deployed their entire initial army allocation.

#### Option B: Random Card Allocation (Accelerated Setup)
1. Remove the 2 Wild Cards from the deck.
2. Shuffle the 42 Territory Cards and deal them face down evenly among all players.
3. Players place one Infantry unit onto each territory matching the cards in their hand.
4. Players then place their remaining starting Infantry onto their territories in any distribution they choose.
5. All 42 cards are collected, mixed with the 2 Wild Cards, re-shuffled, and placed face-down as the draw deck.

---

## 4. Comprehensive Turn Mechanics

### 4.1 Phase 1: Reinforcement & Card Cash-In

At the beginning of a player's turn, they receive and place new armies calculated from three distinct sources:

#### 1. Base Territory Calculation
Count the total number of territories currently controlled ($T$). The base army count is calculated as:
$$	ext{Base Armies} = \max\left(3, \left\lfloor rac{T}{3} 
ight
floor
ight)$$

#### 2. Continent Control Bonuses
If a player controls all territories within a continent at the start of their turn, they receive the full bonus armies assigned to that continent (see Section 2.1).

#### 3. Card Set Cash-In
Players may turn in matching sets of 3 Risk Cards to gain extra armies:

*   **Valid Set Combinations:**
    *   3 cards of the same unit type (3 Infantry, 3 Cavalry, or 3 Artillery).
    *   1 card of each unit type (1 Infantry + 1 Cavalry + 1 Artillery).
    *   Any 2 unit cards + 1 Wild Card.

*   **Territory Match Bonus:** If any card in the redeemed 3-card set depicts a territory currently owned by the player, the player immediately receives **+2 additional Infantry**, which **must** be placed directly onto that specific territory.

*   **Ruleset Variants for Card Values:**
    *   **Fixed Value Ruleset:**
        *   3 Infantry = 4 Armies
        *   3 Cavalry = 6 Armies
        *   3 Artillery = 8 Armies
        *   1 of Each Type = 10 Armies
    *   **Progressive Value Ruleset (Standard Modern Variant):**
        *   1st Set Cashed In (by any player): 4 Armies
        *   2nd Set: 6 Armies
        *   3rd Set: 8 Armies
        *   4th Set: 10 Armies
        *   5th Set: 15 Armies
        *   *Each subsequent set increases value by +5 armies (20, 25, 30, etc.)*.

*   **Mandatory Cash-In Rule:** If a player starts their turn holding **5 or 6 Risk Cards**, they **must** trade in at least one set during Phase 1.

---

### 4.2 Phase 2: Combat & Invasion

Combat is optional. Active players may conduct as many attacks as desired from one or multiple territories.

#### Attack Prerequisites
1. The attacking territory must contain **at least 2 armies** (1 army must always remain behind to occupy the origin territory).
2. The target territory must share a direct land border or sea connectivity line with the attacking territory.

#### Combat Resolution Procedure
1. **Declare Intent:** Attacker specifies the attacking territory and target enemy territory.
2. **Determine Attacker Dice Count:**
    *   3 Armies in territory $
ightarrow$ May roll up to 2 dice.
    *   $\ge 4$ Armies in territory $
ightarrow$ May roll up to 3 dice.
    *   *(Requires $N+1$ armies to roll $N$ dice; max 3 dice).*
3. **Determine Defender Dice Count:**
    *   1 Army in territory $
ightarrow$ Rolls 1 die.
    *   $\ge 2$ Armies in territory $
ightarrow$ May roll 1 or 2 dice.
4. **Roll & Match:** Both players roll simultaneously. Both sets of dice are sorted in descending numerical order and compared pair-by-pair:
    *   **Highest Attack Die vs. Highest Defense Die:** Highest roll wins. The loser removes 1 army from their territory. **In the event of a tie, the defender wins.**
    *   **Second-Highest Attack Die vs. Second-Highest Defense Die:** (Evaluated only if both players rolled at least 2 dice). Highest roll wins; defender wins ties.

```
Example Combat Resolution:
Attacker rolls:  [6, 4, 1]
Defender rolls:  [5, 4]

Pair 1 (Highest):        6 vs 5  --> Attacker Wins (Defender loses 1 unit)
Pair 2 (Second-Highest): 4 vs 4  --> Tie goes to Defender (Attacker loses 1 unit)
Result: Both players lose 1 army.
```

#### Probability Matrix for Single Combat Rolls

| Attacker Dice | Defender Dice | Attacker Wins 2 | Defender Wins 2 | Split (1 Each) | Attacker Win % (Single Pair) |
| :---: | :---: | :---: | :---: | :---: | :---: |
| **3** | **2** | 37.17% | 33.58% | 29.26% | — |
| **3** | **1** | — | — | — | 65.97% |
| **2** | **2** | 22.76% | 44.83% | 32.41% | — |
| **2** | **1** | — | — | — | 57.87% |
| **1** | **2** | — | — | — | 25.46% |
| **1** | **1** | — | — | — | 41.67% |

#### Occupation & Conquest
*   When the last defending unit in a target territory is destroyed, the territory is conquered.
*   The attacker **must** immediately relocate a minimum number of armies equal to the number of dice rolled in the final attack roll into the new territory.
*   The attacker may relocate additional armies from the origin territory, provided at least 1 army remains behind.

#### Eliminating an Opposing Player
*   If a player conquers an opponent's final remaining territory, that opponent is **eliminated** from the game.
*   The conquering player immediately takes all Risk cards held by the eliminated player into their own hand.
*   If this card gain causes the conqueror's hand to total 6 or more cards, they **must immediately pause combat**, cash in card sets until their hand size drops below 5, deploy the earned units, and then resume their turn.

---

### 4.3 Phase 3: Tactical Fortification

After ending all attacks, a player may perform **one single fortification maneuver**:
*   Select one source territory $A$ and one destination territory $B$.
*   There must be an unbroken chain of adjacent, friendly-controlled territories connecting $A$ and $B$.
*   Move any desired number of armies from $A$ to $B$, provided **at least 1 army remains** behind in territory $A$.
*   Once fortification is executed or passed, Phase 3 ends.

---

### 4.4 End-of-Turn Card Draw
If a player successfully conquered **at least one enemy territory** during their turn, they draw **one** Risk card from the top of the draw deck. (A player receives at most 1 card per turn regardless of how many territories were conquered).

---

## 5. Victory Condition

The game ends immediately when a single player successfully conquers all **42 territories** on the game board, eliminating every opposing player and achieving **Total World Domination**.

---

## 6. Game Balance & Systems Design Analysis

### 6.1 Continent Strategic Value Index

A critical design consideration in *Risk* is balancing continent army rewards against territorial size and defensibility. We define the **Defensibility Ratio** ($DR$) and **Value Density** ($VD$) as:

$$DR = rac{	ext{Bonus Armies}}{	ext{Border Entry Points}} \qquad VD = rac{	ext{Bonus Armies}}{	ext{Territory Count}}$$

| Continent | Bonus ($B$) | Borders ($E$) | Territories ($T$) | Defensibility Ratio ($B/E$) | Value Density ($B/T$) | Strategic Role |
| :--- | :---: | :---: | :---: | :---: | :---: | :--- |
| **Australia** | 2 | 1 | 4 | **2.00** | 0.50 | Early-game turtle strategy / Secure base |
| **South America** | 2 | 2 | 4 | **1.00** | 0.50 | Early foothold / Dual expansion vector |
| **North America** | 5 | 3 | 9 | **1.67** | 0.56 | Mid-game powerhouse / High defense potential |
| **Africa** | 3 | 3 | 6 | **1.00** | 0.50 | High-risk central nexus / Distraction hub |
| **Europe** | 5 | 4 | 7 | **1.25** | 0.71 | High value yield / Extremely vulnerable borders |
| **Asia** | 7 | 5 | 12 | **1.40** | 0.58 | Endgame victory engine / Impossible early hold |

### 6.2 Topological Map Chokepoints
*   **Siam:** The absolute bottleneck controlling access to Australia.
*   **Central America & Greenland:** Primary entry chokepoints shielding North America.
*   **Alaska <-> Kamchatka:** The sole trans-continental bridge connecting North America to Asia.
*   **North Africa:** Strategic bridge between South America, Europe, and Africa.

---

## 7. Player Telemetry & Statistics Engine Design

To support modern digital implementations, analytics tracking, or competitive post-game breakdowns, a Risk engine should collect structural game telemetry.

### 7.1 Key Telemetry Categories & Data Fields

```
+-----------------------------------------------------------------------------------+
|                            GAME TELEMETRY ENGINE                                 |
+------------------------------------+----------------------------------------------+
| Category                           | Tracked Telemetry Metrics                    |
+------------------------------------+----------------------------------------------+
| 1. Combat & Luck Variance          | - Expected vs. Actual Kills/Losses           |
|                                    | - Attacker/Defender Luck Index (Luck Factor) |
|                                    | - Chi-Square Dice Uniformity Test            |
|                                    | - Battle Attrition Rate (Units lost/Turn)    |
+------------------------------------+----------------------------------------------+
| 2. Map Control & Dynamics          | - Territory Growth Rate (Territories/Turn)   |
|                                    | - Continent Control Duration (Turn Count)    |
|                                    | - Chokepoint Reinforcement Density           |
|                                    | - Territorial Heatmap Coordinates            |
+------------------------------------+----------------------------------------------+
| 3. Economy & Set Efficiency        | - Unused Card Retention Time                 |
|                                    | - Card Set Trade Value Yield                 |
|                                    | - Elimination Harvest Multiplier             |
+------------------------------------+----------------------------------------------+
```

### 7.2 Mathematical Definitions of Primary Metrics

#### 1. Attacker Luck Deviation Score ($\Delta L_A$)
Quantifies whether a player's combat rolls performed above or below statistical expectation:
$$\Delta L_A = \sum_{k=1}^{M} \left( L_{	ext{actual}, k} - \mathbb{E}[L_k] 
ight)$$
*Where $M$ is total battles fought, $L_{	ext{actual}}$ is enemy casualties inflicted, and $\mathbb{E}[L_k]$ is theoretical expected casualties based on exact dice matchup probabilities.*

#### 2. Continent Hold Stability Index ($CHS$)
$$	ext{CHS}_c = rac{	ext{Turns Continent } c 	ext{ Kept Intact}}{	ext{Total Game Duration in Turns}}$$

#### 3. Fortification Efficiency Metric ($FEM$)
$$	ext{FEM} = rac{	ext{Armies Relocated to Border Territories}}{	ext{Total Armies Moved in Phase 3}}$$

---

## 8. Appendix: Master Board Connectivity Matrix

Below is the complete adjacency network for all 42 territories across the 6 continents:

### North America (9 Territories)
1. **Alaska:** Northwest Territory, Alberta, Kamchatka (Asia)
2. **Northwest Territory:** Alaska, Alberta, Ontario, Greenland
3. **Greenland:** Northwest Territory, Quebec, Iceland (Europe)
4. **Alberta:** Alaska, Northwest Territory, Ontario, Western United States
5. **Ontario:** Northwest Territory, Alberta, Quebec, Western United States, Eastern United States
6. **Quebec:** Greenland, Ontario, Eastern United States
7. **Western United States:** Alberta, Ontario, Eastern United States, Central America
8. **Eastern United States:** Quebec, Ontario, Western United States, Central America
9. **Central America:** Western United States, Eastern United States, Venezuela (South America)

### South America (4 Territories)
10. **Venezuela:** Central America (North America), Peru, Brazil
11. **Peru:** Venezuela, Brazil, Argentina
12. **Brazil:** Venezuela, Peru, Argentina, North Africa (Africa)
13. **Argentina:** Peru, Brazil

### Europe (7 Territories)
14. **Iceland:** Greenland (North America), Great Britain, Scandinavia
15. **Great Britain:** Iceland, Scandinavia, Northern Europe, Western Europe
16. **Scandinavia:** Iceland, Great Britain, Northern Europe, Ukraine
17. **Western Europe:** Great Britain, Northern Europe, Southern Europe, North Africa (Africa)
18. **Northern Europe:** Great Britain, Scandinavia, Western Europe, Southern Europe, Ukraine
19. **Southern Europe:** Western Europe, Northern Europe, Ukraine, North Africa (Africa), Egypt (Africa), Middle East (Asia)
20. **Ukraine:** Scandinavia, Northern Europe, Southern Europe, Ural (Asia), Afghanistan (Asia), Middle East (Asia)

### Africa (6 Territories)
21. **North Africa:** Brazil (South America), Western Europe (Europe), Southern Europe (Europe), Egypt, East Africa, Congo
22. **Egypt:** Southern Europe (Europe), North Africa, East Africa, Middle East (Asia)
23. **East Africa:** Egypt, North Africa, Congo, South Africa, Madagascar, Middle East (Asia)
24. **Congo:** North Africa, East Africa, South Africa
25. **South Africa:** Congo, East Africa, Madagascar
26. **Madagascar:** East Africa, South Africa

### Asia (12 Territories)
27. **Ural:** Ukraine (Europe), Siberia, Afghanistan, China
28. **Siberia:** Ural, Yakutsk, Irkutsk, Mongolia, China
29. **Yakutsk:** Siberia, Kamchatka, Irkutsk
30. **Kamchatka:** Yakutsk, Irkutsk, Mongolia, Japan, Alaska (North America)
31. **Irkutsk:** Siberia, Yakutsk, Kamchatka, Mongolia
32. **Mongolia:** Siberia, Irkutsk, Kamchatka, Japan, China
33. **Japan:** Kamchatka, Mongolia
34. **Afghanistan:** Ukraine (Europe), Ural, China, India, Middle East
35. **China:** Ural, Siberia, Mongolia, Afghanistan, India, Siam
36. **Middle East:** Ukraine (Europe), Southern Europe (Europe), Egypt (Africa), East Africa (Africa), Afghanistan, India
37. **India:** Middle East, Afghanistan, China, Siam
38. **Siam:** India, China, Indonesia (Australia)

### Australia (4 Territories)
39. **Indonesia:** Siam (Asia), New Guinea, Western Australia
40. **New Guinea:** Indonesia, Western Australia, Eastern Australia
41. **Western Australia:** Indonesia, New Guinea, Eastern Australia
42. **Eastern Australia:** New Guinea, Western Australia

---
*End of Game Design Document.*
