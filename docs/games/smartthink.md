# Game Design Document: Smartthink

## Game Overview

Title: Smartthink
Genre: Logic, Deduction, Puzzle
Players: 2 (Asymmetric roles)
Target Audience: Ages 8 to Adult
Play Time: 15–20 minutes per round
Core Hook: A pure test of logic and deduction where one player builds a secret code and the other uses process of elimination and deductive reasoning to crack it before time runs out.

## Physical Components

The physical design is purely functional, built to track guesses and feedback sequentially.

* The Decoding Board: A plastic board featuring a shield at one end to hide the secret code, and 10 to 12 sequential rows. Each row contains:
  * 4 Large Holes: For the Codebreaker to place their guesses.
  * 4 Small Holes: Grouped together next to the large holes, for the Codemaker to place feedback pegs.
* Code Pegs (~72 total): Large, round-headed pegs in 6 distinct colours (typically Red, Blue, Green, Yellow, Black, and White).
* Key Pegs (~30 total): Smaller, flat-headed pegs in 2 colours (Black and White). These are used exclusively to provide feedback.

## Core Gameplay Loop

The game relies on asymmetric player roles: the Codemaker and the Codebreaker.
Players typically agree to play an even number of rounds, swapping roles each time.

### Setup

The Codemaker secretly chooses 4 Code Pegs and places them in the 4 holes behind the shield.

* They may use any combination of the 6 available colours.  
* Duplicates are allowed (e.g., Red-Red-Blue-Green).
* The Codebreaker looks away while this is set up.

### The Guess

The Codebreaker places 4 Code Pegs into the first available row on the decoding board, attempting to replicate the exact colours and positions of the secret code.

### The Feedback

The Codemaker evaluates the guess against the secret code and places Key Pegs into the small holes next to the guess row based on strict rules:

* Black Key Peg: Awarded for a Code Peg that is the correct colour AND in the correct position.
* White Key Peg: Awarded for a Code Peg that is the correct colour, but in the WRONG position.
* No Peg: If a colour does not appear in the secret code at all, no Key Peg is placed for it.

Crucial Rule: The position of the Key Pegs does not correspond to the positions of the Code Pegs.
If the Codemaker places one Black Key Peg, the Codebreaker knows one of their four pegs is perfect, but they do not know which one.

### Iteration

The Codebreaker uses the feedback from all previous rows to inform their next guess.
This loop continues until the code is broken or the board is filled.

## Mechanic Details: Handling Duplicates

The most complex design element of Smartthink is how the feedback system handles duplicate colours in either the secret code or the guess.
The game uses a strict 1-to-1 matching priority:

* Black Pegs take priority. Always evaluate exact matches (colour and position) first.
* One peg matches one peg. A single Code Peg in the secret code can only generate one Key Peg per turn.

Example Scenario:

* Secret Code: Red - Red - Blue - Green
* Guess: Red - Red - Red - Yellow
* Feedback: The Codemaker awards exactly Two Black Pegs (for the first two Reds). The third Red in the guess receives nothing, because there is no third Red in the secret code to match it with.

## Mathematical Constraints & Game Balance

Smartthink's balance is built on permutation math.With 6 colours and 4 slots (allowing duplicates), the total number of possible secret codes is calculated as:

$$6^4 = 1296 \text{ permutations}$$

Why 10-12 rows?

Mathematically, a purely logical Codebreaker can solve any standard Smartthink code in 5 guesses or fewer.
(In 1976, computer scientist Donald Knuth famously proved this using a minimax algorithm).
Providing 10 to 12 rows gives human players enough buffer to make minor deductive errors while still feeling pressure as they near the end of the board.  

## Win/Loss Conditions & Scoring

* Codebreaker Wins the Round: If they place a guess that exactly matches the secret code, resulting in 4 Black Key Pegs.
* Codemaker Wins the Round: If the Codebreaker fills the final row on the board without successfully guessing the code

### Scoring (Optional Tournament Rule)

The Codemaker scores 1 point for every guess the Codebreaker makes.
If the Codebreaker fails to break the code entirely, the Codemaker scores points equal to the total number of rows + 1 bonus point.
After all agreed rounds are played, the player with the most points wins.

## Variations & Expansions

To extend the replayability of the game, players can adjust the difficulty parameters:

* Empty Slots (Advanced): Players agree that empty holes are allowed in the secret code. This effectively treats "empty" as a 7th colour, increasing the permutations to $7^4 = 2401$.
* Super Smartthink: A physical variant that expands the board to 5 slots and 8 colours, drastically increasing the complexity to $8^5 = 32768$ permutations.
