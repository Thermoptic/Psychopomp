// Low-level drawing primitives in the Psychopomp look (see art/references/):
// heavy worn-metal panels with bolts, gothic pixel display type, coloured
// pixel dice. The room behind the UI is environment.ts.

import type { PlayerId } from '../core/types';
import { displayFontReady } from './art';
import { C, DIE_FACE, DISPLAY_FONT, FONT, playerColor, playerDark } from './theme';
import type { Rect } from './layout';

export type Ctx = CanvasRenderingContext2D;

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  bold?: boolean;
  /** Force the monospace body font even at display sizes (numbers, debug). */
  mono?: boolean;
}

/** Display font for labels/titles from 13px up (once loaded), monospace below. */
function fontFor(size: number, bold: boolean | undefined, mono: boolean | undefined): string {
  if (!mono && size >= 13 && displayFontReady()) return `${Math.round(size * 1.15)}px ${DISPLAY_FONT}`;
  return `${bold === false ? '' : 'bold '}${size}px ${FONT}`;
}

export function text(ctx: Ctx, str: string, x: number, y: number, o: TextOpts = {}): void {
  ctx.font = fontFor(o.size ?? 14, o.bold, o.mono);
  ctx.fillStyle = o.color ?? C.text;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillText(str, Math.round(x), Math.round(y));
}

export function measure(ctx: Ctx, str: string, size = 14, mono = false): number {
  ctx.font = fontFor(size, true, mono);
  return ctx.measureText(str).width;
}

/** Word-wrapped text; returns the y after the last line. */
export function wrapText(ctx: Ctx, str: string, x: number, y: number, maxW: number, o: TextOpts & { lineH?: number } = {}): number {
  const size = o.size ?? 12;
  const lineH = o.lineH ?? size + 4;
  const words = str.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (measure(ctx, test, size) > maxW && line) {
      text(ctx, line, x, y, o);
      y += lineH;
      line = w;
    } else line = test;
  }
  if (line) text(ctx, line, x, y, o);
  return y + lineH;
}

export function rect(ctx: Ctx, r: Rect, color: string): void {
  ctx.fillStyle = color;
  ctx.fillRect(r.x, r.y, r.w, r.h);
}

export function strokeRect(ctx: Ctx, r: Rect, color: string, width = 2): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.strokeRect(r.x + width / 2, r.y + width / 2, r.w - width, r.h - width);
}

/**
 * Heavy worn-metal panel: dark outline, a bevelled steel frame with bolts,
 * a dark inset and an optional coloured accent (top strip + corner lights).
 */
export function panel(ctx: Ctx, r: Rect, accent?: string, fill: string = C.panel): void {
  const f = r.w >= 120 && r.h >= 60 ? 5 : 3; // frame thickness
  rect(ctx, r, C.edgeDark);
  rect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, C.steel);
  // Bevel: light top/left, dark bottom/right.
  ctx.fillStyle = C.steelLight;
  ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, 1);
  ctx.fillRect(r.x + 1, r.y + 1, 1, r.h - 2);
  ctx.fillStyle = '#1c1712';
  ctx.fillRect(r.x + 1, r.y + r.h - 2, r.w - 2, 1);
  ctx.fillRect(r.x + r.w - 2, r.y + 1, 1, r.h - 2);
  // Inset.
  rect(ctx, { x: r.x + f, y: r.y + f, w: r.w - 2 * f, h: r.h - 2 * f }, C.edgeDark);
  rect(ctx, { x: r.x + f + 1, y: r.y + f + 1, w: r.w - 2 * f - 2, h: r.h - 2 * f - 2 }, fill);
  // Scratches / rust specks on the frame and inset, deterministic per rect.
  let seed = (r.x * 73856093) ^ (r.y * 19349663) ^ (r.w * 83492791);
  for (let i = 0; i < Math.floor((r.w * r.h) / 2200); i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const sx = r.x + 6 + (seed % Math.max(1, r.w - 12));
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const sy = r.y + 6 + (seed % Math.max(1, r.h - 12));
    ctx.fillStyle = seed % 3 === 0 ? 'rgba(120,64,34,0.30)' : 'rgba(255,240,210,0.035)';
    ctx.fillRect(sx, sy, 2 + (seed % 5), 1);
  }
  // Rust along the frame.
  for (let x = r.x + 9; x < r.x + r.w - 9; x += 23) {
    ctx.fillStyle = 'rgba(110,58,30,0.45)';
    ctx.fillRect(x + ((x * 7) % 11), r.y + r.h - f, 3, 2);
  }
  if (f >= 5) {
    for (const [x, y] of [
      [r.x + 2, r.y + 2],
      [r.x + r.w - 7, r.y + 2],
      [r.x + 2, r.y + r.h - 7],
      [r.x + r.w - 7, r.y + r.h - 7],
    ]) {
      ctx.fillStyle = C.edgeDark;
      ctx.fillRect(x, y, 5, 5);
      ctx.fillStyle = C.rivet;
      ctx.fillRect(x, y, 4, 4);
      ctx.fillStyle = '#d8c7a4';
      ctx.fillRect(x + 1, y + 1, 1, 1);
    }
  }
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(r.x + 14, r.y + 1, r.w - 28, 2);
    // Small indicator lights on the frame.
    for (const x of [r.x + 10, r.x + r.w - 12]) {
      ctx.fillStyle = C.edgeDark;
      ctx.fillRect(x - 1, r.y + Math.floor(r.h / 2) - 4, 4, 8);
      ctx.fillStyle = accent;
      ctx.fillRect(x, r.y + Math.floor(r.h / 2) - 3, 2, 6);
    }
  }
}

