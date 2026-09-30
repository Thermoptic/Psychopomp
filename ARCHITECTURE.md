# Technical Architecture

## Goal

Build the first version for PC and browser while keeping the game rules portable enough for future platform-specific ports.

## Core principle

Separate:

```text
GAME CORE
CONTENT
PLATFORM
RENDERER
INPUT
AUDIO
UI
```

The rules engine must not know whether it is running on:

- Windows
- Linux
- macOS
- browser
- future console
- future retro hardware

## Recommended high-level architecture

```text
                    ┌─────────────────────┐
                    │      GAME CORE      │
                    │                     │
                    │ Board Rules         │
                    │ Turn Rules          │
                    │ Dice Rules          │
                    │ Combat Rules        │
                    │ Victory Rules       │
                    │ RNG                 │
                    │ State Machine       │
                    └─────────┬───────────┘
                              │
                    ┌─────────▼───────────┐
                    │   CONTENT SYSTEM    │
                    │                     │
                    │ Monsters            │
                    │ Board Definitions   │
                    │ Specials            │
                    │ Content Packs       │
                    └─────────┬───────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
   ┌──────▼──────┐     ┌──────▼──────┐     ┌──────▼──────┐
   │    INPUT    │     │  RENDERING  │     │    AUDIO    │
   │ keyboard    │     │ board       │     │ music       │
   │ gamepad     │     │ combat      │     │ SFX         │
   │ mouse       │     │ UI          │     │ ambience    │
   └─────────────┘     └─────────────┘     └─────────────┘
```

## Recommended implementation approach

The project should use a mainstream engine/framework that can ship:

- Windows PC
- Linux
- macOS
- Web

The exact engine choice should be recorded in the project configuration rather than mixed into game-rule documentation.

If using Godot:

```text
Game Core -> GDScript/C# domain layer
Renderer -> Godot
Input -> Godot InputMap
Audio -> Godot Audio
Web -> Godot Web export
```

If using a custom C++/SDL architecture:

```text
Game Core -> portable C++
Renderer -> SDL/OpenGL/etc.
Web -> Emscripten
Desktop -> SDL
```

The critical requirement is the separation, not the engine brand.

## Deterministic game state

Create one authoritative game state object.

Conceptually:

```text
GameState
 ├── board
 ├── players
 ├── creatures
 ├── powerPoints
 ├── turn
 ├── battle
 ├── rngSeed
 └── matchResult
```

UI should render this state.

UI events should generate commands.

Example:

```text
MOVE_CREATURE
START_BATTLE
ROLL_DICE
LOCK_DIE
UNLOCK_DIE
REROLL
ALLOCATE_DIE
END_ALLOCATION
```

## Command architecture

Prefer:

```text
Input -> Command -> Rules Engine -> New State -> Renderer
```

instead of:

```text
Input -> directly modify UI/game objects
```

This makes:

- testing easier
- replays possible
- future networking possible
- retro ports easier
- debugging easier

## RNG

Use a dedicated RNG service owned by the core.

Do not use platform-specific random calls in gameplay code.

The RNG must support:

- seed
- next integer
- next float if needed
- deterministic reproduction

## Save system

Offline save data should include:

- settings
- editor content
- unlocked/approved content
- custom rosters
- optional campaign/match state

Use versioned save data.

Example:

```json
{
  "saveVersion": 1,
  "contentVersion": 1,
  "settings": {},
  "editorContent": []
}
```

## Browser constraints

The browser build must work without a server.

No gameplay feature may require:

- authentication
- database
- cloud save
- external API
- network request

for core play.

Optional online features can be added later.

## Asset loading

All official gameplay assets should be bundled locally.

User-created content should be loaded from a supported local content directory or browser storage mechanism.

## Debug mode

Provide a developer/debug overlay that can show:

- game state
- RNG seed
- selected creature
- legal moves
- Power Point ownership
- battle stats
- dice results
- Special predicates
- frame/tick information

Debug tools must be disabled or hidden in the normal release UI.
