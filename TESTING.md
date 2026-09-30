# Testing Strategy

## Goal

Psychopomp has a rules-heavy deterministic core. The rules engine must be heavily tested before visual polish is treated as complete.

## Unit tests

Test:

### Board
- legal movement
- illegal movement
- movement limits
- occupied cells
- Power Point capture
- turn progression

### Victory
- all five Power Points
- zero remaining creatures
- ongoing match
- simultaneous terminal conditions

### Dice
- six-sided results
- locking
- unlocking
- reroll count
- final allocation
- invalid allocation
- deterministic seeds

### Special requirements
Test every predicate:

- odd
- even
- pair
- two pair
- three of a kind
- four of a kind
- full house
- straight
- sum threshold
- all different
- AND
- OR
- NOT

### Combat
- damage
- shield
- minimum damage
- HP reduction
- death
- simultaneous death
- battle result
- persistent HP

### Content
- valid creature
- invalid creature
- duplicate IDs
- missing assets
- invalid Special
- invalid dice layout

## Integration tests

Test full flows:

```text
Move -> Capture -> Dice -> Combat -> Death -> Board
```

and:

```text
Move -> Capture -> Dice -> Combat -> Survive -> Board -> Later Battle
```

## Critical regression test

A creature that survives with 1 HP must enter the next battle with exactly 1 HP.

This should have an explicit regression test.

## Determinism test

Given:

- same initial state
- same RNG seed
- same commands

the final state must be identical.

## Editor tests

Test:

- create creature
- edit creature
- save
- reload
- test battle
- export
- import
- validation failure

## Browser tests

Verify:

- game starts offline
- gamepad input
- keyboard input
- local editor data
- asset loading
- save/load

## Manual playtest checklist

- Is the board readable?
- Is it obvious whose turn it is?
- Is it obvious where a creature can move?
- Is the dice lock state obvious?
- Is the reroll count obvious?
- Is the Special requirement understandable?
- Is the transition into combat clear?
- Is persistent HP obvious?
- Is victory obvious?
- Can two people understand the controls without developer help?
