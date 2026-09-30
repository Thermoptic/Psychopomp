// Central deterministic RNG (mulberry32). The only source of randomness in the
// game core. Its state lives inside GameState, so the same seed + the same
// commands always produce the same result.

import type { RngState } from './types';

export function createRng(seed: number): RngState {
  const s = seed >>> 0;
  return { seed: s, state: s };
}

/** Advances `rng` in place and returns a float in [0, 1). */
export function nextFloat(rng: RngState): number {
  rng.state = (rng.state + 0x6d2b79f5) >>> 0;
  let t = rng.state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Advances `rng` in place and returns an integer in [min, max] (inclusive). */
export function nextInt(rng: RngState, min: number, max: number): number {
  return min + Math.floor(nextFloat(rng) * (max - min + 1));
}

export function rollDie(rng: RngState, sides: number): number {
  return nextInt(rng, 1, sides);
}