/** Player tag box ("P1" / "P2") in the player's colour, as in the reference. */
export function playerTag(ctx: Ctx, x: number, y: number, owner: PlayerId, w = 40, h = 22): void {
  rect(ctx, { x: x - 1, y: y - 1, w: w + 2, h: h + 2 }, C.edgeDark);
  rect(ctx, { x, y, w, h }, playerDark(owner));
  rect(ctx, { x: x + 2, y: y + 2, w: w - 4, h: h - 4 }, playerColor(owner));
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 2, y + 2, w - 4, 1);
  text(ctx, owner, x + w / 2, y + h / 2 + 1, { size: 15, color: '#120806', align: 'center', baseline: 'middle' });
}

export interface ButtonOpts {
  focused?: boolean;
  disabled?: boolean;
  accent?: string;
  size?: number;
}

export function button(ctx: Ctx, r: Rect, label: string, o: ButtonOpts = {}): void {
  const accent = o.accent ?? C.pp;
  rect(ctx, r, C.edgeDark);
  rect(ctx, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, o.focused ? '#2a2a34' : C.panel2);
  if (o.focused) strokeRect(ctx, r, accent, 2);
  const color = o.disabled ? C.faint : o.focused ? accent : C.text;
  text(ctx, (o.focused ? '> ' : '') + label, r.x + r.w / 2, r.y + r.h / 2 + 1, { size: o.size ?? 14, color, align: 'center', baseline: 'middle' });
}

const PIPS: Record<number, Array<[number, number]>> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

export interface DieOpts {
  /** Stat category: picks the face colour (white/red/yellow/green/blue). */
  category?: string;
  locked?: boolean;
  allocated?: boolean;
  focused?: boolean;
  held?: boolean;
  accent?: string;
}

/**
 * A pixel die. States are distinguishable without colour: LOCKED shows a
 * padlock bar + label, ALLOCATED is hollow/dimmed, HELD is lifted.
 */
export function die(ctx: Ctx, r: Rect, value: number, o: DieOpts = {}): void {
  const lift = o.held ? -8 : 0;
  const x = r.x;
  const y = r.y + lift;
  const s = r.w;
  const accent = o.accent ?? C.pp;
  if (o.held) rect(ctx, { x: x + 4, y: r.y + s - 2, w: s - 8, h: 4 }, 'rgba(0,0,0,0.5)');
  const face = o.allocated ? '#2b2a27' : value === 0 ? '#3a3935' : (o.category && DIE_FACE[o.category]) || DIE_FACE.speed;
  // Rounded pixel cube: dark outline, face, lit top edge, shaded bottom edge.
  rect(ctx, { x: x + 2, y, w: s - 4, h: s }, C.edgeDark);
  rect(ctx, { x, y: y + 2, w: s, h: s - 4 }, C.edgeDark);
  rect(ctx, { x: x + 3, y: y + 2, w: s - 6, h: s - 4 }, face);
  rect(ctx, { x: x + 2, y: y + 3, w: s - 4, h: s - 6 }, face);
  if (!o.allocated && value > 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.fillRect(x + 4, y + 3, s - 8, 2);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.fillRect(x + 3, y + s - 6, s - 6, 3);
  }
  const pipColor = o.allocated ? '#6d6a60' : '#120d0a';
  if (value > 0 && PIPS[value]) {
    const cell = (s - 12) / 3;
    const p = Math.max(4, Math.floor(s / 9));
    for (const [cx, cy] of PIPS[value]) {
      ctx.fillStyle = pipColor;
      ctx.fillRect(Math.round(x + 6 + cx * cell + cell / 2 - p / 2), Math.round(y + 6 + cy * cell + cell / 2 - p / 2), p, p);
    }
  } else if (value > 6) {
    text(ctx, String(value), x + s / 2, y + s / 2 + 1, { size: 22, color: pipColor, align: 'center', baseline: 'middle' });
  } else if (value === 0) {
    text(ctx, '?', x + s / 2, y + s / 2 + 1, { size: 24, color: '#5c5a53', align: 'center', baseline: 'middle' });
  }
  if (o.locked) {
    strokeRect(ctx, { x: x - 3, y: y - 3, w: s + 6, h: s + 6 }, accent, 3);
    rect(ctx, { x: x + s / 2 - 12, y: y + s + 6, w: 24, h: 14 }, accent);
    text(ctx, 'LOCK', x + s / 2, y + s + 14, { size: 9, color: C.edgeDark, align: 'center', baseline: 'middle' });
  }
  if (o.focused) {
    ctx.fillStyle = C.text;
    ctx.fillRect(x + s / 2 - 6, y - 14, 12, 3);
    ctx.fillRect(x + s / 2 - 3, y - 11, 6, 3);
  }
}

