import { describe, expect, it } from 'vitest';
import { applyCommand, getLegalMoves, getMovableCreatures } from '../src/core';
import { customMatch, newMatch, ok, testCreature } from './helpers';

const two = [testCreature('a'), testCreature('b')];

describe('board: movement', () => {
  it('lists legal moves within the movement allowance (orthogonal)', () => {
    const s = customMatch({
      width: 9,
      height: 9,
      creatures: two,
      placements: [
        { creature: 'a', owner: 'P1', x: 4, y: 4 },
        { creature: 'b', owner: 'P2', x: 0, y: 0 },
      ],
    });
    const moves = getLegalMoves(s, 'P1-a-1');
    // Diamond of radius 3 around (4,4) minus the start cell = 24 cells.
    expect(moves).toHaveLength(24);
    for (const m of moves) expect(Math.abs(m.x - 4) + Math.abs(m.y - 4)).toBeLessThanOrEqual(3);
  });

  it('respects the movement limit', () => {
    const s = customMatch({
      width: 9,
      height: 9,
      creatures: [testCreature('a', { movement: 1 }), testCreature('b')],
      placements: [
        { creature: 'a', owner: 'P1', x: 4, y: 4 },
        { creature: 'b', owner: 'P2', x: 0, y: 0 },
      ],
    });
    expect(getLegalMoves(s, 'P1-a-1')).toHaveLength(4);
    const r = applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 4, y: 6 } });
    expect(r.error).toBeDefined();
  });

  it('rejects illegal moves without changing state', () => {
    const s = newMatch();
    const id = 'P1-glubber-1';
    for (const to of [
      { x: 8, y: 8 }, // too far
      { x: -1, y: 2 }, // off board
      { x: 0, y: 4 }, // own creature
      { x: 0, y: 2 }, // own cell (zero steps)
    ]) {
      const r = applyCommand(s, { type: 'MOVE_CREATURE', creatureId: id, to });
      expect(r.error).toBeDefined();
      expect(r.state).toBe(s);
    }
    // Wrong player's creature.
    const r = applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P2-shroud-1', to: { x: 7, y: 2 } });
    expect(r.error).toMatch(/Not your creature/);
  });

  it('friendly creatures block movement; enemies end the path', () => {
    const s = customMatch({
      creatures: two,
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'a', owner: 'P1', x: 1, y: 0 },
        { creature: 'b', owner: 'P2', x: 0, y: 1 },
      ],
    });
    const moves = getLegalMoves(s, 'P1-a-1');
    expect(moves).toEqual([{ x: 0, y: 1, steps: 1, attacks: 'P2-b-1' }]);
  });

  it('allows diagonal steps when the board allows it', () => {
    const s = customMatch({
      width: 9,
      height: 9,
      allowDiagonal: true,
      creatures: [testCreature('a', { movement: 1 }), testCreature('b')],
      placements: [
        { creature: 'a', owner: 'P1', x: 4, y: 4 },
        { creature: 'b', owner: 'P2', x: 0, y: 0 },
      ],
    });
    expect(getLegalMoves(s, 'P1-a-1')).toHaveLength(8);
  });

  it('moving onto an enemy starts a battle (attacker stays put until resolved)', () => {
    const s = customMatch({
      creatures: two,
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 2, y: 0 },
      ],
    });
    const r = applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 2, y: 0 } });
    expect(r.error).toBeUndefined();
    expect(r.state.phase).toBe('battle');
    expect(r.state.battle?.attackerId).toBe('P1-a-1');
    expect(r.state.battle?.defenderId).toBe('P2-b-1');
    expect(r.state.creatures['P1-a-1']).toMatchObject({ x: 0, y: 0 });
    expect(r.events.some((e) => e.type === 'BATTLE_STARTED')).toBe(true);
  });
});

describe('board: turns and Power Points', () => {
  it('switches turns after a move', () => {
    let s = newMatch();
    expect(s.currentTurn).toEqual({ player: 'P1', number: 1 });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-glubber-1', to: { x: 1, y: 2 } });
    expect(s.currentTurn).toEqual({ player: 'P2', number: 2 });
    expect(applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-glubber-1', to: { x: 2, y: 2 } }).error).toBeDefined();
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-shroud-1', to: { x: 7, y: 2 } });
    expect(s.currentTurn.player).toBe('P1');
  });

  it('starting positions on Power Points claim them', () => {
    const s = newMatch();
    expect(s.powerPoints.find((p) => p.x === 0 && p.y === 4)?.owner).toBe('P1');
    expect(s.powerPoints.find((p) => p.x === 8 && p.y === 4)?.owner).toBe('P2');
    expect(s.powerPoints.filter((p) => p.owner === null)).toHaveLength(3);
  });

  it('captures a Power Point by moving onto it and keeps it after leaving', () => {
    let s = newMatch();
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-glubber-1', to: { x: 3, y: 2 } });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-shroud-1', to: { x: 7, y: 2 } });
    const r = applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-glubber-1', to: { x: 4, y: 0 } });
    expect(r.events).toContainEqual({ type: 'POWER_POINT_CAPTURED', x: 4, y: 0, owner: 'P1' });
    s = r.state;
    expect(s.powerPoints.find((p) => p.x === 4 && p.y === 0)?.owner).toBe('P1');
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-shroud-1', to: { x: 6, y: 2 } });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-glubber-1', to: { x: 4, y: 1 } });
    expect(s.powerPoints.find((p) => p.x === 4 && p.y === 0)?.owner).toBe('P1');
  });

  it('PASS_TURN is only legal with no legal moves', () => {
    const s = newMatch();
    expect(getMovableCreatures(s).length).toBeGreaterThan(0);
    expect(applyCommand(s, { type: 'PASS_TURN' }).error).toMatch(/legal move/);

    const boxed = customMatch({
      width: 3,
      height: 3,
      powerPoints: [{ x: 1, y: 1 }],
      blockedCells: [
        { x: 1, y: 0 },
        { x: 0, y: 1 },
      ],
      creatures: two,
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 2, y: 2 },
      ],
    });
    expect(getMovableCreatures(boxed)).toEqual([]);
    const passed = ok(boxed, { type: 'PASS_TURN' });
    expect(passed.currentTurn.player).toBe('P2');
  });
});
