import type { PlayerId } from '../core/types';

/** Logical canvas resolution. The canvas is scaled to fit the window. */
export const VIEW_W = 960;
export const VIEW_H = 540;

export const C = {
  bg: '#07070a',
  panel: '#14141a',
  panel2: '#1c1c24',
  edgeLight: '#4d4c58',
  edgeDark: '#040406',
  rivet: '#6a6874',
  rust: '#5a3a26',
  text: '#dcd6c4',
  dim: '#8a8578',
  faint: '#3d3b35',
  p1: '#f2b441',
  p1dark: '#6e4a10',
  p2: '#b35cff',
  p2dark: '#431b6b',
  pp: '#39e0c8',
  ppDark: '#0f4a43',
  danger: '#ff4a3d',
  ok: '#6ee06a',
  cellA: '#111117',
  cellB: '#17171e',
  legal: 'rgba(57, 224, 200, 0.22)',
  attack: 'rgba(255, 74, 61, 0.35)',
} as const;

export const FONT = "'Courier New', Courier, monospace";

export function playerColor(p: PlayerId | null): string {
  return p === 'P1' ? C.p1 : p === 'P2' ? C.p2 : C.dim;
}

export function playerDark(p: PlayerId | null): string {
  return p === 'P1' ? C.p1dark : p === 'P2' ? C.p2dark : C.faint;
}

export function playerLabel(p: PlayerId): string {
  return p === 'P1' ? 'PLAYER 1' : 'PLAYER 2';
}
