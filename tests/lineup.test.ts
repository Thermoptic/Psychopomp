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
  it('starts as the bundled lineup: one Glubber (P1, E1) and one Shroud (P2, E9)', () => {
    const { lib } = fresh();
    expect(lib.lineupIsCustom()).toBe(false);
    expect(cells(lib, 'glubber')).toEqual(['P1@0,4']);
    expect(cells(lib, 'shroud')).toEqual(['P2@8,4']);
    expect(Object.keys(matchFrom(lib).creatures).sort()).toEqual(['P1-glubber-1', 'P2-shroud-1']);
  });

  it('moving, removing and adding pieces is saved and used by new matches', () => {
    const { lib, storage } = fresh();
    const list = lib.lineup();
    // Move the Glubber from E1 (0,4) to A3 (2,0), add a second Glubber on G1 and a Shroud for P1 on D4.
    const i = list.findIndex((p) => p.creature === 'glubber');
    list[i] = { ...list[i], x: 2, y: 0 };
    list.push({ creature: 'glubber', owner: 'P1', x: 0, y: 6 }, { creature: 'shroud', owner: 'P1', x: 3, y: 3 });
    lib.setLineup(list);
    expect(lib.lineupIsCustom()).toBe(true);

    const reloaded = new ContentLibrary(basePack(), storage);
    expect(cells(reloaded, 'glubber')).toEqual(['P1@0,6', 'P1@2,0']);
    expect(cells(reloaded, 'shroud')).toEqual(['P1@3,3', 'P2@8,4']);

    const s = matchFrom(reloaded);
    const on = (x: number, y: number) => Object.values(s.creatures).find((c) => c.x === x && c.y === y);
    expect(on(2, 0)).toMatchObject({ defId: 'glubber', owner: 'P1' });
    expect(on(3, 3)).toMatchObject({ defId: 'shroud', owner: 'P1' });
    expect(on(0, 4)).toBeUndefined();
    expect(Object.keys(s.creatures)).toHaveLength(4);
  });

  it('a monster can be taken off the board completely, and the bundled lineup restored', () => {
    const { lib } = fresh();
    lib.setLineup(lib.lineup().filter((p) => p.creature !== 'glubber'));
    expect(cells(lib, 'glubber')).toEqual([]);
    expect(Object.values(matchFrom(lib).creatures).every((c) => c.defId === 'shroud')).toBe(true);
    lib.resetLineup();
    expect(lib.lineupIsCustom()).toBe(false);
    expect(cells(lib, 'glubber')).toHaveLength(1);
  });

  it('bundled monsters can be deleted (and leave the board) and restored', () => {
    const { lib, storage } = fresh();
    expect(lib.removeItem('monster', 'glubber').ok).toBe(true);
    const after = new ContentLibrary(basePack(), storage);
    expect(after.creatures().map((c) => c.id)).toEqual(['shroud']);
    expect(after.deletedBase('monster').map((c) => c.id)).toEqual(['glubber']);
    expect(cells(after, 'glubber')).toEqual([]);
    expect(Object.keys(matchFrom(after).creatures)).toEqual(['P2-shroud-1']);
    // Its id stays reserved until it is restored.
    expect(after.validateMonster({ ...after.newMonster(), id: 'glubber', name: 'X' }, null).join()).toMatch(/deleted bundled/);
    after.restoreItem('monster', 'glubber');
    expect(after.creatures().map((c) => c.id)).toEqual(['glubber', 'shroud']);
    expect(cells(after, 'glubber')).toEqual(['P1@0,4']);
  });

  it('deleting a modified bundled monster removes the local edits too', () => {
    const { lib } = fresh();
    const g = lib.get('monster', 'glubber')!.item;
    expect(lib.saveItem('monster', { ...g, name: 'Big Glubber' }, 'glubber').ok).toBe(true);
    expect(lib.get('monster', 'glubber')!.origin).toBe('modified');
    expect(lib.removeItem('monster', 'glubber').ok).toBe(true);
    expect(lib.get('monster', 'glubber')).toBeUndefined();
    lib.restoreItem('monster', 'glubber');
    expect(lib.get('monster', 'glubber')).toMatchObject({ origin: 'base', item: { name: 'Glubber' } });
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
