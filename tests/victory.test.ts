import { describe, expect, it } from 'vitest';
import { applyCommand, evaluateVictory } from '../src/core';
import { customMatch, fightToResult, newMatch, ok, prepareBothAndBegin, testCreature } from './helpers';

const strong = testCreature('a', { power: 60 }, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });
const weak = testCreature('b', { power: 0, maxHp: 3 }, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });

describe('victory', () => {
  it('a fresh match is ONGOING', () => {
    expect(evaluateVictory(newMatch()).result).toBe('ONGOING');
    expect(newMatch().matchResult).toBe('ONGOING');
  });

  it('controlling all five Power Points wins', () => {
    const s0 = customMatch({
      width: 9,
      height: 9,
      creatures: [strong, weak],
      powerPoints: [
        { x: 4, y: 0, owner: 'P1' },
        { x: 0, y: 4, owner: 'P1' },
        { x: 4, y: 4 },
        { x: 8, y: 4, owner: 'P1' },
        { x: 4, y: 8, owner: 'P1' },
      ],
      placements: [
        { creature: 'a', owner: 'P1', x: 4, y: 2 },
        { creature: 'b', owner: 'P2', x: 8, y: 8 },
      ],
    });
    expect(s0.matchResult).toBe('ONGOING');
    const r = applyCommand(s0, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 4, y: 4 } });
    expect(r.state.matchResult).toBe('PLAYER_1');
    expect(r.state.victoryReason).toBe('powerPoints');
    expect(r.state.phase).toBe('gameOver');
    expect(r.events).toContainEqual({ type: 'MATCH_ENDED', result: 'PLAYER_1' });
  });

  it('eliminating the last enemy creature wins, even without Power Points', () => {
    let s = customMatch({
      creatures: [strong, weak],
      powerPoints: [
        { x: 0, y: 4, owner: 'P2' },
        { x: 4, y: 4, owner: 'P2' },
      ],
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 1, y: 0 },
      ],
    });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
    s = fightToResult(prepareBothAndBegin(s));
    s = ok(s, { type: 'END_BATTLE' });
    expect(s.matchResult).toBe('PLAYER_1');
    expect(s.victoryReason).toBe('elimination');
  });

  it('no further commands are accepted after the match ends', () => {
    let s = customMatch({
      creatures: [strong, weak],
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 1, y: 0 },
      ],
    });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
    s = ok(fightToResult(prepareBothAndBegin(s)), { type: 'END_BATTLE' });
    expect(applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 2, y: 0 } }).error).toMatch(/over/);
  });

  it('both sides eliminated at once is a DRAW', () => {
    const s = customMatch({
      creatures: [strong, weak],
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 1, y: 0 },
      ],
    });
    const dead = structuredClone(s);
    for (const c of Object.values(dead.creatures)) c.alive = false;
    expect(evaluateVictory(dead).result).toBe('DRAW');
  });
});
