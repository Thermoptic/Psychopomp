# PSYCHOPOMP

**Psychopomp** is a 2-player tactical board-game/battle game inspired by the classic *Archon: The Light and the Dark*.

The central structure remains:

1. Two players control opposing teams of creatures.
2. Players take turns moving creatures on a board.
3. Capturing a creature starts a battle.
4. A battle is resolved through a Yahtzee-like dice allocation phase followed by a real creature-vs-creature fight.
5. Captured power points and creature elimination determine victory.
6. A surviving creature keeps its remaining HP after the battle.

The first implementation targets **PC** and **browser**, with offline play and itch.io distribution. The project must be designed so the game rules and content are independent from the rendering/input/platform layer, allowing future ports to systems such as Linux, macOS, Switch, Game Boy Color, NES and C64.

## Design pillars

- **Archon-like strategic board layer**
- **Dice-driven preparation instead of the original direct combat setup**
- **Real-time creature combat after preparation**
- **Persistent surviving HP**
- **Data-driven creatures**
- **Built-in creature/content editor**
- **Offline-first**
- **Two local players**
- **Gamepad + keyboard**
- **Browser build**
- **itch.io-ready**
- **Deterministic, portable game rules**
- **No mandatory online service**

## Important terminology

| Term | Meaning |
|---|---|
| Board | The tactical grid on which creatures move |
| Creature | A playable monster/unit |
| Power Point | One of the five capturable strategic locations |
| Battle | The combat sequence triggered when one creature attacks another |
| Dice Phase | The pre-battle Yahtzee-like allocation phase |
| Stat Slot | A category receiving one or more dice |
| Special | A creature-specific ability activated by satisfying dice requirements |
| Persistent HP | HP remaining after battle and carried into later battles |
| Roster | The creatures available to a player |
| Content Pack | A collection of creature definitions and assets |
| Editor | The built-in tool for creating/testing creature content |

## Project rule

The implementation must never hard-code individual creatures into combat logic.

A creature should be defined as data:

- identity
- artwork
- HP
- movement
- combat stats
- dice allocation rules
- special ability
- optional visual/audio metadata

This makes the game easier to balance and makes the eventual retro ports much more realistic.

See:

- `GAME_DESIGN.md`
- `RULES.md`
- `COMBAT.md`
- `CONTENT.md`
- `EDITOR.md`
- `ARCHITECTURE.md`
- `UI.md`
- `CONTROLS.md`
- `PORTABILITY.md`
- `TESTING.md`
- `CLAUDE_CODE.md`
- `ROADMAP.md`

## Getting started (vertical slice 0.1)

Requires Node.js 20+. Only dev tools are installed (vite, typescript, vitest); the game has no runtime dependencies.

## Development

```text
npm install
npm run dev        # Vite prints the local URL (served under /Psychopomp/)
```

## Test

```text
npm test           # core test suite (headless)
npm run typecheck
npm run build      # static build in dist/
```

## Production preview

```text
npm run preview    # serves dist/ at http://localhost:4173/Psychopomp/
```

## GitHub Pages

Live build: https://thermoptic.github.io/Psychopomp/

Every push to `main` runs `.github/workflows/deploy.yml` (npm ci → npm test → npm run build → deploy `dist/`).
The Vite `base` is `/Psychopomp/` because this is a GitHub Pages project site. Pages is only hosting:
the game, its content and all assets are bundled into the build and need no backend or external service.

## Developer editor (/editor)

Internal content tool, not part of the player UI: `npm run dev` then open `/Psychopomp/editor/`.
MONSTERS (identity, health, P1/P2, 9×9 position, start modifiers, Special slot conditions, Powerup) and
POWERUPS (melee/ranged settings on 1-10 scales). Saved content lives in this browser and is used by new
matches; EXPORT/IMPORT move items as versioned JSON files (see `src/content/saveFormat.ts`).

Code layout and the assumptions made for this slice: see `IMPLEMENTATION_PLAN.md`.
Content lives in `content/packs/base/` (ruleset, board, creatures as JSON).
