# Balance Framework

## Purpose

Psychopomp has two major sources of balance:

1. Board mobility and strategic position.
2. Battle preparation and combat power.

A creature should not be balanced only by HP.

## Important variables

### Board
- movement
- starting position
- Power Point access
- terrain interaction
- capture potential

### Creature
- max HP
- movement
- Power
- Speed
- Shield
- dice slot distribution
- Special reliability
- Special impact
- combat mobility

## Dice allocation balance

A creature with more useful dice slots should compensate elsewhere.

Example:

```text
High Power
+ strong Special
- low movement
- low HP
```

is a different strategic role from:

```text
High HP
+ strong Shield
- weak Power
- weak Special
```

## Special balance

Special abilities should have:

- a clear requirement
- a visible benefit
- a reason not to be automatic
- counterplay

Avoid Specials that are effectively guaranteed every battle unless that is an intentional creature identity.

## Testing methodology

For balance testing, support fixed seeds.

Run repeated simulations with controlled conditions.

Track:

- win rate
- average surviving HP
- average battle duration
- Special activation rate
- average damage
- number of rerolls used
- board movement before engagement

These statistics are for development analysis, not player-facing ratings.

## Balance philosophy

The goal is not to make every creature mathematically identical.

The goal is to make different creatures produce meaningful strategic choices.
