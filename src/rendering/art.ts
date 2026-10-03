// Prototype artwork taken from the visual references in art/references/.
// The reference images are never modified: board tiles are cropped from them
// at draw time using the measured rectangles below; creature avatars are
// pre-cut files in art/portraits/. See art/README.md for the
// mapping. Presentation only; nothing here affects the game.
//
// Loading needs a browser (Image, FontFace); call loadArt() from a page entry.
// Until it has loaded (or if it fails), every caller falls back to the old
// procedural look, so the game never depends on the art being present.

import boardUrl from '../../art/references/psychopomp-board-reference.webp?url';
import environmentUrl from '../../art/references/psychopomp-environment-reference.webp?url';
import titleUrl from '../../art/references/psychopomp-title-reference.webp?url';
import displayFontUrl from '../../art/fonts/the-lowly-scribe.ttf?url';
// The font's OFL licence and readme must ship with the font (they are linked
// from the page, which also makes the build emit them next to it).
import displayFontLicenseUrl from '../../art/fonts/the-lowly-scribe-OFL.txt?url';
import displayFontReadmeUrl from '../../art/fonts/the-lowly-scribe-readme.txt?url';
import portraitManifest from '../../art/portraits/portraits.json';

// Every avatar PNG, bundled by Vite (URL per file).
const PORTRAIT_FILES = import.meta.glob('../../art/portraits/*.png', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

export interface Sprite {
  img: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

// --- monster portraits (avatars) -----------------------------------------------------------
//
// 32 avatars cut out of the portrait sheets (art/portraits/<id>.png, 256×256,
// frame removed; see art/portraits/portraits.json and tools/extract-portraits.mjs).
// Creature content selects one with `art.portrait: "<id>"`. The frame is redrawn
// in the owner's colour, so any avatar works for either player.

/** All avatar ids, in sheet order. */
export const PORTRAIT_IDS: readonly string[] = portraitManifest.portraits.map((p) => p.id);

/** Older content used "monsters:<n>" (the first 4×4 reference sheet, row-major). */
const LEGACY_SHEET = [
  'eye', 'maw', 'dragon', 'hood',
  'horned-skull', 'slime', 'automaton', 'lich-king',
  'vampire', 'werewolf', 'tentacle-maw', 'plague-doctor',
  'golem', 'demon', 'skeleton-king', 'orb-drone',
];

/** The avatar id for a content `art.portrait` value (an id or a legacy "monsters:<n>"), or null. */
export function parsePortraitRef(ref: string | undefined): string | null {
  if (!ref) return null;
  const legacy = /^monsters:(\d+)$/.exec(ref);
  const id = legacy ? LEGACY_SHEET[Number(legacy[1])] : ref;
  return id && PORTRAIT_IDS.includes(id) ? id : null;
}

export type Facing = 'left' | 'right';

/** Which way an avatar looks in its picture ('front' = straight at the viewer). */
export function portraitFacing(ref: string | undefined): Facing | 'front' | null {
  const id = parsePortraitRef(ref);
  const p = id ? portraitManifest.portraits.find((q) => q.id === id) : undefined;
  return p ? ((p as { faces?: string }).faces as Facing | 'front' | undefined) ?? 'front' : null;
}

/**
 * Whether to mirror an avatar so it looks towards `face`: only when the
 * picture looks the other way. Front-facing pictures are never mirrored.
 */
export function mirrorPortrait(ref: string | undefined, face: Facing): boolean {
  const natural = portraitFacing(ref);
  return (natural === 'left' && face === 'right') || (natural === 'right' && face === 'left');
}

/** The way a player's creatures look by default: P1 right, P2 left (towards each other). */
export const defaultFacing = (owner: 'P1' | 'P2'): Facing => (owner === 'P1' ? 'right' : 'left');

/** URL of an avatar image (for the editor's picker), or null for an unknown id. */
export function portraitUrl(id: string): string | null {
  return PORTRAIT_FILES[`../../art/portraits/${id}.png`] ?? null;
}

const portraitImgs = new Map<string, { img: HTMLImageElement; ready: Promise<void>; loaded: boolean }>();

function portraitImage(id: string) {
  let e = portraitImgs.get(id);
  if (!e && typeof Image !== 'undefined') {
    const url = portraitUrl(id);
    if (!url) return null;
    const img = new Image();
    const entry = { img, loaded: false, ready: Promise.resolve() };
    entry.ready = new Promise<void>((resolve) => {
      img.onload = () => ((entry.loaded = true), resolve());
      img.onerror = () => (console.warn('[art] could not load avatar', id), resolve());
    });
    img.src = url;
    portraitImgs.set(id, entry);
    e = entry;
  }
  return e ?? null;
}

/** Starts loading the avatars for these content refs; resolves when they are in. */
export function preloadPortraits(refs: Array<string | undefined>): Promise<void> {
  const ids = [...new Set(refs.map(parsePortraitRef).filter((x): x is string => !!x))];
  return Promise.all(ids.map((id) => portraitImage(id)?.ready)).then(() => undefined);
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

/** The avatar sprite for a creature's `art.portrait`, or null (not set / not loaded yet). */
export function portraitSprite(ref: string | undefined): Sprite | null {
  const id = parsePortraitRef(ref);
  const e = id ? portraitImage(id) : null;
  if (!e || !e.loaded) return null;
  return { img: e.img, sx: 0, sy: 0, sw: e.img.naturalWidth, sh: e.img.naturalHeight };
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
