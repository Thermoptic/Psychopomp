# Game Design Document

## 1. High concept

Psychopomp is a two-player tactical board game where strategic positioning determines **who fights whom**, while a short dice-building phase determines **how prepared each creature is when the fight begins**.

The player does not directly choose every combat stat numerically. Instead, each battle begins with five dice. The player rolls, locks useful dice, rerolls the remaining dice up to two times, then assigns the final dice to the creature's stat slots.

This creates two layers of decision-making:

- **Macro:** where to move creatures on the board.
- **Micro:** how to build the creature for the upcoming battle.

## 2. Match structure

A match consists of alternating turns.

### Player turn

1. Select one of the player's creatures.
2. Move it according to its movement allowance and the board's movement rules.
3. If it enters an opposing creature's occupied square, start a battle.
4. If it reaches/captures a Power Point, update ownership.
5. Resolve the turn.
6. Pass control to the other player.

A creature that survives a battle remains on its square with its remaining HP.

## 3. Victory

A player wins when either:

- they control all five Power Points, or
- the opponent has no remaining creatures.

The game should detect both conditions immediately after relevant board-state changes.

## 4. Five Power Points

The board contains five strategic Power Point locations.

Power Points are visually distinct from ordinary board cells.

Ownership should be represented clearly:

- neutral
- Player 1
- Player 2

The exact capture/contest behavior should be implemented as a data-driven board rule rather than embedded in UI code.

## 5. Creatures

Every creature has a persistent base profile.

Minimum fields:

- Name
- ID
- Artwork
- Maximum HP
- Starting HP
- Movement
- Power
- Speed
- Shield
- Special ability
- Dice requirements for Special

A creature can also have optional:

- attack type
- movement type
- size
- animation set
- sound set
- color/faction tint
- description
- tags

## 6. Battle philosophy

The battle system should feel like:

> Build your monster, then fight with what you built.

The dice phase should be fast enough that a normal battle does not become a long accounting exercise.

The real-time battle itself should be readable and skill-based.

## 7. Persistence

The following must persist after battle:

- creature identity
- board position
- remaining HP
- Power Point ownership
- player roster state

The temporary dice build does **not** automatically become permanent creature stats.

A creature's base stats are defined by its content definition. The dice allocation creates a temporary combat modifier for that battle.

## 8. Design principle: temporary combat build

Example:

A creature has:

- HP: 20
- Speed: 3
- Power: 4
- Shield: 2

The player rolls:

`6 5 4 2 1`

They may assign:

- 6 + 5 -> Power
- 4 -> Speed
- 2 -> Shield
- 1 -> Special

The creature now fights with its temporary battle modifiers.

When the battle ends, those dice bonuses disappear. Remaining HP does not.

## 9. Special abilities

Each creature can define a Special requirement.

Examples:

- `ODD` — all dice assigned to this requirement must be odd.
- `EVEN` — all dice assigned to this requirement must be even.
- `PAIR` — requires a pair.
- `TRIPLE` — requires three equal values.
- `SUM >= 12`
- `ALL DIFFERENT`
- `STRAIGHT`
- custom requirement composed from multiple conditions.

The first implementation should support a generic requirement system rather than hard-coding only ODD and EVEN.

## 10. Accessibility and readability

Important combat information must remain readable at a glance:

- HP
- current temporary stats
- dice
- locked dice
- rerolls remaining
- Special state
- player ownership
- board position

Do not communicate critical state using color alone.

## 11. Visual direction

The supplied mockup establishes the intended visual language:

- dark industrial/fantasy interface
- distressed metal
- CRT/arcade/game-terminal feeling
- strong faction colors
- chunky pixel/low-resolution creature art
- large readable stat panels
- central board
- high-contrast tactical information

The implementation should treat the mockup as a visual reference, not as a requirement to reproduce every pixel.

Reference image:

`Psychopomp_mockup.png`
