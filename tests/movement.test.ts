import { describe, expect, it } from 'vitest';
import { ContentLibrary, memoryStorage } from '../src/content/library';
import { parseContentFile, parseSave } from '../src/content/saveFormat';
import { applyCommand, getLegalMoves, type Cell, type CreatureDef, type GameState } from '../src/core';
import {
  ItemEditor,
  MOVE_PRESETS,
  defaultReach,
  isPatternMovement,
  movementLabel,
  patternCells,
  setDefaultMovement,
  setPatternMovement,
  toggleMovementCell,
} from '../src/devEditor/model';
import { basePack, customMatch, ok, testCreature } from './helpers';

const fresh = (text: string | null = null) => {
  const storage = memoryStorage(text);
  return { storage, lib: new ContentLibrary(basePack(), storage) };
};
const cellSet = (cells: Cell[]) => new Set(cells.map((c) => `${c.x},${c.y}`));
const movesOf = (s: GameState, id: string) => cellSet(getLegalMoves(s, id));
const offsetsFrom = (s: GameState, id: string) => {
  const c = s.creatures[id];
  return cellSet(getLegalMoves(s, id).map((m) => ({ x: m.x - c.x, y: m.y - c.y })));
};
const pattern = (cells: Array<[number, number]>): CreatureDef['movement'] => ({ type: 'pattern', cells: cells.map(([x, y]) => ({ x, y })) });

// --- EDITOR -------------------------------------------------------------------------------------------

describe('Movement in the Monster Editor', () => {
  it('DEFAULT is the default for new monsters and shows 3 steps', () => {
    const { lib } = fresh();
    const m = lib.newMonster();
    expect(m.movement).toEqual({ type: 'default' });
    expect(m.stats.movement).toBe(3);
    expect(movementLabel(m)).toBe('DEFAULT — 3 steps');
  });

  it('a custom pattern can be chosen; clicking a cell adds it, clicking again removes it', () => {
    const m = testCreature('m');
    setPatternMovement(m, []);
    expect(isPatternMovement(m)).toBe(true);
    expect(toggleMovementCell(m, 0, -1)).toBe(true);
    expect(patternCells(m)).toEqual([{ x: 0, y: -1 }]);
    toggleMovementCell(m, 2, 1);
    expect(patternCells(m)).toEqual([{ x: 0, y: -1 }, { x: 2, y: 1 }]);
    toggleMovementCell(m, 0, -1);
    expect(patternCells(m)).toEqual([{ x: 2, y: 1 }]);
    expect(movementLabel(m)).toBe('CUSTOM — 1 cells');
  });

  it('the monster\'s own cell can never be marked', () => {
    const m = testCreature('m');
    setPatternMovement(m, []);
    expect(toggleMovementCell(m, 0, 0)).toBe(false);
    expect(patternCells(m)).toEqual([]);
    setPatternMovement(m, [{ x: 0, y: 0 }, { x: 1, y: 0 }]);
    expect(patternCells(m)).toEqual([{ x: 1, y: 0 }]);
    const { lib } = fresh();
    expect(lib.validateMonster({ ...lib.newMonster(), movement: pattern([[0, 0]]) }, null).join()).toMatch(/not 0,0/);
  });

  it('presets fill a pattern and are recognised by name; DEFAULT can be restored', () => {
    const m = testCreature('m');
    setPatternMovement(m, MOVE_PRESETS.find((p) => p.id === 'knight')!.cells());
    expect(movementLabel(m)).toBe('KNIGHT');
    setDefaultMovement(m);
    expect(m.movement).toEqual({ type: 'default' });
    expect(defaultReach(3)).toHaveLength(24); // the DEFAULT preview: the 3-step diamond
  });

  it('the pattern is saved and loaded as relative offsets', () => {
    const { lib, storage } = fresh();
    const ed = new ItemEditor(lib, 'monster');
    ed.newItem();
    ed.update((m) => ((m.id = 'hopper'), (m.name = 'Hopper'), setPatternMovement(m, [])));
    // E5-centred grid: marking E4, E6, D5, F5 = left, right, up, down of the monster.
    for (const [x, y] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) ed.update((m) => toggleMovementCell(m, x, y));
    expect(ed.save().ok).toBe(true);
    const again = new ContentLibrary(basePack(), storage);
    expect(again.get('monster', 'hopper')!.item.movement).toEqual(pattern([[-1, 0], [1, 0], [0, -1], [0, 1]]));
    const file = lib.serialize('monster', lib.get('monster', 'hopper')!.item);
    const back = parseContentFile(file, basePack().ruleset);
    expect(back.ok && back.value.kind === 'monster' && back.value.item.movement).toEqual(pattern([[-1, 0], [1, 0], [0, -1], [0, 1]]));
  });

  it('old monsters without movement data are migrated to DEFAULT', () => {
    const rules = basePack().ruleset;
    const old = { id: 'old', name: 'Old', art: {}, stats: { maxHp: 9, movement: 2 }, dice: { slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } }, special: null };
    const r = parseSave(JSON.stringify({ saveVersion: 3, contentVersion: 1, monsters: [old] }), rules);
    expect(r.ok && r.value.monsters[0].movement).toEqual({ type: 'default' });
    expect(basePack().creatures.every((c) => c.movement?.type === 'default')).toBe(true);
    expect(fresh().lib.validateMonster({ ...fresh().lib.newMonster(), movement: { type: 'teleport' } as never }, null).join()).toMatch(/movement.type/);
  });
});