export function hpBar(ctx: Ctx, r: Rect, hp: number, max: number, color: string): void {
  rect(ctx, r, C.edgeDark);
  rect(ctx, { x: r.x + 1, y: r.y + 1, w: r.w - 2, h: r.h - 2 }, '#200c0c');
  const w = Math.round(((r.w - 2) * Math.max(0, hp)) / Math.max(1, max));
  rect(ctx, { x: r.x + 1, y: r.y + 1, w, h: r.h - 2 }, hp / max <= 0.25 ? C.danger : color);
  for (let i = r.x + 6; i < r.x + r.w - 2; i += 6) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(i, r.y + 1, 1, r.h - 2);
  }
}

/** Player badge: P1 = square, P2 = diamond (identity without colour alone). */
export function badge(ctx: Ctx, x: number, y: number, size: number, owner: 'P1' | 'P2', color: string): void {
  ctx.fillStyle = C.edgeDark;
  if (owner === 'P1') {
    ctx.fillRect(x - size / 2 - 1, y - size / 2 - 1, size + 2, size + 2);
    ctx.fillStyle = color;
    ctx.fillRect(x - size / 2, y - size / 2, size, size);
  } else {
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2 - 2);
    ctx.lineTo(x + size / 2 + 2, y);
    ctx.lineTo(x, y + size / 2 + 2);
    ctx.lineTo(x - size / 2 - 2, y);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - size / 2);
    ctx.lineTo(x + size / 2, y);
    ctx.lineTo(x, y + size / 2);
    ctx.lineTo(x - size / 2, y);
    ctx.fill();
  }
  text(ctx, owner === 'P1' ? '1' : '2', x, y + 1, { size: Math.max(8, size - 4), color: C.edgeDark, align: 'center', baseline: 'middle' });
}

export function scanlines(ctx: Ctx, w: number, h: number): void {
  ctx.fillStyle = 'rgba(0,0,0,0.13)';
  for (let y = 0; y < h; y += 3) ctx.fillRect(0, y, w, 1);
}

// --- category icons -------------------------------------------------------------------------

const ICONS: Record<string, string[]> = {
  speed: ['..##...', '..##...', '.####..', '#.##.#.', '..###..', '.#..#..', '#....#.'],
  power: ['......#', '.....#.', '....#..', '#..#...', '.##....', '.##....', '#..#...'],
  shield: ['#######', '#.....#', '#.###.#', '#.###.#', '.#.#.#.', '..#.#..', '...#...'],
  dash: ['...#...', '...#...', '..###..', '#######', '..###..', '...#...', '...#...'],
  block: ['#######', '#.....#', '#.###.#', '#.###.#', '#.###.#', '#.....#', '#######'],
};
ICONS.special = ICONS.dash;

/** Small pixel icon for a stat category (the reference's runner/sword/shield/star/block). */
export function categoryIcon(ctx: Ctx, category: string, x: number, y: number, color: string, scale = 2): void {
  const rows = ICONS[category];
  if (!rows) return;
  for (let j = 0; j < rows.length; j++) {
    for (let i = 0; i < rows[j].length; i++) {
      if (rows[j][i] !== '#') continue;
      ctx.fillStyle = C.edgeDark;
      ctx.fillRect(x + i * scale + 1, y + j * scale + 1, scale, scale);
      ctx.fillStyle = color;
      ctx.fillRect(x + i * scale, y + j * scale, scale, scale);
    }
  }
}
