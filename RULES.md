# Rules

## 1. Players

Psychopomp supports exactly two players in the initial version.

### Player 1
- owns one faction
- takes the first turn by default

### Player 2
- owns the opposing faction
- takes the second turn

Turn order should be configurable for testing.

## 2. Board

The board is a square grid.

The initial implementation should support a classic Archon-like central tactical board while keeping the board dimensions configurable.

Recommended initial configuration:

- 9 × 9 cells
- 5 Power Point cells
- alternating/typed board cells if required by the final ruleset

The board dimensions must not be hard-coded into gameplay systems.

## 3. Movement

Every creature has a movement allowance.

Example:

`Speed = 3`

means the creature may move up to three legal board steps during its turn.

Movement is validated by the rules engine.

The UI may preview legal moves but must never decide whether a move is legal.

## 4. Occupied cells

A creature may:

- move through legal empty cells according to movement rules
- move onto/capture an opposing creature's cell if the rules permit
- capture/contest Power Points according to the configured Power Point rules

An illegal movement attempt must have no gameplay effect.

## 5. Battle trigger

When a player's creature enters a cell occupied by an opposing creature:

1. Freeze the board state.
2. Record attacker and defender.
3. Open the Dice Phase.
4. Resolve both players' dice allocation.
5. Start the real-time battle.
6. Determine the winner.
7. Apply remaining HP.
8. Return to the board.
9. Remove the defeated creature if HP reaches 0.
10. Preserve the surviving creature's remaining HP.
11. Continue with the next player's turn.

## 6. Creature death

A creature dies when:

`HP <= 0`

A dead creature is removed from the board and is no longer part of the player's active roster.

## 7. Persistent HP

This is a core Psychopomp rule.

If a creature enters battle with 12 HP and survives with 3 HP:

- it returns to the board with 3 HP
- the next battle begins with 3 HP
- it does not automatically heal

This creates strategic value in:

- finishing weakened enemies
- avoiding dangerous battles
- controlling Power Points with wounded creatures

## 8. Victory by elimination

If a player has no living creatures remaining:

`Opponent wins`

This condition takes precedence over normal turn progression.

## 9. Victory by Power Points

A player controlling all five Power Points wins.

The game should evaluate this after:

- movement
- captures
- battle resolution
- Power Point ownership changes

## 10. Draw handling

The initial version should not introduce complicated draw rules.

The rules engine should nevertheless expose a match result enum:

- `PLAYER_1`
- `PLAYER_2`
- `DRAW`
- `ONGOING`

This leaves room for future stalemate rules.

## 11. No hidden gameplay state

All state relevant to victory or combat must exist in the deterministic game state.

Do not rely on:

- UI state
- animation state
- DOM state
- renderer state
- audio state

for determining gameplay outcomes.
