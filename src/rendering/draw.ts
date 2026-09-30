// Low-level drawing primitives in the Psychopomp look: dark distressed metal
// panels, rivets, chunky monospace type, pixel dice.

import { C, FONT } from './theme';
import type { Rect } from './layout';

export type Ctx = CanvasRenderingContext2D;

export interface TextOpts {
  size?: number;
  color?: string;
  align?: CanvasTextAlign;
  baseline?: CanvasTextBaseline;
  bold?: boolean;
}

export function text(ctx: Ctx, str: string, x: number, y: number, o: TextOpts = {}): void {
  ctx.font = `${o.bold === false ? '' : 'bold '}${o.size ?? 14}px ${FONT}`;
  ctx.fillStyle = o.color ?? C.text;
  ctx.textAlign = o.align ?? 'left';
  ctx.textBaseline = o.baseline ?? 'alphabetic';
  ctx.fillText(str, Math.round(x), Math.round(y));
}

export function measure(ctx: Ctx, str: string, size = 14): number {
  ctx.font = `bold ${size}px ${FONT}`;
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

/** Bevelled metal panel with rivets and an optional coloured accent strip. */
export function panel(ctx: Ctx, r: Rect, accent?: string, fill: string = C.panel): void {
  rect(ctx, r, C.edgeDark);
  rect(ctx, { x: r.x + 2, y: r.y + 2, w: r.w - 4, h: r.h - 4 }, fill);
  ctx.fillStyle = C.edgeLight;
  ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, 1);
  ctx.fillRect(r.x + 2, r.y + 2, 1, r.h - 4);
  ctx.fillStyle = '#0b0b0f';
  ctx.fillRect(r.x + 2, r.y + r.h - 3, r.w - 4, 1);
  ctx.fillRect(r.x + r.w - 3, r.y + 2, 1, r.h - 4);
  // Scratches / rust specks, deterministic per rect.
  let seed = (r.x * 73856093) ^ (r.y * 19349663) ^ (r.w * 83492791);
  for (let i = 0; i < Math.floor((r.w * r.h) / 2600); i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const sx = r.x + 6 + (seed % Math.max(1, r.w - 12));
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    const sy = r.y + 6 + (seed % Math.max(1, r.h - 12));
    ctx.fillStyle = seed % 3 === 0 ? 'rgba(90,58,38,0.35)' : 'rgba(255,255,255,0.035)';
    ctx.fillRect(sx, sy, 2 + (seed % 5), 1);
  }
  for (const [x, y] of [
    [r.x + 5, r.y + 5],
    [r.x + r.w - 8, r.y + 5],
    [r.x + 5, r.y + r.h - 8],
    [r.x + r.w - 8, r.y + r.h - 8],
  ]) {
    ctx.fillStyle = C.edgeDark;
    ctx.fillRect(x, y, 4, 4);
    ctx.fillStyle = C.rivet;
    ctx.fillRect(x, y, 3, 3);
  }
  if (accent) {
    ctx.fillStyle = accent;
    ctx.fillRect(r.x + 12, r.y + 2, r.w - 24, 3);
  }
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
  rect(ctx, { x, y, w: s, h: s }, C.edgeDark);
  const face = o.allocated ? '#2b2a27' : value === 0 ? '#3a3935' : '#e6dfcc';
  rect(ctx, { x: x + 3, y: y + 3, w: s - 6, h: s - 6 }, face);
  if (!o.allocated && value > 0) {
    rect(ctx, { x: x + 3, y: y + s - 7, w: s - 6, h: 4 }, '#b5ad97');
  }
  const pipColor = o.allocated ? '#6d6a60' : '#15151a';
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