// --- GAME CORE -------------------------------------------------------------------------------------------

/** 9×9, one P1 monster `a` at E5 (x4,y4) plus a far P2 monster. */
function board(aDef: Partial<CreatureDef> = {}, extra: Array<{ creature: string; owner: 'P1' | 'P2'; x: number; y: number }> = [], blocked: Cell[] = []): GameState {
  return customMatch({
    width: 9,
    height: 9,
    blockedCells: blocked,
    powerPoints: [{ x: 0, y: 8 }],
    creatures: [testCreature('a', {}, aDef), testCreature('b')],
    placements: [{ creature: 'a', owner: 'P1', x: 4, y: 4 }, { creature: 'b', owner: 'P2', x: 8, y: 0 }, ...extra],
  });
}

describe('Movement patterns in the game core', () => {
  it('1. a DEFAULT monster keeps exactly the old movement (3-step cardinal paths)', () => {
    const withDefault = board({ movement: { type: 'default' } });
    const withoutData = board();
    expect(movesOf(withDefault, 'P1-a-1')).toEqual(movesOf(withoutData, 'P1-a-1'));
    expect(offsetsFrom(withDefault, 'P1-a-1')).toEqual(cellSet(defaultReach(3)));
  });

  it('2. a custom pattern allows only its destinations', () => {
    const s = board({ movement: pattern([[0, -1], [-1, 0], [1, 0], [0, 1]]) });
    expect(offsetsFrom(s, 'P1-a-1')).toEqual(cellSet([{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]));
    expect(applyCommand(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 4, y: 2 } }).error).toMatch(/Illegal/); // 2 up: not in the pattern
    expect(ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 4, y: 3 } }).creatures['P1-a-1']).toMatchObject({ x: 4, y: 3 });
  });

  it('3. the same pattern works wherever the monster stands (relative offsets)', () => {
    const knight: CreatureDef['movement'] = { type: 'pattern', cells: MOVE_PRESETS.find((p) => p.id === 'knight')!.cells() };
    const s = customMatch({ width: 9, height: 9, powerPoints: [{ x: 0, y: 8 }], creatures: [testCreature('a', {}, { movement: knight }), testCreature('b')], placements: [{ creature: 'a', owner: 'P1', x: 4, y: 4 }, { creature: 'a', owner: 'P1', x: 1, y: 7 }, { creature: 'b', owner: 'P2', x: 8, y: 0 }] });
    expect(offsetsFrom(s, 'P1-a-1').size).toBe(8);
    const fromSecond = offsetsFrom(s, 'P1-a-2');
    for (const k of fromSecond) expect(cellSet(knight.cells).has(k)).toBe(true);
  });

  it('4. board boundaries cut a pattern off', () => {
    const s = customMatch({ width: 9, height: 9, powerPoints: [{ x: 4, y: 4 }], creatures: [testCreature('a', {}, { movement: pattern([[-1, 0], [1, 0], [0, -1], [0, 1], [-2, -2]]) }), testCreature('b')], placements: [{ creature: 'a', owner: 'P1', x: 0, y: 0 }, { creature: 'b', owner: 'P2', x: 8, y: 8 }] });
    expect(movesOf(s, 'P1-a-1')).toEqual(cellSet([{ x: 1, y: 0 }, { x: 0, y: 1 }]));
  });

  it('5. other monsters and blocked cells work as before', () => {
    const rook: CreatureDef['movement'] = { type: 'pattern', cells: MOVE_PRESETS.find((p) => p.id === 'rook')!.cells() };
    // Friendly at E6 (x5,y4): blocks that destination and the line behind it. Enemy at C5 (x4,y2): a battle, line stops there.
    const s = board({ movement: rook }, [{ creature: 'a', owner: 'P1', x: 5, y: 4 }, { creature: 'b', owner: 'P2', x: 4, y: 2 }], [{ x: 3, y: 4 }]);
    const moves = getLegalMoves(s, 'P1-a-1');
    const at = (x: number, y: number) => moves.find((m) => m.x === x && m.y === y);
    expect(at(5, 4)).toBeUndefined(); // own monster
    expect(at(6, 4)).toBeUndefined(); // behind it: path blocked
    expect(at(3, 4)).toBeUndefined(); // blocked cell
    expect(at(2, 4)).toBeUndefined(); // behind the blocked cell
    expect(at(4, 3)).toBeDefined();
    expect(at(4, 2)?.attacks).toBe('P2-b-2'); // enemy = battle
    expect(at(4, 1)).toBeUndefined(); // line stops at the enemy
    expect(at(4, 8)).toBeDefined(); // open line down to the edge
    // A knight jump goes over monsters.
    const jumpy = board({ movement: pattern([[1, -2]]) }, [{ creature: 'a', owner: 'P1', x: 4, y: 3 }, { creature: 'a', owner: 'P1', x: 5, y: 3 }]);
    expect(movesOf(jumpy, 'P1-a-1')).toEqual(cellSet([{ x: 5, y: 2 }]));
  });

  it('6. steps (stats.movement) keep driving DEFAULT; Speed does not affect the board; patterns ignore steps', () => {
    const two = board({ stats: { maxHp: 20, movement: 2 } });
    expect(offsetsFrom(two, 'P1-a-1')).toEqual(cellSet(defaultReach(2)));
    const fast = board({ modifiers: { speed: 50 } });
    expect(movesOf(fast, 'P1-a-1')).toEqual(movesOf(board(), 'P1-a-1'));
    const patternedOneStep = board({ stats: { maxHp: 20, movement: 1 }, movement: pattern([[0, -3]]) });
    expect(movesOf(patternedOneStep, 'P1-a-1')).toEqual(cellSet([{ x: 4, y: 1 }]));
  });

  it('7. P1 and P2 use their own patterns independently', () => {
    const s = customMatch({
      width: 9,
      height: 9,
      powerPoints: [{ x: 0, y: 8 }],
      creatures: [testCreature('a', {}, { movement: pattern([[1, 0]]) }), testCreature('b', {}, { movement: pattern([[0, 1], [0, 2]]) })],
      placements: [{ creature: 'a', owner: 'P1', x: 1, y: 1 }, { creature: 'b', owner: 'P2', x: 7, y: 1 }],
    });
    expect(offsetsFrom(s, 'P1-a-1')).toEqual(cellSet([{ x: 1, y: 0 }]));
    let t = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 2, y: 1 } });
    expect(offsetsFrom(t, 'P2-b-1')).toEqual(cellSet([{ x: 0, y: 1 }, { x: 0, y: 2 }]));
    t = ok(t, { type: 'MOVE_CREATURE', creatureId: 'P2-b-1', to: { x: 7, y: 3 } });
    expect(t.creatures['P2-b-1']).toMatchObject({ x: 7, y: 3 });
  });
});

