# Portability Strategy

## Target order

### Phase 1
- Windows PC
- Browser
- itch.io

### Phase 2
- Linux
- macOS

### Phase 3
Evaluate:
- Nintendo Switch
- other modern platforms

### Experimental retro ports
- Game Boy Color
- NES
- C64

These should be considered separate platform implementations using the same game rules/content concepts rather than assuming the PC build can simply be compiled for them.

## Why the architecture matters

Retro platforms have radically different:

- memory limits
- display resolutions
- input systems
- audio systems
- asset formats
- CPU performance
- storage constraints

Therefore the core rules must remain simple and portable.

## Portable core requirements

Avoid in the game core:

- filesystem calls
- browser APIs
- OS-specific APIs
- engine-specific rendering calls
- direct audio calls
- direct input device calls

Prefer pure data and functions.

## Retro-friendly content

Monster definitions should be exportable into a reduced format.

Example:

```text
Monster
- ID
- HP
- Movement
- Power
- Speed
- Shield
- Dice layout
- Special ID
- sprite ID
```

A future GBC/NES/C64 port can replace high-resolution art with platform-specific sprites while preserving the gameplay definition.

## Resolution independence

The board logic must not depend on screen resolution.

The renderer decides how a board cell is displayed.

## Audio abstraction

The game core should request:

```text
PLAY_SFX("dice_roll")
PLAY_SFX("battle_hit")
PLAY_MUSIC("battle")
```

The platform layer decides which audio asset is used.

## Save abstraction

The game core should request abstract save/load operations.

The platform can implement:

- desktop files
- browser local storage / IndexedDB
- console save data
- retro cartridge/save memory

## Browser

The browser build should be a first-class platform, not a separate game.

It must support:

- offline play after installation/cache
- keyboard
- gamepad where supported
- local editor data
- local content
- no mandatory account

## itch.io

The release package should support:

- downloadable desktop build
- browser build
- clear controls
- fullscreen
- pause
- local multiplayer

The browser build should not require an external server for gameplay.
