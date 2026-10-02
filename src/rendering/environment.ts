// The chamber the UI is mounted in (art/references/psychopomp-environment-reference).
// Presentation only.
//
// Layers (back to front):
//   1. procedural dark stone wall (always available)
//   2. environment crops from the reference, feathered into the stone
//      (walls with chains/torches/candles/statues, arches, floor) - see
//      art/environment/environment.json
//   3. darkening + vignette, so the UI stays the focus
//   4. match only: UI support structure - drop shadows, gutter pipes, struts,
//      chains, foreground silhouettes
// 1-4 are static: rendered once into an offscreen canvas at screen resolution
// and rebuilt only when the scale changes or the art finishes loading.
// Per frame only a few flickering fire glows and blinking LEDs are drawn.

import manifest from '../../art/environment/environment.json';
import { environmentImage } from './art';
import type { Ctx } from './draw';
import { BOARD_AREA, HEADER, LEFT_PANEL, MESSAGE_BAR, RIGHT_PANEL, type Rect } from './layout';
import { C, VIEW_H, VIEW_W } from './theme';

type Edge = 'left' | 'right' | 'top' | 'bottom';
export interface EnvCrop {
  id: string;
  src: number[];
  anchor: Edge;
  feather: Partial<Record<Edge, number>>;
}
export interface EnvLight {
  x: number;
  y: number;
  kind: 'torch' | 'candle';
}

const CROPS = manifest.crops as EnvCrop[];
const SCALE = manifest.scale;

/** Where a crop lands in the 960×540 view. */
export function cropPlacement(c: EnvCrop): Rect {
  const w = c.src[2] * SCALE;
  const h = c.src[3] * SCALE;
  switch (c.anchor) {
    case 'left':
      return { x: 0, y: 0, w, h };
    case 'right':
      return { x: VIEW_W - w, y: 0, w, h };
    case 'top':
      return { x: (VIEW_W - w) / 2, y: 0, w, h };
    case 'bottom':
      return { x: (VIEW_W - w) / 2, y: VIEW_H - h, w, h };
  }
}

/** Fire light positions in the view: each reference point mapped through the crop that contains it. */
export function lightPositions(): EnvLight[] {
  const out: EnvLight[] = [];
  for (const l of manifest.lights) {
    const [rx, ry] = l.at;
    const c = CROPS.find((k) => rx >= k.src[0] && rx < k.src[0] + k.src[2] && ry >= k.src[1] && ry < k.src[1] + k.src[3]);
    if (!c) continue;
    const p = cropPlacement(c);
    out.push({ x: p.x + (rx - c.src[0]) * SCALE, y: p.y + (ry - c.src[1]) * SCALE, kind: l.kind as EnvLight['kind'] });
  }
  return out;
}

// --- static layer ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 4294967296);
}

/** Irregular dark stone blocks with warm mortar shading. */
function stoneWall(g: CanvasRenderingContext2D): void {
  g.fillStyle = '#060504';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  const rnd = rng(9137);
  const rowH = 17;
  for (let y = 0; y < VIEW_H; y += rowH) {
    let x = -Math.floor(rnd() * 20);
    while (x < VIEW_W) {
      const w = 22 + Math.floor(rnd() * 26);
      const v = 17 + Math.floor(rnd() * 14);
      g.fillStyle = `rgb(${v + 5},${v + 1},${v - 3})`;
      g.fillRect(x + 1, y + 1, w - 2, rowH - 2);
      g.fillStyle = 'rgba(255,220,170,0.05)';
      g.fillRect(x + 1, y + 1, w - 2, 1);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + 1, y + rowH - 2, w - 2, 1);
      if (rnd() < 0.3) g.fillRect(x + 3 + Math.floor(rnd() * (w - 8)), y + 4 + Math.floor(rnd() * 8), 2 + Math.floor(rnd() * 4), 1);
      x += w;
    }
  }
}