describe('DEFAULT and CUSTOM PATTERN are separate movement models', () => {
  const rookLine = pattern([[1, 0], [2, 0], [3, 0]]);

  it('1. DEFAULT with 3 steps works exactly as before (cardinal BFS, 24 cells from E5)', () => {
    const s = board({ movement: { type: 'default' } });
    expect(offsetsFrom(s, 'P1-a-1')).toEqual(cellSet(defaultReach(3)));
    // Still a step-based path: a friendly at E6 is walked around, not jumped.
    const around = board({ movement: { type: 'default' } }, [{ creature: 'a', owner: 'P1', x: 5, y: 4 }]);
    const m = getLegalMoves(around, 'P1-a-1').find((q) => q.x === 6 && q.y === 4);
    expect(m).toBeUndefined();
  });

  it('2. DEFAULT with 5 steps still uses step-based movement', () => {
    const s = board({ stats: { maxHp: 20, movement: 5 } });
    expect(offsetsFrom(s, 'P1-a-1')).toEqual(cellSet(defaultReach(5).filter((c) => Math.abs(c.x) <= 4 && Math.abs(c.y) <= 4)));
    expect(offsetsFrom(s, 'P1-a-1').has('1,1')).toBe(true); // diagonal only via two cardinal steps
    expect(Math.max(...getLegalMoves(s, 'P1-a-1').map((m) => m.steps))).toBe(5);
  });

  it('3. CUSTOM (+3,0) is one direct destination, not three steps, and ignores DEFAULT steps', () => {
    for (const steps of [1, 3, 20]) {
      const s = board({ stats: { maxHp: 20, movement: steps }, movement: pattern([[3, 0]]) });
      expect(movesOf(s, 'P1-a-1')).toEqual(cellSet([{ x: 7, y: 4 }])); // E8 only - not E6/E7
    }
    const far = board({ stats: { maxHp: 20, movement: 3 }, movement: pattern([[4, 0], [-4, -4]]) });
    expect(movesOf(far, 'P1-a-1')).toEqual(cellSet([{ x: 8, y: 4 }, { x: 0, y: 0 }])); // beyond 3 steps
    const three = board({ movement: rookLine });
    expect(movesOf(three, 'P1-a-1')).toEqual(cellSet([{ x: 5, y: 4 }, { x: 6, y: 4 }, { x: 7, y: 4 }]));
  });

  it('4. a knight offset is a jump over monsters and blockers', () => {
    const s = board(
      { movement: pattern([[1, -2]]) },
      [{ creature: 'a', owner: 'P1', x: 4, y: 3 }, { creature: 'b', owner: 'P2', x: 5, y: 3 }],
      [{ x: 4, y: 2 }],
    );
    expect(movesOf(s, 'P1-a-1')).toEqual(cellSet([{ x: 5, y: 2 }]));
  });

  it('5. line offsets need a clear path; the core decides which of (+1,0),(+2,0),(+3,0) are possible', () => {
    expect(movesOf(board({ movement: rookLine }, [], [{ x: 6, y: 4 }]), 'P1-a-1')).toEqual(cellSet([{ x: 5, y: 4 }])); // blocker at E7
    expect(movesOf(board({ movement: rookLine }, [{ creature: 'a', owner: 'P1', x: 5, y: 4 }]), 'P1-a-1')).toEqual(new Set()); // friend at E6
    const enemy = getLegalMoves(board({ movement: rookLine }, [{ creature: 'b', owner: 'P2', x: 6, y: 4 }]), 'P1-a-1');
    expect(cellSet(enemy)).toEqual(cellSet([{ x: 5, y: 4 }, { x: 6, y: 4 }])); // enemy at E7 = battle, E8 cut off
    expect(enemy.find((m) => m.x === 6)?.attacks).toBe('P2-b-2');
    expect(movesOf(board({ movement: pattern([[2, 2]]) }, [{ creature: 'b', owner: 'P2', x: 5, y: 5 }]), 'P1-a-1')).toEqual(new Set()); // diagonal
  });

  it('6. Speed affects none of the above', () => {
    const cases: Array<Partial<CreatureDef>> = [
      {},
      { stats: { maxHp: 20, movement: 5 } },
      { movement: pattern([[3, 0]]) },
      { movement: pattern([[1, -2]]) },
      { movement: rookLine },
    ];
    for (const c of cases) {
      const base = movesOf(board(c), 'P1-a-1');
      expect(movesOf(board({ ...c, modifiers: { speed: 50 } }), 'P1-a-1')).toEqual(base);
    }
  });

  it('7. older monsters without movement data stay DEFAULT', () => {
    const rules = basePack().ruleset;
    const old = { id: 'old', name: 'Old', art: {}, stats: { maxHp: 9, movement: 5 }, dice: { slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } }, special: null };
    const r = parseSave(JSON.stringify({ saveVersion: 3, contentVersion: 1, monsters: [old] }), rules);
    expect(r.ok && r.value.monsters[0]).toMatchObject({ movement: { type: 'default' }, stats: { movement: 5 } });
    const noData = board({ stats: { maxHp: 20, movement: 3 } });
    expect(noData.creatureDefs.a.movement).toBeUndefined();
    expect(movesOf(noData, 'P1-a-1')).toEqual(movesOf(board({ movement: { type: 'default' } }), 'P1-a-1'));
  });
});
