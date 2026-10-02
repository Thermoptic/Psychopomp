# Psychopomp art (visual prototype)

Prototype art for the visual-identity pass. Everything here ships with the game
and works offline (bundled by Vite, no CDN).

## references/ (originals, never modified)

| File | Size | Used for |
|---|---|---|
| `psychopomp-ui-reference.webp` | 1565×1005 | Look and palette of the UI (panels, dice, labels, colours). Not drawn in the game. |
| `psychopomp-board-reference.webp` | 1254×1254 | Board tiles and frame (cropped at draw time). |
| `psychopomp-monsters-reference.webp` | 1254×1254 | Creature portraits (cropped at draw time). |
| `psychopomp-environment-reference.webp` | 1565×1005 | The chamber around the UI (cropped at draw time, see below). |
| `psychopomp-title-reference.webp` | 1565×1005 | The title screen, drawn full screen (see below). |

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
- **Combat arena** (20×9, as wide as the HUD): a plain dark/light checker from
  the same tiles ('arena' mode), inside the same frame, opening out of the board.
- **Frame**: a 9-slice of the art's outer frame.

## environment/ (the chamber around the UI)

`environment/environment.json` is the asset manifest for the environment layer
(`src/rendering/environment.ts`): which regions of the environment reference are
used, where they go, and where the fire lights are.

| Crop | Reference region [x, y, w, h] | Contains | Placed |
|---|---|---|---|
| left-wall | 0, 0, 360, 1005 | hanging chains, wall torch, candle stands, hooded statue niche, skull niche, floor candles | left edge, full height |
| right-wall | 1205, 0, 360, 1005 | the same, mirrored side | right edge, full height |
| arches | 330, 0, 905, 100 | gothic arches, windows, skull ornaments, central torch | top centre |
| floor | 330, 840, 905, 165 | stone floor, rubble, skulls, candles | bottom centre |

All crops are scaled by 540/1005 and feathered (soft alpha edges) into a
procedural stone wall. The reference's own empty panel/board frames fall
completely behind the game's panels, so they never show.

**Extracted vs recreated.** Single objects (a torch, a statue, a chain) were
not cut out as separate sprites: in this AI-generated picture they sit on a busy
background, so cut-outs would carry visible rectangles and seams. They are kept
in their original wall context (the crops above) instead. Everything that has to
fit the game's own layout is recreated procedurally in the same style: gutter
pipes, struts bolting the title plaque and message bar to the board frame (with
blinking LEDs), the chains the panels and plaque hang from, foreground grave
silhouettes, drop
shadows, darkening and vignette, and the flickering fire glow at each light in
the manifest.

**Performance.** Stone, crops, darkening and support structure are drawn once
into an offscreen canvas at screen resolution (rebuilt only on resize or when the
art finishes loading). Per frame: one image draw, 11 fire glows and 3 LEDs.

## title/ (title screen)

`title/title.json`: the title image is drawn to cover the view (scaled to the
view width, shifted up 24 px so the top torch stays visible; a little of the
bottom floor is cut). There is no text or menu on top: any confirm or click
starts a match. Each flame listed in the manifest (23: torches and candles, the
red lanterns on the left, the blue lanterns on the right) gets an additive glow
in its own colour that flickers with two out-of-phase waves, plus a small
swaying bright core. Flame positions were found by scanning the image for small
bright warm/blue blobs outside the logo and checked by eye.

## fonts/

`the-lowly-scribe.ttf` by "MagicBear" (SIL Open Font License 1.1, see
`the-lowly-scribe-OFL.txt` and `the-lowly-scribe-readme.txt`; both are shipped
next to the font). It is used for display text from 13 px up. Smaller text stays in
a bold monospace for readability.