/** Draws a crop with soft alpha edges into the layer. */
function drawFeatheredCrop(g: CanvasRenderingContext2D, img: HTMLImageElement, c: EnvCrop, k: number): void {
  const dst = cropPlacement(c);
  const t = document.createElement('canvas');
  t.width = Math.max(1, Math.round(dst.w * k));
  t.height = Math.max(1, Math.round(dst.h * k));
  const tg = t.getContext('2d')!;
  tg.imageSmoothingEnabled = true;
  tg.imageSmoothingQuality = 'high';
  tg.drawImage(img, c.src[0], c.src[1], c.src[2], c.src[3], 0, 0, t.width, t.height);
  tg.globalCompositeOperation = 'destination-in';
  const f = c.feather;
  const fade = (x0: number, y0: number, x1: number, y1: number, len: number) => {
    const grad = tg.createLinearGradient(x0, y0, x1, y1);
    const total = Math.hypot(x1 - x0, y1 - y0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(Math.min(1, (len * k) / total), 'rgba(0,0,0,1)');
    grad.addColorStop(1, 'rgba(0,0,0,1)');
    tg.fillStyle = grad;
    tg.fillRect(0, 0, t.width, t.height);
  };
  if (f.left) fade(0, 0, t.width, 0, f.left);
  if (f.right) fade(t.width, 0, 0, 0, f.right);
  if (f.top) fade(0, 0, 0, t.height, f.top);
  if (f.bottom) fade(0, t.height, 0, 0, f.bottom);
  g.drawImage(t, dst.x, dst.y, dst.w, dst.h);
}

/** Bracket/strut LED positions (drawn per frame, blinking). */
interface Led {
  x: number;
  y: number;
  color: string;
  phase: number;
}
let leds: Led[] = [];

function steelBox(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.fillStyle = C.edgeDark;
  g.fillRect(x - 1, y - 1, w + 2, h + 2);
  g.fillStyle = C.steel;
  g.fillRect(x, y, w, h);
  g.fillStyle = C.steelLight;
  g.fillRect(x, y, w, 1);
  g.fillRect(x, y, 1, h);
  g.fillStyle = '#17130f';
  g.fillRect(x, y + h - 1, w, 1);
  g.fillRect(x + w - 1, y, 1, h);
}

function chain(g: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  for (let y = y0, i = 0; y < y1; y += 5, i++) {
    g.fillStyle = C.edgeDark;
    if (i % 2 === 0) {
      g.fillRect(x - 3, y, 6, 7);
      g.fillStyle = '#4a4036';
      g.fillRect(x - 2, y + 1, 4, 5);
      g.fillStyle = '#0b0908';
      g.fillRect(x - 1, y + 2, 2, 3);
    } else {
      g.fillRect(x - 1, y, 2, 7);
      g.fillStyle = '#5c5040';
      g.fillRect(x - 1, y + 1, 1, 5);
    }
  }
}

function vPipe(g: CanvasRenderingContext2D, x: number, y0: number, y1: number): void {
  const w = 6;
  const grad = g.createLinearGradient(x, 0, x + w, 0);
  grad.addColorStop(0, '#15110d');
  grad.addColorStop(0.45, '#6b5d4a');
  grad.addColorStop(1, '#100c09');
  g.fillStyle = grad;
  g.fillRect(x, y0, w, y1 - y0);
  for (let y = y0 + 20; y < y1 - 10; y += 68) {
    steelBox(g, x - 2, y, w + 4, 6);
  }
}

function supportStructure(g: CanvasRenderingContext2D): void {
  leds = [];
  const ui = [LEFT_PANEL, RIGHT_PANEL, BOARD_AREA, HEADER, MESSAGE_BAR];
  // Drop shadows: everything sits in front of the wall.
  g.save();
  g.filter = 'blur(7px)';
  g.fillStyle = 'rgba(0,0,0,0.75)';
  for (const r of ui) g.fillRect(r.x - 3, r.y + 4, r.w + 6, r.h + 8);
  g.restore();

  // Chains the side panels hang from.
  for (const r of [LEFT_PANEL, RIGHT_PANEL]) {
    chain(g, r.x + 34, -2, r.y + 2);
    chain(g, r.x + r.w - 34, -2, r.y + 2);
  }
  // Gutter pipes between the side panels and the board.
  vPipe(g, LEFT_PANEL.x + LEFT_PANEL.w + 3, LEFT_PANEL.y + 10, LEFT_PANEL.y + LEFT_PANEL.h - 10);
  vPipe(g, RIGHT_PANEL.x - 9, RIGHT_PANEL.y + 10, RIGHT_PANEL.y + RIGHT_PANEL.h - 10);
  // Struts: the title plaque and the message bar are bolted to the board frame.
  const mid = BOARD_AREA.x + BOARD_AREA.w / 2;
  for (const dx of [-150, 0, 150]) {
    steelBox(g, mid + dx - 5, HEADER.y + HEADER.h - 2, 10, BOARD_AREA.y - HEADER.y - HEADER.h + 4);
    steelBox(g, mid + dx - 5, BOARD_AREA.y + BOARD_AREA.h - 2, 10, MESSAGE_BAR.y - BOARD_AREA.y - BOARD_AREA.h + 4);
    leds.push({ x: mid + dx - 1, y: BOARD_AREA.y + BOARD_AREA.h + 1, color: C.ppMark, phase: dx / 50 });
  }
  // The plaque hangs from chains too.
  chain(g, HEADER.x + 40, -2, HEADER.y + 2);
  chain(g, HEADER.x + HEADER.w - 40, -2, HEADER.y + 2);
  // Foreground: dark grave silhouettes at the bottom corners.
  g.fillStyle = '#030302';
  for (const [x, w, h] of [[-6, 34, 30], [30, 22, 18], [VIEW_W - 28, 34, 28], [VIEW_W - 52, 20, 16]] as const) {
    g.beginPath();
    g.moveTo(x, VIEW_H);
    g.lineTo(x, VIEW_H - h + w / 2);
    g.arc(x + w / 2, VIEW_H - h + w / 2, w / 2, Math.PI, 0);
    g.lineTo(x + w, VIEW_H);
    g.fill();
  }
}

function buildLayer(k: number, supports: boolean, img: HTMLImageElement | null): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.round(VIEW_W * k);
  c.height = Math.round(VIEW_H * k);
  const g = c.getContext('2d')!;
  g.scale(k, k);
  stoneWall(g);
  if (img) for (const crop of CROPS) drawFeatheredCrop(g, img, crop, k);
  // Keep the room dark: the UI is the focus.
  g.fillStyle = 'rgba(4,3,2,0.12)';
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  const v = g.createRadialGradient(VIEW_W / 2, VIEW_H / 2, VIEW_H * 0.3, VIEW_W / 2, VIEW_H / 2, VIEW_W * 0.68);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.45)');
  g.fillStyle = v;
  g.fillRect(0, 0, VIEW_W, VIEW_H);
  if (supports) supportStructure(g);
  return c;
}

