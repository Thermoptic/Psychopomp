# Built-in Content Editor

## Purpose

Psychopomp includes an in-game editor for creating and testing creatures before adding them to the official roster.

The editor is not the same thing as the development toolchain.

A player/designer should be able to:

1. Create a monster.
2. Give it a name.
3. Upload/select artwork.
4. Set stats.
5. Define dice slots.
6. Define Special requirements.
7. Define Special effects.
8. Save it.
9. Test it immediately.
10. Return and rebalance it.
11. Export it as a content pack.

## Editor sections

### 1. Creature identity

Fields:

- ID
- Name
- Description
- Faction
- Tags

### 2. Artwork

Controls:

- portrait upload
- board sprite upload
- combat sprite upload
- icon upload

Show image previews.

Support drag-and-drop where the platform allows it.

### 3. Base stats

Editable:

- Max HP
- Movement
- Power
- Speed
- Shield

Each field should show:

- current value
- minimum
- maximum
- reset/default option

### 4. Dice layout

Visual editor:

```text
SPEED    [ ] [ ]
POWER    [ ]
SHIELD   [ ]
SPECIAL  [ ]
BLOCK    [ ]
```

Allow the designer to choose:

- number of slots
- category
- display order

The editor must always show that the total number of dice equals five for the default ruleset.

### 5. Special requirement

Provide a visual requirement builder.

Example:

```text
SPECIAL
[ ALL ] [ ODD ]
```

or:

```text
SPECIAL
[ SUM ] [ >= ] [ 12 ]
```

Advanced mode can expose the underlying expression/data.

### 6. Special effect

Provide effect types such as:

- add power
- add shield
- add speed
- heal
- damage
- shield break
- temporary invulnerability
- projectile modification
- movement modification
- custom scripted effect (advanced)

Effects must be validated.

### 7. Preview

The editor should display a live creature card.

Show:

- artwork
- name
- HP
- movement
- stats
- dice slots
- Special requirement

### 8. Test Battle

A `TEST BATTLE` button should launch the creature into a sandbox battle.

Suggested test options:

- Player 1 creature
- Player 2 creature
- choose opponent
- fixed seed
- infinite HP toggle
- show combat debug information

The test must never modify the official content unless explicitly saved.

### 9. Save states

Creature states:

- Draft
- Tested
- Approved
- Archived

Only approved content should appear in the default match roster.

### 10. Export

Export:

- individual creature
- selected creatures
- complete content pack

The export must be portable.

## Editor safety

The editor must never allow malformed content to enter a normal match.

Validate before:

- save
- test
- export
- load

## Editor UX

The editor should feel like part of the same game.

Do not build a generic web-admin dashboard.

Use the Psychopomp visual language:

- dark panels
- metal frames
- pixel typography
- faction accents
- chunky controls
- strong hover/selected states
