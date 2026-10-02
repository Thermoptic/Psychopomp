// Melee feedback: a fast swish across the attack cone, centred on the swing's
// aim, shown the moment the attack button is pressed. Presentation only - hit
// or miss is decided by the game core.

import type { Ctx } from './draw';

/** How long a swish is shown. */
export const SLASH_MS = 150;

const easeOut = (t: number) => 1 - (1 - t) * (1 - t);

/** Half-angle of the attack cone (attackConeCos in percent; capped so a full circle still reads as a swing). */
export function coneHalfAngle(attackConeCos: number): number {
  return Math.min(Math.acos(Math.max(-1, Math.min(1, attackConeCos / 100))), (150 * Math.PI) / 180);
}

/**
 * The swish: a crescent trail that sweeps across the cone almost at once
 * (first 35 % of the time) and then fades; `t` 0 -> 1 over SLASH_MS.
 * Brightest (white) at the leading edge, the owner's colour behind it.
 */
export function drawSwish(ctx: Ctx, cx: number, cy: number, aim: { x: number; y: number }, half: number, reach: number, t: number, color: string): void {
  const dir = Math.atan2(aim.y, aim.x);
  const sweep = aim.x >= 0 ? 1 : -1;
  const p = easeOut(Math.min(1, t / 0.35));
  const a0 = dir - sweep * half;
  const a = a0 + sweep * 2 * half * p;
  const fade = t < 0.35 ? 1 : 1 - (t - 0.35) / 0.65;
  const rIn = reach * 0.3;
  const rOut = reach * 1.05;
  const steps = 12;
  ctx.save();
  for (let i = 0; i < steps; i++) {
    const s0 = a0 + ((a - a0) * i) / steps;
    const s1 = a0 + ((a - a0) * (i + 1)) / steps;
    const k = (i + 1) / steps;
    ctx.globalAlpha = fade * (0.15 + 0.75 * k);
    ctx.fillStyle = k > 0.75 ? '#ffffff' : color;
    ctx.beginPath();
    ctx.arc(cx, cy, rOut, Math.min(s0, s1), Math.max(s0, s1));
    ctx.arc(cx, cy, rIn + (rOut - rIn) * (0.6 - 0.4 * k), Math.max(s0, s1), Math.min(s0, s1), true);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}
