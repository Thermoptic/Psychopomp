# Psychopomp art (visual prototype)

Prototype art for the visual-identity pass. Everything here ships with the game
and works offline (bundled by Vite, no CDN).

## references/ (originals, never modified)

| File | Size | Used for |
|---|---|---|
| `psychopomp-ui-reference.webp` | 1565×1005 | Look and palette of the UI (panels, dice, labels, colours). Not drawn in the game. |
| `psychopomp-board-reference.webp` | 1254×1254 | Board tiles and frame (cropped at draw time). |
| `psychopomp-monsters-reference.webp` | 1254×1254 | Creature portraits (cropped at draw time). |

The images are cropped **at runtime** (`src/rendering/art.ts`) from measured
rectangles, so no generated copies are needed and the originals stay untouched.
To change a crop, edit the constants in `art.ts` (the tests in
`tests/art.test.ts` check they stay inside the images).

### Monster portraits

Creature content points at a portrait with `art.portrait: "monsters:<index>"`
(row-major on the 4×4 sheet). A creature without a valid `art.portrait` keeps the
procedural placeholder sprite.

| Index | Sheet name | Used by |
|---|---|---|
| 0 | eye | `glubber` |
| 1 | maw | |
| 2 | dragon | |
| 3 | hood | `shroud` |
| 4 | horned-skull | |
| 5 | slime | |
| 6 | automaton | |
| 7 | lich-king | |
| 8 | vampire | |
| 9 | werewolf | |
| 10 | tentacle-maw | |
| 11 | plague-doctor | |
| 12 | golem | |
| 13 | demon | |
| 14 | skeleton-king | |
| 15 | orb-drone | |

Crop: a 248×248 square centred in each frame (frame centres measured from the
frame lines). The coloured frame is redrawn in the owner's colour (P1 red/orange,
P2 blue), so any creature can belong to either player.

### Board

- Grid lines measured from the art (its tiles are 122–136 px, not even):
  `BOARD_GRID_X` / `BOARD_GRID_Y` in `art.ts`.
- On load each of the 81 tiles is classified from its pixels as dark / light
  (checker), grey (lanes) or target (a painted Power Point).
- **Strategic board**: cell (x, y) uses the reference tile (x mod 9, y mod 9);
  painted Power Point tiles are swapped for a plain lane tile. Power Points are
  then drawn **from the game state** (`drawPowerPointMarker`), never from the
  picture.
- **Combat arena**: a plain dark/light checker from the same tiles, inside the
  same frame, so the board visibly opens into the arena.
- **Frame**: a 9-slice of the art's outer frame.

## fonts/

`the-lowly-scribe.ttf` by "MagicBear" (SIL Open Font License 1.1, see
`the-lowly-scribe-OFL.txt` and `the-lowly-scribe-readme.txt`; both are shipped
next to the font). It is used for display text from 13 px up. Smaller text stays in
a bold monospace for readability.
