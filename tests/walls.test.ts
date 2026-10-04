import { describe, expect, it } from 'vitest';
import { MAX_LAYOUT_ATTEMPTS, SEGMENT_GAP, START_CLEARANCE, generateCombatWalls, wallsLeaveAPath, type GameState, type WallSegment } from '../src/core';
import { chebyshev, manhattan } from '../src/core/combat/walls';
import { customMatch, newMatch, ok, prepareBothAndBegin, quickPrepare, testCreature, tick } from './helpers';

const W = 20;
const H = 9;
const P1 = { x: 0, y: 4 };
const P2 = { x: 19, y: 4 };
const layout = (seed: number) => generateCombatWalls({ width: W, height: H, player1Start: P1, player2Start: P2, seed });
const SEEDS = Array.from({ length: 300 }, (_, i) => i * 7919 + 1);
const cellsOf = (walls: WallSegment[]) => walls.flatMap((w) => w.cells);

describe('combat walls: generation rules', () => {
  it('about 6 segments and 10-12 blocked cells: 2-3 × 1×1, 2 × 1×2, 1-2 × 1×3', () => {
    for (const seed of SEEDS) {
      const walls = layout(seed);
      const lengths = walls.map((w) => w.cells.length);
      const count = (n: number) => lengths.filter((l) => l === n).length;
      expect(walls).toHaveLength(6);
      expect(count(1)).toBeGreaterThanOrEqual(2);
      expect(count(1)).toBeLessThanOrEqual(3);
      expect(count(2)).toBe(2);
      expect(count(3)).toBeGreaterThanOrEqual(1);
      expect(count(3)).toBeLessThanOrEqual(2);
      expect(cellsOf(walls).length).toBeGreaterThanOrEqual(10);
      expect(cellsOf(walls).length).toBeLessThanOrEqual(12);
    }
  });

  it('every segment is a straight run of exactly its own number of cells (1×2 = 2, 1×3 = 3)', () => {
    for (const seed of SEEDS) {
      for (const w of layout(seed)) {
        const n = w.cells.length;
        expect([1, 2, 3]).toContain(n);
        expect(w.orientation).toBe(n === 1 ? 'single' : w.orientation);
        if (n > 1) expect(['horizontal', 'vertical']).toContain(w.orientation);
        w.cells.forEach((c, i) => {
          const dx = w.orientation === 'horizontal' ? i : 0;
          const dy = w.orientation === 'vertical' ? i : 0;
          expect(c).toEqual({ x: w.cells[0].x + dx, y: w.cells[0].y + dy });
        });
      }
    }
  });

  it('all cells are inside the arena and no two walls overlap', () => {
    for (const seed of SEEDS) {
      const cells = cellsOf(layout(seed));
      for (const c of cells) {
        expect(Number.isInteger(c.x) && Number.isInteger(c.y)).toBe(true);
        expect(c.x >= 0 && c.x < W && c.y >= 0 && c.y < H).toBe(true);
      }
      expect(new Set(cells.map((c) => `${c.x},${c.y}`)).size).toBe(cells.length);
    }
  });

  it(`no wall cell within Manhattan distance ${START_CLEARANCE} of either start`, () => {
    expect(START_CLEARANCE).toBe(4);
    for (const seed of SEEDS) {
      for (const c of cellsOf(layout(seed))) {
        expect(manhattan(c, P1)).toBeGreaterThanOrEqual(4);
        expect(manhattan(c, P2)).toBeGreaterThanOrEqual(4);
      }
    }
  });

  it('two different segments never touch, not even diagonally (Chebyshev >= 2)', () => {
    expect(SEGMENT_GAP).toBe(2);
    for (const seed of SEEDS) {
      const walls = layout(seed);
      for (let i = 0; i < walls.length; i++)
        for (let j = i + 1; j < walls.length; j++)
          for (const a of walls[i].cells) for (const b of walls[j].cells) expect(chebyshev(a, b)).toBeGreaterThanOrEqual(2);
    }
  });

  it('P1 can always reach P2', () => {
    for (const seed of SEEDS) expect(wallsLeaveAPath(W, H, layout(seed), P1, P2)).toBe(true);
    // The check itself: a full wall column cuts the arena in two.
    const column: WallSegment[] = [0, 3, 6].map((y) => ({ orientation: 'vertical', cells: [0, 1, 2].map((i) => ({ x: 10, y: y + i })) }));
    expect(wallsLeaveAPath(W, H, column, P1, P2)).toBe(false);
  });

  it('both horizontal and vertical segments are generated, and the walls spread over the arena', () => {
    const all = SEEDS.flatMap(layout);
    expect(all.some((w) => w.orientation === 'horizontal' && w.cells.length === 3)).toBe(true);
    expect(all.some((w) => w.orientation === 'vertical' && w.cells.length === 3)).toBe(true);
    expect(all.some((w) => w.orientation === 'horizontal' && w.cells.length === 2)).toBe(true);
    expect(all.some((w) => w.orientation === 'vertical' && w.cells.length === 2)).toBe(true);
    // Spread: in every layout the walls reach both the left and the right half and the top and bottom half.
    for (const seed of SEEDS) {
      const cells = cellsOf(layout(seed));
      expect(cells.some((c) => c.x < W / 2) && cells.some((c) => c.x >= W / 2)).toBe(true);
      expect(cells.some((c) => c.y < 4) && cells.some((c) => c.y > 4)).toBe(true);
    }
  });

  it('the same seed gives the same layout; different seeds give different layouts', () => {
    expect(layout(12345)).toEqual(layout(12345));
    expect(layout(12345)).not.toEqual(layout(67890));
    expect(new Set(SEEDS.map((s) => JSON.stringify(layout(s)))).size).toBeGreaterThan(SEEDS.length * 0.9);
  });

  it('never loops forever: an impossible arena gives up after the attempt limit with no walls', () => {
    expect(MAX_LAYOUT_ATTEMPTS).toBe(100);
    expect(generateCombatWalls({ width: 6, height: 3, player1Start: { x: 0, y: 1 }, player2Start: { x: 5, y: 1 }, seed: 1 })).toEqual([]);
  });
});

