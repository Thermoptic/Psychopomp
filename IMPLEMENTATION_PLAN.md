# Implementation Plan — Vertical Slice 1

## Technology

| Concern | Choice | Why |
|---|---|---|
| Language | TypeScript (strict) | Portable, typed game core; runs in browser and Node (tests) |
| Build | Vite | Static offline build (`dist/`), relative paths, itch.io-ready |
| Tests | Vitest | Same module system as the game; core tested headless |
| Rendering | HTML5 Canvas 2D | No engine dependency; renderer is a replaceable layer |
| Runtime deps | **none** | Only dev dependencies (vite, typescript, vitest) |

Desktop builds (Windows/Linux/macOS) can later wrap the same web build
(e.g. Electron/Tauri) — not part of this slice.

## Layers

```text
content/packs/base/      JSON data: ruleset, board, creatures (no code)
src/core/                GAME CORE — pure TS, no DOM/browser/Node APIs
  types.ts               all state / content / command types
  rng.ts                 seeded deterministic RNG (mulberry32, state in GameState)
  board/                 legal movement, Power Points
  dice/                  roll / lock / reroll / allocation, Special requirements
  combat/                battle stats, Special effects, fixed-tick combat simulation
  battle/                battle state machine (dice → reveal → combat → result)
  rules/                 victory
  state/                 createMatch, applyCommand (the only way to change state)
src/content/             content validation + loading (pure)
src/platform/web/        bundles content pack via Vite (browser-specific)
src/input/               abstract actions, keyboard + gamepad → per-player actions
src/audio/               maps core events → generated WebAudio blips
src/rendering/           Canvas renderer (reads state, never decides rules)
src/app/                 screen flow + UI state (cursor, selection) → commands
tests/                   Vitest suites for the core
```

Flow: `input → abstract action → app controller → Command → applyCommand → new GameState (+ events) → render / audio`.

## Order of work

1. Core types, RNG, content validation + base content pack
2. Board: movement, Power Points, turns, victory
3. Dice: roll/lock/reroll/allocation, requirement engine
4. Combat: battle stats, Special effects, fixed-tick real-time simulation
5. Battle state machine + persistent HP write-back
6. Tests (unit, integration, determinism, persistent-HP regression, full simulated match)
7. Input layer, renderer, app screens (menu → match → battle → victory)
8. Verify in browser

## Assumptions made for this slice (see OPEN_QUESTIONS.md)

All of these are data in `content/packs/base/ruleset.json` or `boards/classic.json`
unless marked *code*.

| Question | Decision for now | Where to change |
|---|---|---|
| Board size / PP locations | 9×9, PPs at the 4 edge midpoints + centre | `boards/classic.json` |
| Diagonal movement | No (orthogonal steps) | `allowDiagonal` |
| Move through creatures | No | `passThroughCreatures` |
| Can movement stop early | Yes — any reachable cell within `movement` steps | *code* (`board/movement.ts`) |
| Entering enemy cell | Always starts a battle; the path ends there | *code* |
| PP capture | A PP belongs to the last player whose creature stood on it (ownership persists after leaving) | *code* (`board/powerPoints.ts`) |
| Roster | 3 creatures per side (P1: 3× Glubber, P2: 3× Shroud) | `boards/classic.json` placements |
| No legal moves | Player may `PASS_TURN` only if no creature has a legal move | *code* |
| Dice preparation order | Sequential: attacker first, then defender | *code* |
| Special activation | Automatic at reveal, lasts the whole battle | *code* |
| Dice → stats | Additive: battle stat = base + sum of dice in category + Special | `combat/stats.ts` |
| Damage | `max(minDamage, power − shield)` | ruleset `combat.minDamage` |
| Speed in combat | Faster movement and shorter attack cooldown | ruleset `combat.*` |
| Block | Block dice → guard charges (`floor(block / blockChargeDivisor)`). Pressing BLOCK spends a charge for a short guard window that negates hits. Not an extra HP bar. | ruleset |
| Combat style | Real-time, 60 ticks/s fixed step, integer maths, melee with wind-up | ruleset `combat.*` |
| Simultaneous death | Supported → `DRAW`, both removed | *code* |
| Combat timeout | After `timeoutTicks` (90 s) the attacker withdraws to its origin cell; both keep HP | ruleset |
| Healing | None anywhere | — |