interface Cached {
  canvas: HTMLCanvasElement;
  k: number;
  withImage: boolean;
}
const cache: Record<'room' | 'match', Cached | null> = { room: null, match: null };
let lights: EnvLight[] | null = null;

/**
 * The chamber behind the UI. `match` adds the support structure for the
 * match layout (pipes, struts, chains...). Call before drawing the screen.
 */
export function drawEnvironment(ctx: Ctx, now: number, match: boolean): void {
  if (typeof document === 'undefined') return;
  const k = Math.max(1, Math.min(4, ctx.getTransform().a));
  const img = environmentImage();
  const key = match ? 'match' : 'room';
  let layer = cache[key];
  if (!layer || Math.abs(layer.k - k) > 0.01 || layer.withImage !== !!img) {
    layer = { canvas: buildLayer(k, match, img), k, withImage: !!img };
    cache[key] = layer;
  }
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(layer.canvas, 0, 0, VIEW_W, VIEW_H);
  ctx.imageSmoothingEnabled = prev;

  // Fire light: a soft additive glow per torch/candle, flickering.
  if (img) {
    lights ??= lightPositions();
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    lights.forEach((l, i) => {
      const f = 0.7 + 0.3 * Math.sin(now / (70 + i * 9) + i) * Math.sin(now / 43 + i * 2.3);
      const r = l.kind === 'torch' ? 58 : 24;
      const glow = ctx.createRadialGradient(l.x, l.y, 0, l.x, l.y, r);
      glow.addColorStop(0, `rgba(255,150,60,${(l.kind === 'torch' ? 0.22 : 0.16) * f})`);
      glow.addColorStop(1, 'rgba(255,110,30,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(l.x - r, l.y - r, 2 * r, 2 * r);
    });
    ctx.restore();
  }
  // Blinking indicator LEDs on the struts.
  if (match) {
    for (const l of leds) {
      const on = Math.sin(now / 600 + l.phase) > -0.6;
      ctx.fillStyle = on ? l.color : '#2a1a12';
      ctx.fillRect(l.x, l.y, 2, 6);
      if (on) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(l.x, l.y, 1, 2);
      }
    }
  }
}