describe('combat walls in a battle', () => {
  const start = (walls: boolean, seed = 1) => {
    let s = customMatch({
      seed,
      walls,
      creatures: [testCreature('a'), testCreature('b')],
      placements: [
        { creature: 'a', owner: 'P1', x: 0, y: 0 },
        { creature: 'b', owner: 'P2', x: 1, y: 0 },
      ],
    });
    return ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 1, y: 0 } });
  };
  /** Both players READY: the countdown has started. */
  const ready = (walls: boolean, seed = 1) => quickPrepare(quickPrepare(start(walls, seed), 'P1'), 'P2');

  it('a new layout is made when the countdown starts, and is the combat layout', () => {
    const s = ready(true);
    expect(s.battle!.stage).toBe('countdown');
    expect(s.battle!.walls.length).toBe(6);
    const fought = prepareBothAndBegin(start(true));
    expect(fought.battle!.combat!.walls).toEqual(fought.battle!.walls);
    // Deterministic from the match seed; another match seed gives another layout.
    expect(ready(true, 5).battle!.walls).toEqual(ready(true, 5).battle!.walls);
    expect(ready(true, 5).battle!.walls).not.toEqual(ready(true, 6).battle!.walls);
  });

  it('the bundled ruleset has walls on; "walls": false gives an open arena', () => {
    expect(newMatch().ruleset.combat.walls).toBe(true);
    expect(ready(false).battle!.walls).toEqual([]);
  });

  /** A combat with one wall cell right in front of P1 (cell 3,4). */
  const walled = (): GameState => {
    const s = prepareBothAndBegin(start(false));
    s.battle!.combat!.walls = [{ orientation: 'single', cells: [{ x: 3, y: 4 }] }];
    return s;
  };

  it('fighters cannot walk into a wall: they stop flush against it', () => {
    let s = walled();
    const rules = s.ruleset.combat;
    for (let i = 0; i < 200; i++) s = tick(s, { dx: 100, dy: 0, attack: false, block: false });
    const a = s.battle!.combat!.fighters.attacker;
    expect(a.x).toBe(3 * rules.cellUnits - rules.fighterRadius);
    expect(a.y).toBe(4 * rules.cellUnits + rules.cellUnits / 2);
    // Moving up first, it gets past the wall.
    for (let i = 0; i < 40; i++) s = tick(s, { dx: 0, dy: -100, attack: false, block: false });
    for (let i = 0; i < 100; i++) s = tick(s, { dx: 100, dy: 0, attack: false, block: false });
    expect(s.battle!.combat!.fighters.attacker.x).toBeGreaterThan(4 * rules.cellUnits);
  });

  it('a dash stops at a wall', () => {
    let s = walled();
    const rules = s.ruleset.combat;
    s = tick(s, { dx: 100, dy: 0, dash: true, attack: false, block: false });
    for (let i = 0; i < 20; i++) s = tick(s);
    expect(s.battle!.combat!.fighters.attacker.x).toBe(3 * rules.cellUnits - rules.fighterRadius);
  });

  it('a projectile that hits a wall vanishes (Bounce 0)', () => {
    let s = walled();
    // A projectile flying straight at the wall.
    const c = s.battle!.combat!;
    c.projectiles.push({ id: 1, side: 'attacker', x: 120 * 256, y: 360 * 256, vx: 8 * 256, vy: 0, speed: 8 * 256, travelled: 0, maxTravel: 4000 * 256, bouncesLeft: 0, homing: 0, curveCos: 65536, curveSin: 0, impactRadius: 10, look: { size: 1, trail: 0, color: null } });
    for (let i = 0; i < 30; i++) s = tick(s);
    expect(s.battle!.combat!.projectiles).toHaveLength(0);
  });

  it('a projectile with a bounce left reflects off a wall', () => {
    let s = walled();
    const c = s.battle!.combat!;
    c.projectiles.push({ id: 1, side: 'attacker', x: 120 * 256, y: 360 * 256, vx: 8 * 256, vy: 0, speed: 8 * 256, travelled: 0, maxTravel: 4000 * 256, bouncesLeft: 1, homing: 0, curveCos: 65536, curveSin: 0, impactRadius: 10, look: { size: 1, trail: 0, color: null } });
    for (let i = 0; i < 30; i++) s = tick(s);
    const p = s.battle!.combat!.projectiles[0];
    expect(p).toBeDefined();
    expect(p.vx).toBeLessThan(0);
    expect(p.bouncesLeft).toBe(0);
  });
});
