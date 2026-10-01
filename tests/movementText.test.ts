import { describe, expect, it } from 'vitest';
import { MOVE_PRESETS, type CreatureDef } from '../src/core';
import { movementText } from '../src/rendering/movementText';
import { testCreature } from './helpers';

const withPattern = (cells: Array<{ x: number; y: number }>): CreatureDef => testCreature('m', {}, { movement: { type: 'pattern', cells } });

describe('board info panel: MOVEMENT line', () => {
  it('DEFAULT shows its steps', () => {
    expect(movementText(testCreature('m'))).toBe('3 STEPS');
    expect(movementText(testCreature('m', {}, { movement: { type: 'default' } }))).toBe('3 STEPS');
    expect(movementText(testCreature('m', {}, { stats: { maxHp: 20, movement: 5 } }))).toBe('5 STEPS');
    expect(movementText(testCreature('m', {}, { stats: { maxHp: 20, movement: 1 } }))).toBe('1 STEP');
  });

  it('a ready-made pattern shows its name, never the DEFAULT steps', () => {
    for (const p of MOVE_PRESETS) expect(movementText(withPattern([...p.cells()].reverse()))).toBe(p.id.toUpperCase());
    expect(movementText(withPattern(MOVE_PRESETS.find((p) => p.id === 'knight')!.cells()))).toBe('KNIGHT');
  });

  it('an anonymous pattern shows CUSTOM', () => {
    expect(movementText(withPattern([{ x: 3, y: 0 }]))).toBe('CUSTOM');
    expect(movementText(withPattern([]))).toBe('CUSTOM');
    const almostKnight = MOVE_PRESETS.find((p) => p.id === 'knight')!.cells().slice(1);
    expect(movementText(withPattern(almostKnight))).toBe('CUSTOM');
    expect(movementText(withPattern([{ x: 1, y: 0 }]))).not.toMatch(/STEP/);
  });
});
