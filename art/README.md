# Psychopomp art (visual prototype)

Prototype art for the visual-identity pass. Everything here ships with the game
and works offline (bundled by Vite, no CDN).

## references/ (originals, never modified)

| File | Size | Used for |
|---|---|---|
| `psychopomp-ui-reference.webp` | 1565×1005 | Look and palette of the UI (panels, dice, labels, colours). Not drawn in the game. |
| `psychopomp-board-reference.webp` | 1254×1254 | Board tiles and frame (cropped at draw time). |
| `psychopomp-monsters-reference.webp` | 1254×1254 | The first portrait sheet (superseded by the two sheets below; kept as the original). |
| `psychopomp-portraits-a.webp` | 1254×1254 | Avatar sheet A (16 portraits), cut out into `portraits/`. |
| `psychopomp-portraits-b.webp` | 1254×1254 | Avatar sheet B (16 portraits), cut out into `portraits/`. |
| `psychopomp-portraits-c.webp` | 1254×1254 | Avatar sheet C (16 forest creatures), cut out into `portraits/`. |
| `psychopomp-environment-reference.webp` | 1565×1005 | The chamber around the UI (cropped at draw time, see below). |
| `psychopomp-title-reference.webp` | 1565×1005 | The title screen, drawn full screen (see below). |
| `psychopomp-arena-walls-reference.webp` | 1265×581 | Arena walls: one wall of every shape (1×1, 1×2 and 1×3, horizontal and vertical), cropped by its cells in `art.ts` (`wallCrop`) and drawn over the battle's generated walls. |

The images are cropped **at runtime** (`src/rendering/art.ts`) from measured
rectangles, so no generated copies are needed and the originals stay untouched.
To change a crop, edit the constants in `art.ts` (the tests in
`tests/art.test.ts` check they stay inside the images).

### Monster avatars (portraits/)

48 avatars, cut out of the three avatar sheets: frame and corner marks removed,
exactly **256×256 PNG** each (`portraits/<id>.png`). `portraits/portraits.json`
lists every id with its sheet and square crop (centred inside the frame, 26 px
in so the coloured corner marks are cut away). Regenerate with:

    npm install --no-save sharp
    node tools/extract-portraits.mjs

Creature content selects one with `art.portrait: "<id>"`. In the Developer
Editor (/editor -> Monsters -> AVATAR) every avatar is offered as a thumbnail;
NONE keeps the generated pixel sprite. The game draws the avatar framed in the
owner's colour (P1 red/orange, P2 blue), so any avatar works for either player.
Only avatars used by the content are loaded by the game; the editor loads all.

**Facing.** Each avatar in `portraits.json` has `faces`: which way the creature looks in its picture (`right`: maw, vampire, werewolf, many-eyed-maw, brain-cyborg, bone-beast, rotting-ghoul, horned-reaper; `left`: dragon, plague-doctor, skull-automaton, vampire-queen; sheet C: antler-stag, moss-bear, briar-boar, moss-wolf, rabid-squirrel, moss-croc look right, bone-heron and carrion-crow left; the rest `front`). P1 creatures look right and P2 creatures left everywhere (board, player panels, dice panel, editor preview); in combat they look towards their aim. An avatar is mirrored only when its picture looks the other way; front-facing ones are never mirrored.
Older content with `"monsters:<n>"` (first sheet) still resolves to the same
creature (e.g. `monsters:0` -> `eye`).

| Sheet A (row-major) | | | |
|---|---|---|---|
| eye (`glubber`) | maw | hood (`shroud`) | dragon |
| horned-skull | slime | lich-king | automaton |
| vampire | werewolf | plague-doctor | tentacle-maw |
| golem | demon | orb-drone | skeleton-king |

| Sheet B (row-major) | | | |
|---|---|---|---|
| cyclops-demon | many-eyed-maw | tentacle-cyclops | skull-automaton |
| brain-cyborg | bone-beast | skull-slime | plague-hood |
| spiked-horror | beholder | vampire-queen | rune-golem |
| rotting-ghoul | horned-reaper | frost-wraith | clockwork-eye |

| Sheet C, forest (row-major) | | | |
|---|---|---|---|
| antler-stag (right) | moss-bear (right) | toadstool | bark-wraith |
| briar-boar (right) | moss-spider | moss-owl | hollow-tree |
| moss-wolf (right) | rabid-squirrel (right) | bone-heron (left) | fungal-eyes |
| moss-croc (right) | root-eye | moss-golem | carrion-crow (left) |

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
