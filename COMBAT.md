# Combat System

## Overview

A battle has two distinct phases:

1. **Dice Preparation**
2. **Real-Time Combat**

Both phases belong to one battle transaction.

The board turn is paused until the battle finishes.

---

# Phase 1: Dice Preparation

Both players prepare their creature independently.

Each player receives five dice.

## Initial roll

Roll all five dice.

Example:

`2 6 6 3 1`

The player may lock individual dice.

Locked dice are kept on the next roll.

Unlocked dice are rerolled.

## Rerolls

Each player has up to **two rerolls**.

Suggested flow:

### Roll 1
All five dice are rolled.

### Lock
Player locks any number of dice.

### Roll 2
Only unlocked dice are rolled.

### Lock
Player may change which dice are locked.

### Roll 3
Only remaining unlocked dice are rolled.

After roll 3 the result is final.

The player may also choose to stop early.

## Simultaneous vs sequential preparation

The first implementation should use sequential local-player preparation for clarity:

1. Player 1 prepares.
2. Hide Player 1's allocation.
3. Player 2 prepares.
4. Reveal both builds.
5. Start combat.

A later setting may allow simultaneous/local hidden input.

---

# Dice allocation

Five final dice are assigned to available stat slots.

The default stat categories are:

- Speed
- Power
- Shield
- Special
- Block

The exact number of dice assigned to each category is controlled by the creature definition.

A creature can therefore have different allocation layouts.

Example:

```text
SPEED   [ die ] [ die ]
POWER   [ die ]
SHIELD  [ die ]
SPECIAL [ die ]
```

A creature may have fewer/more slots in a category.

## Dice values

Standard dice values:

`1, 2, 3, 4, 5, 6`

The game must not assume that every future ruleset uses six-sided dice. Dice type should be configurable.

---

# Stat conversion

The recommended initial model is additive.

If a slot receives dice:

`2 + 5 + 6`

then the category receives:

`13`

The creature's base stat and dice bonus are separate.

Example:

```text
Base Power: 20
Dice Power: 13
Combat Power: 33
```

The final formula should be centralized in the rules engine.

Do not scatter formulas throughout UI or combat code.

---

# Speed

Speed represents movement on the board and may also influence combat if the creature definition says so.

For board movement:

```text
movement allowance = creature base movement
```

Dice-based Speed bonuses are temporary combat modifiers unless the ruleset explicitly says otherwise.

---

# Power

Power affects offensive combat.

The first implementation should define Power as an abstract offensive budget rather than tying it directly to one specific weapon or animation.

A combat adapter converts Power into actual attacks/damage.

---

# Shield

Shield reduces incoming damage according to the configured combat formula.

The first implementation should use:

```text
damage_taken = max(1, incoming_damage - effective_shield)
```

unless a creature/ruleset explicitly overrides it.

Keep this formula configurable.

---

# Block

Block is a defensive dice category.

Recommended initial behavior:

- A successful Block provides a temporary defensive resource.
- The exact implementation may be configured per ruleset.

Do not make Block a second hidden health bar unless explicitly designed that way.

---

# Special

Special is activated if the final dice allocation satisfies the creature's Special requirement.

Example:

```text
Requirement:
SPECIAL slots must contain only ODD values.

Dice:
1, 3

Result:
SPECIAL ACTIVE
```

Example:

```text
Requirement:
SPECIAL slots must contain only EVEN values.

Dice:
2, 6

Result:
SPECIAL ACTIVE
```

---

# Special requirement engine

Implement requirements as composable predicates.

Suggested API concept:

```text
Requirement
 ├── AllOdd
 ├── AllEven
 ├── AnyOdd
 ├── AnyEven
 ├── Pair
 ├── TwoPair
 ├── ThreeOfKind
 ├── FourOfKind
 ├── FullHouse
 ├── Straight
 ├── SumAtLeast
 ├── SumAtMost
 ├── AllDifferent
 └── And / Or / Not
```

The editor should expose friendly controls for these.

---

# Battle start

After both players finish:

1. Validate both allocations.
2. Calculate temporary combat stats.
3. Activate Special abilities.
4. Spawn combat entities.
5. Start battle.
6. Track HP.
7. Resolve combat until one creature reaches 0 HP.
8. Return remaining HP to the board state.

---

# Battle result

Possible outcomes:

- attacker wins
- defender wins
- both die
- draw

The initial game should normally end battles when one creature dies.

However, the core should support simultaneous death.

If both creatures reach 0 HP during the same combat tick:

```text
result = DRAW
```

Both creatures are removed unless the ruleset specifies another behavior.

---

# Determinism

The combat simulation should support a seeded RNG.

A battle can therefore be reproduced from:

- game seed
- board state
- creature IDs
- dice results
- player inputs

This is valuable for:

- debugging
- automated tests
- replays
- future networking
- balance testing

---

# Battle state machine

Recommended states:

```text
BATTLE_INTRO
DICE_ROLL_1
DICE_LOCK_1
DICE_ROLL_2
DICE_LOCK_2
DICE_ROLL_3
DICE_ALLOCATION
BATTLE_REVEAL
BATTLE_ACTIVE
BATTLE_RESULT
RETURN_TO_BOARD
```

The state machine should reject invalid actions for the current state.
