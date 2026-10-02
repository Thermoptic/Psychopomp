// Board surface in the reference style: heavy metal frame (9-slice of the board
// art), worn stone tiles and lit Power Point symbols. Used by the strategic
// board and the combat arena, so combat reads as the board transforming.
// It only visualises the grid it is given; Power Points come from game state.

import type { PlayerId } from '../core/types';
import { BOARD_GRID_X, BOARD_GRID_Y, BOARD_OUTER, boardFrameImage, boardTileSprite, type Sprite } from './art';
import { badge, rect, type Ctx } from './draw';
import { cellRect, type BoardLayout, type Rect } from './layout';
import { C, playerColor } from './theme';

/** Draws a cropped art sprite with smoothing (the art is downscaled a lot). */
export function drawSprite(ctx: Ctx, s: Sprite, dx: number, dy: number, dw: number, dh: number): void {
  const prev = ctx.imageSmoothingEnabled;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(s.img, s.sx, s.sy, s.sw, s.sh, dx, dy, dw, dh);
  ctx.imageSmoothingEnabled = prev;
}

/** The board art's frame stretched around `dst` with the given border thickness. */
function drawFrame(ctx: Ctx, dst: Rect, t: number): boolean {
  const img = boardFrameImage();
  if (!img) return false;
  const L = BOARD_GRID_X[0];
  const T = BOARD_GRID_Y[0];
  const R = BOARD_OUTER.x1 - BOARD_GRID_X[9];
  const B = BOARD_OUTER.y1 - BOARD_GRID_Y[9];
  const iw = BOARD_GRID_X[9] - L;
  const ih = BOARD_GRID_Y[9] - T;
  const { x, y, w, h } = dst;
  const part = (sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number) =>
    drawSprite(ctx, { img, sx, sy, sw, sh }, dx, dy, dw, dh);
  part(0, 0, L, T, x, y, t, t);
  part(L + iw, 0, R, T, x + w - t, y, t, t);
  part(0, T + ih, L, B, x, y + h - t, t, t);
  part(L + iw, T + ih, R, B, x + w - t, y + h - t, t, t);
  part(L, 0, iw, T, x + t, y, w - 2 * t, t);
  part(L, T + ih, iw, B, x + t, y + h - t, w - 2 * t, t);
  part(0, T, L, ih, x, y + t, t, h - 2 * t);
  part(L + iw, T, R, ih, x + w - t, y + t, t, h - 2 * t);
  return true;
}

/**
 * Frame + tiles for a columns × rows grid laid out by `l` inside `frame`.
 * 'board' uses the reference board's tile pattern, 'arena' a plain checker.
 */
export function drawBoardSurface(ctx: Ctx, frame: Rect, l: BoardLayout, columns: number, rows: number, mode: 'board' | 'arena'): void {
  const t = 10;
  rect(ctx, frame, C.edgeDark);
  if (!drawFrame(ctx, frame, t)) {
    rect(ctx, frame, '#2a241d');
    rect(ctx, { x: frame.x + 3, y: frame.y + 3, w: frame.w - 6, h: frame.h - 6 }, C.edgeDark);
  }
  const inner = { x: frame.x + t, y: frame.y + t, w: frame.w - 2 * t, h: frame.h - 2 * t };
  rect(ctx, inner, '#080605');
  // Tiles never spill over the frame (the arena frame animates open).
  ctx.save();
  ctx.beginPath();
  ctx.rect(inner.x, inner.y, inner.w, inner.h);
  ctx.clip();
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const r = cellRect(l, { x, y });
      const s = boardTileSprite(x, y, mode);
      if (s) drawSprite(ctx, s, r.x, r.y, r.w, r.h);
      else rect(ctx, r, (x + y) % 2 === 0 ? C.cellA : C.cellB);
      // Mortar line between tiles.
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.fillRect(r.x, r.y + r.h - 1, r.w, 1);
      ctx.fillRect(r.x + r.w - 1, r.y, 1, r.h);
    }
  }
  ctx.restore();
}

/**
 * A lit Power Point symbol (crosshair target) on a cell: orange when neutral,
 * the owner's colour when held, plus the owner's badge (not colour alone).
 */
export function drawPowerPointMarker(ctx: Ctx, r: Rect, owner: PlayerId | null): void {
  const col = owner ? playerColor(owner) : C.ppMark;
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const rad = r.w * 0.3;
  const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, r.w * 0.55);
  glow.addColorStop(0, owner === 'P2' ? 'rgba(79,168,240,0.35)' : 'rgba(237,65,32,0.35)');
  glow.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = C.edgeDark;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, rad, 0, Math.PI * 2);
  ctx.stroke();
  // Crosshair ticks and centre.
  const k = Math.max(3, Math.round(r.w * 0.12));
  ctx.fillStyle = col;
  ctx.fillRect(Math.round(cx - 1.5), Math.round(cy - rad - k + 1), 3, k);
  ctx.fillRect(Math.round(cx - 1.5), Math.round(cy + rad - 1), 3, k);
  ctx.fillRect(Math.round(cx - rad - k + 1), Math.round(cy - 1.5), k, 3);
  ctx.fillRect(Math.round(cx + rad - 1), Math.round(cy - 1.5), k, 3);
  ctx.fillRect(Math.round(cx - 3), Math.round(cy - 3), 6, 6);
  ctx.fillStyle = C.edgeDark;
  ctx.fillRect(Math.round(cx - 1), Math.round(cy - 1), 2, 2);
  if (owner) badge(ctx, r.x + r.w - 8, r.y + r.h - 8, 9, owner, col);
}
