import { describe, expect, it } from 'vitest';
import { loadContentPack } from '../src/content/loader';
import { validateBoard, validateCreature } from '../src/content/validate';
import { bundledPackFiles } from '../src/platform/web/bundledContent';
import { basePack, testCreature } from './helpers';

describe('content', () => {
  const ruleset = basePack().ruleset;

  it('the bundled base pack is valid and contains Glubber and Shroud', () => {
    const r = loadContentPack(bundledPackFiles().base);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.pack.creatures.map((c) => c.id).sort()).toEqual(['glubber', 'shroud']);
    expect(r.pack.boards[0].powerPoints).toHaveLength(5);
  });

  it('accepts a valid creature', () => {
    expect(validateCreature(testCreature('valid_one'), ruleset)).toEqual({ ok: true, errors: [] });
  });

  it('rejects a creature with missing id, bad stats and wrong dice total', () => {
    const bad = { ...testCreature('x'), id: '', stats: { maxHp: 0, movement: 3, power: 1, speed: 1, shield: 1 } } as unknown;
    const r = validateCreature(bad, ruleset);
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/id/);
    expect(r.errors.join('\n')).toMatch(/maxHp/);

    const wrongDice = testCreature('y', {}, { dice: { slots: { power: 2 } } });
    expect(validateCreature(wrongDice, ruleset).errors.join()).toMatch(/total 2/);
  });

  it('rejects an invalid Special', () => {
    const r = validateCreature(
      testCreature('z', {}, { special: { name: 'Bad', requirement: { type: 'nonsense' } as never, effect: { type: 'explode', value: 1 } as never } }),
      ruleset,
    );
    expect(r.ok).toBe(false);
    expect(r.errors.join('\n')).toMatch(/unknown requirement/);
    expect(r.errors.join('\n')).toMatch(/unknown effect/);
  });

  it('detects duplicate ids in a pack', () => {
    const files = { ...bundledPackFiles().base };
    files['monsters/dupe.json'] = { ...(files['monsters/glubber.json'] as object) };
    files['pack.json'] = { ...(files['pack.json'] as object), creatures: ['monsters/glubber.json', 'monsters/dupe.json'] };
    const r = loadContentPack(files);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.errors.join()).toMatch(/duplicate/);
  });

  it('detects missing files and unknown creatures on the board', () => {
    const files = { ...bundledPackFiles().base };
    files['pack.json'] = { ...(files['pack.json'] as object), creatures: ['monsters/missing.json'] };
    const r = loadContentPack(files);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.join('\n')).toMatch(/not found/);
      expect(r.errors.join('\n')).toMatch(/unknown creature/);
    }
  });

  it('rejects boards with off-board placements', () => {
    const board = { ...(bundledPackFiles().base['boards/classic.json'] as object), placements: [{ creature: 'glubber', owner: 'P1', x: 99, y: 0 }] };
    expect(validateBoard(board, new Set(['glubber'])).ok).toBe(false);
  });
});
