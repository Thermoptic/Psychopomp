import type { PlayerId } from '../core/types';
import { DISPLAY_FONT_FAMILY } from './art';

/** Logical canvas resolution. The canvas is scaled to fit the window. */
export const VIEW_W = 960;
export const VIEW_H = 540;

// Palette sampled from the visual references (art/references/): dark worn
// metal, warm parchment text, red/orange for Player 1 and blue for Player 2.
export const C = {
  bg: '#0b0908',
  panel: '#0f0e0c',
  panel2: '#1a1814',
  edgeLight: '#6b5d4a',
  edgeDark: '#050404',
  steel: '#3a3229',
  steelLight: '#5c5040',
  rivet: '#8a7a62',
  rust: '#5a3a26',
  text: '#f2e6cc',
  dim: '#9a8c74',
  faint: '#4a4238',
  p1: '#f0552a',
  p1dark: '#62281a',
  p2: '#4fa8f0',
  p2dark: '#1f4670',
  /** UI highlight (selection, hints, guard). */
  pp: '#e8cf7a',
  ppDark: '#4a3f1c',
  /** Power Point symbol (neutral). */
  ppMark: '#ed4120',
  danger: '#ff4a3d',
  ok: '#b8ea79',
  cellA: '#0d0b09',
  cellB: '#5e5244',
  legal: 'rgba(232, 207, 122, 0.28)',
  attack: 'rgba(255, 74, 61, 0.40)',
} as const;

/** Stat category colours (labels and dice faces), from the reference panels. */
export const CATEGORY_COLOR: Record<string, string> = {
  speed: '#57b1f0',
  power: '#ef3c19',
  shield: '#f7e998',
  dash: '#b8ea79',
  special: '#b8ea79',
  block: '#52a3f3',
};

/** Die face colour per category (the reference's white/red/yellow/green/blue dice). */
export const DIE_FACE: Record<string, string> = {
  speed: '#e6dfcc',
  power: '#d8432a',
  shield: '#e7c25a',
  dash: '#79b84c',
  special: '#79b84c',
  block: '#3f88d8',
};

/** Body text: small sizes stay in a crisp monospace. */
export const FONT = "'Courier New', Courier, monospace";
/** Display text (titles, names, labels): the bundled gothic pixel font. */
export const DISPLAY_FONT = `'${DISPLAY_FONT_FAMILY}', ${FONT}`;

export function playerColor(p: PlayerId | null): string {
  return p === 'P1' ? C.p1 : p === 'P2' ? C.p2 : C.dim;
}

export function playerDark(p: PlayerId | null): string {
  return p === 'P1' ? C.p1dark : p === 'P2' ? C.p2dark : C.faint;
}

export function playerLabel(p: PlayerId): string {
  return p === 'P1' ? 'PLAYER 1' : 'PLAYER 2';
}
