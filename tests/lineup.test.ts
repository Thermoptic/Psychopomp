import { describe, expect, it } from 'vitest';
import { ContentLibrary, memoryStorage } from '../src/content/library';
import { parseSave } from '../src/content/saveFormat';
import { createMatch, type CreatureDef } from '../src/core';
import { basePack } from './helpers';

const fresh = (text: string | null = null) => {
  const storage = memoryStorage(text);
  return { storage, lib: new ContentLibrary(basePack(), storage) };
};
const cells = (lib: ContentLibrary, id: string) =>
  lib
    .lineup()
    .filter((p) => p.creature === id)
    .map((p) => `${p.owner}@${p.x},${p.y}`)
    .sort();
/** A match from the library, as the game starts one. */
const matchFrom = (lib: ContentLibrary) => {
  const pack = lib.pack();
  return createMatch({ ruleset: pack.ruleset, board: pack.boards[0], creatures: pack.creatures, powerups: pack.powerups, seed: 1 });
};

describe('editable board lineup', () => {
  it('starts as the bundled lineup: 3 Glubber (P1) and 3 Shroud (P2)', () => {
    const { lib } = fresh();
    expect(lib.lineupIsCustom()).toBe(false);
    expect(cells(lib, 'glubber')).toEqual(['P1@0,2', 'P1@0,4', 'P1@0,6']);
    expect(cells(lib, 'shroud')).toEqual(['P2@8,2', 'P2@8,4', 'P2@8,6']);
  });

  it('moving, removing and adding pieces is saved and used by new matches', () => {
    const { lib, storage } = fresh();
    const list = lib.lineup();
    // Move a Glubber from A1-ish (0,2) to C1 (0,2 -> 2,0), remove one Shroud, add a Shroud as P1.
    const i = list.findIndex((p) => p.creature === 'glubber' && p.y === 2);
    list[i] = { ...list[i], x: 2, y: 0 };
    const next = list.filter((p) => !(p.creature === 'shroud' && p.y === 6));
    next.push({ creature: 'shroud', owner: 'P1', x: 3, y: 3 });
    lib.setLineup(next);
    expect(lib.lineupIsCustom()).toBe(true);

    const reloaded = new ContentLibrary(basePack(), storage);
    expect(cells(reloaded, 'glubber')).toEqual(['P1@0,4', 'P1@0,6', 'P1@2,0']);
    expect(cells(reloaded, 'shroud')).toEqual(['P1@3,3', 'P2@8,2', 'P2@8,4']);

    const s = matchFrom(reloaded);
    const on = (x: number, y: number) => Object.values(s.creatures).find((c) => c.x === x && c.y === y);
    expect(on(2, 0)).toMatchObject({ defId: 'glubber', owner: 'P1' });
    expect(on(3, 3)).toMatchObject({ defId: 'shroud', owner: 'P1' });
    expect(on(8, 6)).toBeUndefined();
    expect(Object.keys(s.creatures)).toHaveLength(6);
  });

  it('a monster can be taken off the board completely, and the bundled lineup restored', () => {
    const { lib } = fresh();
    lib.setLineup(lib.lineup().filter((p) => p.creature !== 'glubber'));
    expect(cells(lib, 'glubber')).toEqual([]);
    expect(Object.values(matchFrom(lib).creatures).every((c) => c.defId === 'shroud')).toBe(true);
    lib.resetLineup();
    expect(lib.lineupIsCustom()).toBe(false);
    expect(cells(lib, 'glubber')).toHaveLength(3);
  });

  it('a deleted custom monster leaves the board; a renamed one keeps its pieces', () => {
    const { lib } = fresh();
    const m: CreatureDef = { ...lib.newMonster(), id: 'imp', name: 'Imp' };
    expect(lib.saveItem('monster', m, null).ok).toBe(true);
    lib.setLineup([...lib.lineup(), { creature: 'imp', owner: 'P2', x: 4, y: 2 }]);
    expect(lib.saveItem('monster', { ...m, id: 'imp2', name: 'Imp 2' }, 'imp').ok).toBe(true);
    expect(cells(lib, 'imp2')).toEqual(['P2@4,2']);
    expect(lib.removeItem('monster', 'imp2').ok).toBe(true);
    expect(lib.lineup().some((p) => p.creature.startsWith('imp'))).toBe(false);
  });

  it("before the lineup is edited, a monster's own player + position joins the board (once)", () => {
    const { lib } = fresh();
    const m: CreatureDef = { ...lib.newMonster(), id: 'imp', name: 'Imp', player: 'P1', position: 'C5' };
    expect(lib.saveItem('monster', m, null).ok).toBe(true);
    expect(cells(lib, 'imp')).toEqual(['P1@4,2']);
    // The pack leaves own positions out (they are in the board lineup), so the match places it once.
    expect(lib.pack().creatures.find((c) => c.id === 'imp')?.position).toBeUndefined();
    expect(Object.values(matchFrom(lib).creatures).filter((c) => c.defId === 'imp')).toHaveLength(1);
  });

  it('the lineup is part of the local save; malformed entries are dropped', () => {
    const r = parseSave(
      JSON.stringify({ saveVersion: 5, contentVersion: 1, monsters: [], powerups: [], lineup: [{ creature: 'glubber', owner: 'P1', x: 1, y: 1 }, { creature: 'glubber', owner: 'P3', x: 1, y: 1 }, 'x'] }),
      basePack().ruleset,
    );
    expect(r.ok && r.value.lineup).toEqual([{ creature: 'glubber', owner: 'P1', x: 1, y: 1 }]);
    expect(r.ok && r.warnings).toHaveLength(2);
    const old = parseSave(JSON.stringify({ saveVersion: 5, contentVersion: 1, monsters: [], powerups: [] }), basePack().ruleset);
    expect(old.ok && old.value.lineup).toBeUndefined();
  });
});
