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
| Dice preparation | Simultaneous: both players get their first roll automatically and prepare in their own side panel (P1 left, P2 right) on the battle view. Per player: REROLL -> APPLY (enabled when every die is placed) -> READY (build locked). Placing the first die ends rolling. When both are READY a 3-2-1 countdown starts (exactly once), then combat. | *code* `core/battle/battle.ts`, ruleset `combat.countdownTicks` |
| Special activation | Automatic when both players are READY, lasts the whole battle | *code* |
| Dice → stats | Additive: battle stat = base + sum of dice in category + Special | `combat/stats.ts` |
| Damage | Melee: Shield takes `shieldPercentPerPoint` (5 %) per point off a hit, at most `shieldMaxPercent` (80 %): `max(minDamage, round(power × (100 − min(80, shield × 5)) / 100))` — Shield 6 = 30 % less. Projectiles and dash damage ignore Shield. | ruleset `combat.minDamage`, `shieldPercentPerPoint`, `shieldMaxPercent`; `computeDamage` |
| Speed in combat | Faster movement and shorter attack cooldown | ruleset `combat.*` |
| Block | Block dice → guard charges (`floor(block / blockChargeDivisor)`). Pressing BLOCK spends a charge for a short guard window that negates hits. Not an extra HP bar. | ruleset |
| Combat style | Real-time, 60 ticks/s fixed step, integer maths, melee with wind-up | ruleset `combat.*` |
| Combat presentation | Preparation happens on the strategic 9×9 board (only the two combatants shown). When both players are READY the board opens into a wide combat arena (`arenaColumns` × `arenaRows` = 20 × 9) as wide as the top HUD (both span the screen inside the side margin, covering the side panels) and as tall as the board, with the board's own 43 px cells and stone; P1 spawns in the leftmost column, P2 in the rightmost, both on the centre row. Arena size is ruleset data (never screen-dependent); the renderer only fits the cell size to the available area. Combat positions are temporary (`battle.combat`). | ruleset `combat.arenaColumns/arenaRows/cellUnits`, `core/combat/simulation.ts`, `rendering/arenaView.ts` |
| Simultaneous death | Supported → `DRAW`, both removed | *code* |
| Combat timeout | After `timeoutTicks` (90 s) the attacker withdraws to its origin cell; both keep HP | ruleset |
| Healing | None anywhere | — |
| Content save format | One model per content type, the game's own: `CreatureDef` and `PowerupDef`. Files: `{ format: "psychopomp-monster", formatVersion: 2, contentVersion, monster }` and `{ format: "psychopomp-powerup", formatVersion: 1, contentVersion, powerup }`. Local save: `{ saveVersion: 2, contentVersion, monsters, powerups }` in localStorage (`psychopomp.save`, shared by game and /editor on the same origin). Monster v0 (bare file) / v1 (absolute stats) and save v1 migrate automatically; newer versions are refused; invalid entries are skipped with a warning. | `content/saveFormat.ts`, `content/migrate.ts`, `content/library.ts` |
| Stat modifiers | Power/Speed/Shield/Block start at 0 (ruleset `creatureBase` 0/0/0/0): the dice placed in battle give the values (a 6 on POWER = Power 6). Monsters only store `modifiers` (default 0, ±). Battle stat = base (0) + modifier + dice + Special (floored at 0, except Dash). Dice slots are SPEED, POWER, SHIELD, DASH, BLOCK (DASH replaced the old SPECIAL slot; old data migrates). Dash value = DASH die + Dash Cooldown Modifier (`modifiers.dash`, ±) (+ Special `addDash`); it sets the dash cooldown, not the distance (see Dash). | ruleset `creatureBase`, `core/combat/stats.ts`, `resolveDash` |
| Monster placement | `player` + `position` (cell code A1..I9: row letter = y, column number = x; A1 top-left, E5 centre). Every monster with both joins the match lineup on that cell, in addition to the board's own lineup (the 3 Glubber vs 3 Shroud). Taken cells are refused. | `core/board/cells.ts`, `createMatch` |
| Special slot conditions | Requirement `{ type: "slots", slots: [...] }`: entry i checks the die in the monster's i-th dice slot (layout order SPEED, POWER, SHIELD, DASH, BLOCK): "odd", "even", 1-6, or null (unused). All used slots must match; with none set the Special never triggers. Older requirement types still work. | `core/dice/requirements.ts` |
| Powerups | Monsters reference a Powerup by `powerupId` (never a copy; none = classic melee). Melee: speed (0.5-5 s between attacks), knockback (5-50 px = 10-100 units, along the attack direction), range (56-200 units). Ranged: projectiles with speed (4-40 u/tick), range (2-20 cells), rate of fire (0.5-5 s), impact size (16-160 units radius), impact damage (1-100, guard blocks, shield does not reduce), homing (2-20 % of speed per tick), trajectory (Magnus curve only when moving while firing, 0.225°/tick per level), bounce (1-10). All mappings documented in code. | `core/combat/powerups.ts`, projectiles in `core/combat/simulation.ts` |
| Developer editor | `/editor` (separate page, not linked from the player UI): MONSTERS and POWERUPS, with DICE/UPGRADES/SETTINGS listed for later. Saved content is used by new matches. The earlier in-game EDITOR menu item was removed (the developer editor replaces it). | `editor/index.html`, `src/devEditor/` |
| Twin-stick controls | Left stick = analog movement (and dash direction), right stick = aim (last aim kept on release), RT = attack, RB = dash, LT = Special, LB unused in combat (still "previous" on the board cursor). Keyboard stays supported: digital movement and automatic aim at the opponent. Analog input reaches the core as integers -100..100, so combat stays deterministic. | `input/gamepad.ts`, `input/combatInput.ts`, `input/bindings.ts` |
| Aimed attack | The existing melee swing (wind-up, cooldown, range, damage) now resolves in the aim direction captured when the swing starts: it hits only inside a cone (`attackConeCos` = 50 -> ±60°; -100 = old all-around behaviour). | ruleset `combat.attackConeCos` |
| Hold to attack | Creatures with `attack.autoFire: true` keep attacking while RT is held; everyone else attacks once per press. | creature `attack.autoFire` |
| Dash | RB: a burst along the left-stick direction over `dash.durationTicks`; stops when it runs into the opponent. A dash needs a deliberate stick push (>= `dash.minInput` = 35 %, so drift never dashes) and room to move (no dash straight into a wall; a dash reaching a wall stops there). A refused dash costs no cooldown and shows the reason (NO DIR / BLOCKED / COOLDOWN). Fixed distance (`dash.distance` = 3 cells), not affected by the DASH die. Cooldown per fighter = max(`minCooldown` 1 s, `baseCooldown` 7 s - DASH die - Dash Cooldown Modifier (+ Special)), computed by `computeDashCooldown` (game and editor). Old monsters (format < 5) lose their distance-era `modifiers.dash`, `dash.distance` and `dash.cooldown`. Optional dash damage (off by default). | ruleset `combat.dash`; `core/combat/stats.ts`; per creature `modifiers.dash`, `dash: { distance, damage, dealsDamage }` |
| Special on LT | Specials keep their dice requirement. `activation: "auto"` (default, all current creatures) applies when both are READY as before; `"manual"` only unlocks it and LT applies it once per battle. | creature `special.activation` |
| Movement patterns | Each monster has `movement`: `{ type: "default" }` (unchanged: up to `stats.movement` cardinal steps) or `{ type: "pattern", cells }`, where cells are destination offsets relative to the monster (x right +, y down +). Patterns follow the same board rules (bounds, blocked cells, no friendly destination, enemy = battle); offsets on a straight or diagonal line need a clear path, other offsets jump (knight-like). `stats.movement` applies only to DEFAULT; Speed stays combat-only. Old monsters without the field migrate to DEFAULT (monster format / save v4). Edited in /editor -> Monsters -> MOVEMENT (9×9 grid with M at the centre). | creature `movement`; `board/movement.ts` |
| Visual identity (prototype) | Presentation only, from the references in `art/references/`. Board tiles and frame are cropped from the board art at draw time; Power Points are drawn from game state. Creatures use portraits from the monster sheet via content `art.portrait` ("monsters:<n>"), framed in the owner's colour, falling back to the procedural sprite. P1 = red/orange, P2 = blue. Reference-style panels, P1/P2 tags, coloured category dice (speed white, power red, shield yellow, dash green, block blue) with icons, a gothic pixel display font (The Lowly Scribe, OFL, bundled). The UI is mounted in a chamber (environment pass): side panels stand free with the environment visible around them, the title plaque and message bar sit in the board's column; the room comes from crops of the environment reference (`art/environment/environment.json`) over procedural stone, plus procedural pipes, chains, struts with LEDs and flickering fire light, cached in an offscreen layer. | `src/rendering/art.ts`, `boardArt.ts`, `environment.ts`, `draw.ts`, `theme.ts`; `art/README.md` |
| Monster avatars | 32 avatars cut out of two portrait sheets into `art/portraits/<id>.png` (256×256, frames removed; `tools/extract-portraits.mjs` + `portraits.json`). Content `art.portrait: "<id>"`; chosen in /editor -> Monsters -> AVATAR (thumbnail grid, NONE = generated sprite). Legacy `"monsters:<n>"` refs still resolve. The game loads only the avatars its content uses. | `src/rendering/art.ts`, `src/devEditor/monsterSection.ts`, `art/README.md` |
| Board lineup editing | /editor -> Monsters -> POSITION shows every piece on the board. Clicking a piece opens that monster; clicking its own piece selects it (side P1/P2, remove, or click an empty cell to move it); an empty cell with nothing selected adds a piece. The edited lineup is stored in the local save (`lineup`) and used by new matches; RESET BOARD LINEUP restores the bundled one. Until edited, the lineup is the bundled board plus monsters' own `player`+`position`; `pack()` hands the board the full lineup (own positions left out of the creatures, so nothing is placed twice). Deleted custom monsters leave the board, renamed ones keep their pieces. | `src/content/library.ts` (`lineup`, `setLineup`, `resetLineup`), `src/devEditor/monsterSection.ts` |
