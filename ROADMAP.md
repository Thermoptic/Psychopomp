# Roadmap

## Milestone 0 — Project setup

- [x] Choose engine/framework
- [x] Initialize repository
- [ ] Establish coding conventions
- [x] Establish test framework
- [ ] Add project documentation
- [x] Add placeholder assets

## Milestone 1 — Board prototype

- [x] Grid
- [x] Five Power Points
- [x] Two factions
- [x] Creature placement
- [x] Movement
- [x] Turn switching
- [x] Power Point ownership
- [x] Elimination victory

## Milestone 2 — Dice prototype

- [x] Five dice
- [x] Roll
- [x] Lock
- [x] Unlock
- [x] Reroll
- [x] Two rerolls
- [x] Allocation
- [x] Validation

## Milestone 3 — Combat prototype

- [x] Battle transition
- [x] Temporary stats
- [x] Special activation
- [x] Combat movement
- [x] Attack
- [x] Damage
- [x] Shield
- [x] Death
- [x] Battle result

## Milestone 4 — Persistent HP

- [x] Store remaining HP
- [x] Return survivor to board
- [x] Start next battle with stored HP
- [x] Regression tests

## Milestone 5 — Complete vertical slice

- [x] Full match
- [x] Win conditions
- [x] Restart
- [x] Pause
- [x] Keyboard
- [~] Two gamepads (implemented, not yet tested with physical pads)

## Milestone 6 — Content system

- [x] JSON/schema
- [x] Content validation
- [ ] Content packs
- [ ] External assets
- [ ] Versioning

## Milestone 7 — Editor

- [ ] Creature creation
- [ ] Artwork upload
- [ ] Stats
- [ ] Dice layout
- [ ] Special requirements
- [ ] Special effects
- [ ] Save
- [ ] Test Battle
- [ ] Import/export

## Milestone 8 — Production presentation

- [ ] Final UI
- [ ] Pixel art
- [ ] Animation
- [ ] SFX
- [ ] Music
- [ ] Menus
- [ ] Settings
- [ ] Controller glyphs

## Milestone 9 — PC release

- [ ] Windows build
- [ ] Linux build
- [ ] macOS build
- [ ] Save/load
- [ ] Controller support
- [ ] Offline verification

## Milestone 10 — Browser/itch.io

- [ ] Web build
- [ ] Offline-capable build
- [ ] Keyboard support
- [ ] Gamepad support
- [ ] Editor local storage
- [ ] Itch.io page
- [ ] Web controls/instructions

## Milestone 11 — Future ports

Evaluate independently:

- [ ] Switch
- [ ] Game Boy Color
- [ ] NES
- [ ] C64

The retro ports should reuse:

- rules
- creature definitions
- dice logic
- board definitions
- Special definitions

but may use entirely different:

- renderer
- audio
- input
- asset formats
- UI
