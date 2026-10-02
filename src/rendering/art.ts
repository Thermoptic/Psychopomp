// Prototype artwork taken from the visual references in art/references/.
// The reference images are never modified: sprites are cropped from them at
// draw time using the measured rectangles below. See art/README.md for the
// mapping. Presentation only; nothing here affects the game.
//
// Loading needs a browser (Image, FontFace); call loadArt() from a page entry.
// Until it has loaded (or if it fails), every caller falls back to the old
// procedural look, so the game never depends on the art being present.

import boardUrl from '../../art/references/psychopomp-board-reference.webp?url';
import monstersUrl from '../../art/references/psychopomp-monsters-reference.webp?url';
import environmentUrl from '../../art/references/psychopomp-environment-reference.webp?url';
import titleUrl from '../../art/references/psychopomp-title-reference.webp?url';
import displayFontUrl from '../../art/fonts/the-lowly-scribe.ttf?url';
// The font's OFL licence and readme must ship with the font (they are linked
// from the page, which also makes the build emit them next to it).
import displayFontLicenseUrl from '../../art/fonts/the-lowly-scribe-OFL.txt?url';
import displayFontReadmeUrl from '../../art/fonts/the-lowly-scribe-readme.txt?url';

export interface Sprite {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// --- monster portraits ----------------------------------------------------------------------
//
// psychopomp-monsters-reference: a 4×4 sheet of framed portraits (1254×1254).
// Centres measured from the frame lines; a square crop inside each frame (the
// frame itself is redrawn in the owner's colour).

const PORTRAIT_COL_CENTRES = [161.5, 471.5, 782.5, 1093];
const PORTRAIT_ROW_CENTRES = [154, 452.5, 756, 1071.5];
const PORTRAIT_SIZE = 248;

/** Sheet index -> short name (row-major), for docs and tools. */
export const MONSTER_SHEET = [
  'eye', 'maw', 'dragon', 'hood',
  'horned-skull', 'slime', 'automaton', 'lich-king',
  'vampire', 'werewolf', 'tentacle-maw', 'plague-doctor',
  'golem', 'demon', 'skeleton-king', 'orb-drone',
] as const;

/**
 * Portrait reference as stored in creature content (`art.portrait`):
 * "monsters:<index>" with index 0..15 into MONSTER_SHEET. Null if invalid.
 */
export function parsePortraitRef(ref: string | undefined): { sheet: 'monsters'; index: number } | null {
  const m = /^monsters:(\d+)$/.exec(ref ?? '');
  if (!m) return null;
  const index = Number(m[1]);
  return index < MONSTER_SHEET.length ? { sheet: 'monsters', index } : null;
}

/** Source rectangle of a portrait on the monster sheet. */
export function portraitRect(index: number): { sx: number; sy: number; sw: number; sh: number } {
  const cx = PORTRAIT_COL_CENTRES[index % 4];
  const cy = PORTRAIT_ROW_CENTRES[Math.floor(index / 4)];
  return { sx: Math.round(cx - PORTRAIT_SIZE / 2), sy: Math.round(cy - PORTRAIT_SIZE / 2), sw: PORTRAIT_SIZE, sh: PORTRAIT_SIZE };
}

// --- board ----------------------------------------------------------------------------------
//
// psychopomp-board-reference: a framed 9×9 board (1254×1254). The art's tiles
// are not perfectly even, so the grid lines were measured. Tile kinds are
// classified from the pixels on load: dark / light (the checker), grey (the
// lanes) and target (grey tiles with a painted Power Point symbol, which are
// never drawn as-is: Power Points come from the game state).

export const BOARD_GRID_X = [46, 170, 300, 429, 559, 695, 825, 955, 1083, 1206];
export const BOARD_GRID_Y = [49, 172, 298, 427, 551, 681, 803, 930, 1058, 1183];
/** The frame: outer edge of the art and the inner edge where tiles start. */
export const BOARD_OUTER = { x0: 0, y0: 0, x1: 1254, y1: 1232 };

export type TileKind = 'dark' | 'light' | 'grey' | 'target';

export function boardTileRect(tx: number, ty: number): { sx: number; sy: number; sw: number; sh: number } {
  const sx = BOARD_GRID_X[tx] + 3;
  const sy = BOARD_GRID_Y[ty] + 3;
  return { sx, sy, sw: BOARD_GRID_X[tx + 1] - 2 - sx, sh: BOARD_GRID_Y[ty + 1] - 2 - sy };
}

// --- loading --------------------------------------------------------------------------------

export const DISPLAY_FONT_FAMILY = 'PsychopompDisplay';

interface BoardArt {
  img: HTMLImageElement;
  kinds: TileKind[][];
  byKind: Record<TileKind, Array<[number, number]>>;
}

let monsterImg: HTMLImageElement | null = null;
let environmentImg: HTMLImageElement | null = null;
let titleImg: HTMLImageElement | null = null;
let boardArt: BoardArt | null = null;
let fontReady = false;
let loading: Promise<void> | null = null;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Could not load ${url}`));
    img.src = url;
  });
}

function classifyBoard(img: HTMLImageElement): BoardArt {
  const c = document.createElement('canvas');
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0);
  const kinds: TileKind[][] = [];
  const byKind: BoardArt['byKind'] = { dark: [], light: [], grey: [], target: [] };
  for (let ty = 0; ty < 9; ty++) {
    const row: TileKind[] = [];
    for (let tx = 0; tx < 9; tx++) {
      const r = boardTileRect(tx, ty);
      const d = g.getImageData(r.sx, r.sy, r.sw, r.sh).data;
      let lum = 0;
      let red = 0;
      for (let i = 0; i < d.length; i += 4) {
        lum += (d[i] + d[i + 1] + d[i + 2]) / 3;
        if (d[i] > 180 && d[i + 1] < 110 && d[i + 2] < 90) red++;
      }
      const n = d.length / 4;
      const avg = lum / n;
      const kind: TileKind = red / n > 0.02 ? 'target' : avg < 35 ? 'dark' : avg > 90 ? 'light' : 'grey';
      row.push(kind);
      byKind[kind].push([tx, ty]);
    }
    kinds.push(row);
  }
  return { img, kinds, byKind };
}

/** Loads the prototype art and display font (browser only). Safe to call more than once. */
export function loadArt(): Promise<void> {
  if (loading) return loading;
  const tasks: Array<Promise<unknown>> = [
    loadImage(monstersUrl).then((img) => (monsterImg = img)),
    loadImage(boardUrl).then((img) => (boardArt = classifyBoard(img))),
    loadImage(environmentUrl).then((img) => (environmentImg = img)),
    loadImage(titleUrl).then((img) => (titleImg = img)),
  ];
  if (typeof document !== 'undefined') {
    for (const href of [displayFontLicenseUrl, displayFontReadmeUrl]) {
      const link = document.createElement('link');
      link.rel = 'license';
      link.href = href;
      document.head.append(link);
    }
  }
  if (typeof FontFace !== 'undefined') {
    const face = new FontFace(DISPLAY_FONT_FAMILY, `url(${displayFontUrl})`);
    tasks.push(
      face.load().then((f) => {
        document.fonts.add(f);
        fontReady = true;
      }),
    );
  }
  loading = Promise.allSettled(tasks).then((results) => {
    for (const r of results) if (r.status === 'rejected') console.warn('[art]', r.reason);
  });
  return loading;
}

export const displayFontReady = (): boolean => fontReady;

/** The portrait sprite for a creature's `art.portrait`, or null (not set / not loaded). */
export function portraitSprite(ref: string | undefined): Sprite | null {
  const p = parsePortraitRef(ref);
  if (!p || !monsterImg) return null;
  return { img: monsterImg, ...portraitRect(p.index) };
}

const tileHash = (x: number, y: number) => {
  let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 1, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
};

/**
 * Tile art for grid cell (x, y).
 * - 'board': the reference board's own tile at (x mod 9, y mod 9), so a 9×9
 *   board looks like the reference; painted Power Point tiles are replaced by
 *   a plain lane tile (Power Points are drawn from the game state).
 * - 'arena': a plain dark/light checker (no lanes), for the wide combat arena.
 */
export function boardTileSprite(x: number, y: number, mode: 'board' | 'arena'): Sprite | null {
  if (!boardArt) return null;
  const { kinds, byKind, img } = boardArt;
  let tx = x % 9;
  let ty = y % 9;
  const pick = (list: Array<[number, number]>) => list[tileHash(x, y) % list.length];
  if (mode === 'arena') {
    const list = byKind[(x + y) % 2 === 0 ? 'dark' : 'light'];
    if (list.length) [tx, ty] = pick(list);
  } else if (kinds[ty][tx] === 'target' && byKind.grey.length) {
    [tx, ty] = pick(byKind.grey);
  }
  return { img, ...boardTileRect(tx, ty) };
}

/** The board art image for the frame (9-slice), or null if not loaded. */
export function boardFrameImage(): HTMLImageElement | null {
  return boardArt?.img ?? null;
}

/** The environment reference (cropped by environment.ts), or null if not loaded. */
export function environmentImage(): HTMLImageElement | null {
  return environmentImg;
}

/** The title screen image, or null if not loaded. */
export function titleImage(): HTMLImageElement | null {
  return titleImg;
}
