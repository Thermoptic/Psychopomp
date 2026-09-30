# Claude Code Implementation Instructions

## Mission

Build Psychopomp as a complete playable vertical slice before expanding content.

Do not start by building a huge editor or a huge number of monsters.

First make the complete loop work:

```text
Main Menu
 -> New Match
 -> Board
 -> Move
 -> Capture
 -> Dice Phase
 -> Combat
 -> Result
 -> Board
 -> Next Turn
 -> Victory
```

## Implementation order

### Step 1 — Project foundation

Create:

- project structure
- game state
- board model
- player model
- creature model
- turn state machine
- deterministic RNG
- input abstraction

No polished art required.

### Step 2 — Board prototype

Implement:

- grid
- two players
- creatures
- movement
- five Power Points
- turn switching
- win by Power Points
- win by elimination

Use temporary graphics.

### Step 3 — Dice phase

Implement:

- five dice
- roll
- lock/unlock
- two rerolls
- final allocation
- validation

### Step 4 — Combat

Implement:

- attacker/defender
- temporary battle stats
- Special activation
- real-time combat
- HP
- death
- survivor persistence

### Step 5 — Full loop

Connect board and combat.

This is the first major milestone.

### Step 6 — Content system

Move creatures into external data.

No creature should require a code change to alter:

- name
- HP
- movement
- stats
- dice layout
- Special requirement
- Special effect

### Step 7 — Editor

Build the in-game editor.

### Step 8 — Input

Add:

- keyboard
- two gamepads
- remapping architecture

### Step 9 — Art/audio

Replace placeholders.

### Step 10 — Browser/itch.io

Create production web build and offline behavior.

## Coding rules

### Rule 1
Do not put gameplay logic inside UI components.

### Rule 2
Do not put gameplay logic inside rendering code.

### Rule 3
Do not hard-code monster behavior.

### Rule 4
Do not use uncontrolled random calls.

### Rule 5
Every important gameplay transition must be represented by a state.

### Rule 6
Every rule that can affect victory must be testable without rendering the game.

### Rule 7
Prefer small systems with clear interfaces.

## Suggested module structure

```text
src/
  core/
    board/
    battle/
    combat/
    dice/
    entities/
    rules/
    state/
    rng/
    victory/

  content/
    loader/
    validation/
    schema/

  input/
    keyboard/
    gamepad/

  rendering/
    board/
    battle/
    ui/

  editor/
    creature/
    content-pack/

  audio/

  platform/

  tests/
```

Adjust the exact folders to the chosen engine/framework.

## Vertical slice requirement

Before creating dozens of monsters, create exactly enough content to prove the game:

- 2 test creatures
- 1 Power Point setup
- 1 complete battle
- 1 Special based on ODD
- 1 Special based on EVEN

The game must be fun enough to play through a complete match with placeholder art before production content begins.

## Definition of done for a milestone

A milestone is not complete because the screen looks correct.

It is complete when:

- gameplay works
- invalid states are rejected
- tests pass
- save/load works where applicable
- no gameplay rule is trapped in UI code
- the feature works with keyboard
- the feature is compatible with gamepad architecture

## Do not over-engineer

Avoid adding:

- online multiplayer
- accounts
- cloud saves
- matchmaking
- live services
- unnecessary dependency systems

before the offline local game is complete.

## First task

Read all project `.md` files before implementing.

Then create a short implementation plan and begin with the game core.

Do not start with visual polish.
