# Content System

## Goal

All monsters must be content data, not hard-coded gameplay classes.

A content definition should be serializable to JSON or another portable format.

## Creature definition

Recommended structure:

```json
{
  "id": "glubber",
  "name": "Glubber",
  "description": "A swollen thing from the lower dark.",
  "faction": "neutral",
  "art": {
    "portrait": "monsters/glubber/portrait.png",
    "sprite": "monsters/glubber/sprite.png"
  },
  "stats": {
    "maxHp": 20,
    "movement": 3,
    "power": 10,
    "speed": 5,
    "shield": 4
  },
  "dice": {
    "sides": 6,
    "slots": {
      "speed": 1,
      "power": 1,
      "shield": 1,
      "special": 1,
      "block": 1
    }
  },
  "special": {
    "name": "Odd Surge",
    "requirement": {
      "type": "allOdd",
      "target": "special"
    },
    "effect": {
      "type": "addPower",
      "value": 45
    }
  }
}
```

The exact schema may evolve, but the principle must remain:

> Content describes what a creature is; systems describe how creatures behave.

## Required fields

- `id`
- `name`
- `art`
- `stats`
- `dice`
- `special`

## Optional fields

- lore
- tags
- faction
- movement type
- combat style
- sounds
- animations
- editor metadata

## IDs

IDs must be stable.

Use:

```text
glubber
shroud
void_knight
bone_wyrm
```

Do not use display names as database identifiers.

## Artwork

Artwork should be replaceable without changing gameplay data.

Recommended asset categories:

```text
portrait
board_sprite
combat_sprite
icon
animation
```

The first PC version can use larger assets. The content pipeline should also support a low-resolution export later.

## Base stats vs battle stats

Base stats are permanent content.

Battle stats are calculated at runtime:

```text
BattleStats = BaseStats + DiceModifiers + SpecialModifiers
```

Never write temporary battle stats back into the base creature definition.

## Content packs

A content pack should contain:

```text
pack.json
monsters/
board/
ui/
audio/
```

Example:

```text
content/
  packs/
    base/
      pack.json
      monsters/
        glubber/
        shroud/
```

This enables:

- official content
- experimental content
- test creatures
- future user-created packs

## Validation

Every content pack must be validated before loading.

Validation should detect:

- missing ID
- duplicate ID
- missing artwork
- invalid stat values
- impossible dice slots
- invalid Special requirement
- malformed effects
- references to missing assets

Invalid content should produce a useful error message instead of crashing the game.
