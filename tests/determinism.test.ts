import { describe, expect, it } from 'vitest';
import { applyCommands } from '../src/core';
import { newMatch, playBotMatch } from './helpers';

describe('determinism', () => {
  it('same seed + same commands = same final state', () => {
    const a = playBotMatch(42);
    const replay = applyCommands(newMatch(42), a.log);
    expect(replay.error).toBeUndefined();
    expect(replay.state).toEqual(a.state);
  });

  it('two independent runs with the same seeds are identical', () => {
    const a = playBotMatch(7, 3);
    const b = playBotMatch(7, 3);
    expect(b.log).toEqual(a.log);
    expect(b.state).toEqual(a.state);
  });

  it('a different game seed produces different dice', () => {
    const a = playBotMatch(1);
    const b = playBotMatch(2);
    expect(b.log).not.toEqual(a.log);
  });
});

describe('full match (integration)', () => {
  it.each([1, 2, 3, 42, 1234])('seed %i plays from start to victory', (seed) => {
    const { state, log } = playBotMatch(seed);
    expect(state.matchResult).not.toBe('ONGOING');
    expect(state.phase).toBe('gameOver');
    expect(log.some((c) => c.type === 'END_BATTLE')).toBe(true);
    // Living creatures never exceed max HP and dead ones are off the board.
    for (const c of Object.values(state.creatures)) {
      expect(c.hp).toBeLessThanOrEqual(state.creatureDefs[c.defId].stats.maxHp);
      if (!c.alive) expect(c.hp).toBe(0);
    }
  });
});
