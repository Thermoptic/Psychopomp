import { describe, expect, it } from 'vitest';
import { ContentLibrary, memoryStorage } from '../src/content/library';
import { MONSTER_FORMAT, MONSTER_FORMAT_VERSION, POWERUP_FORMAT, SAVE_VERSION, parseContentFile, parseSave } from '../src/content/saveFormat';
import {
  applyCommand,
  cellCode,
  computeBuild,
  computeDamage,
  computeDashCooldown,
  createMatch,
  evaluateRequirement,
  parseCell,
  powerupMapping as M,
  type CreatureDef,
  type DicePrep,
  type FighterInput,
  type GameEvent,
  type GameState,
  type PowerupDef,
  type SlotCondition,
} from '../src/core';
import { resolveDash } from '../src/core/combat/simulation';
import { ItemEditor, levelMeaning, setModifier, setPowerupLevel, setSlotCondition, slotConditions } from '../src/devEditor/model';
import { basePack, customMatch, ok, prepareBothAndBegin, testCreature } from './helpers';

const fresh = (text: string | null = null) => {
  const storage = memoryStorage(text);
  return { storage, lib: new ContentLibrary(basePack(), storage) };
};
const rules = () => basePack().ruleset;

// --- MONSTERS -------------------------------------------------------------------------------

describe('Monster content', () => {
  it('creates a monster with defaults: modifiers 0, P1, not placed, no powerup, 5 unused trigger slots', () => {
    const { lib } = fresh();
    const m = lib.newMonster();
    expect(m.modifiers).toEqual({ speed: 0, power: 0, shield: 0, dash: 0, block: 0 });
    expect(m.player).toBe('P1');
    expect(m.position).toBeUndefined();
    expect(m.powerupId).toBeNull();
    expect(m.special?.requirement).toEqual({ type: 'slots', slots: [null, null, null, null, null] });
    expect(lib.validateMonster(m, null)).toEqual([]);
  });

  it('name and HP are saved and validated', () => {
    const { lib, storage } = fresh();
    const ed = new ItemEditor(lib, 'monster');
    ed.newItem();
    ed.update((m) => ((m.id = 'grim'), (m.name = 'Grim'), (m.stats.maxHp = 35)));
    expect(ed.save().ok).toBe(true);
    const again = new ContentLibrary(basePack(), storage);
    expect(again.get('monster', 'grim')!.item).toMatchObject({ name: 'Grim', stats: { maxHp: 35 } });
    ed.update((m) => (m.name = ' '));
    expect(ed.errors().join()).toMatch(/NAME/);
    ed.update((m) => ((m.name = 'Grim'), (m.stats.maxHp = 0)));
    expect(ed.errors().join()).toMatch(/maxHp/);
  });

  it('player P1/P2 and position A1-I9 are stored as data (cell codes)', () => {
    expect(parseCell('A1')).toEqual({ x: 0, y: 0 });
    expect(parseCell('A2')).toEqual({ x: 1, y: 0 });
    expect(parseCell('E5')).toEqual({ x: 4, y: 4 });
    expect(parseCell('I9')).toEqual({ x: 8, y: 8 });
    expect(cellCode({ x: 4, y: 4 })).toBe('E5');
    expect(parseCell('Z0')).toBeNull();
    const { lib } = fresh();
    const m = { ...lib.newMonster(), player: 'P2' as const, position: 'E5' };
    expect(lib.validateMonster(m, null)).toEqual([]);
    expect(lib.validateMonster({ ...m, position: 'J1' }, null).join()).toMatch(/not a board cell/);
    expect(lib.validateMonster({ ...m, position: 'E1' }, null).join()).toMatch(/board lineup/); // the Glubber starts there
    expect(lib.validateMonster({ ...m, player: 'P3' as never }, null).join()).toMatch(/player/);
  });

  it('the game places a monster on its position for its player', () => {
    const { lib } = fresh();
    lib.saveItem('monster', { ...lib.newMonster(), id: 'grim', name: 'Grim', player: 'P2', position: 'E5' }, null);
    const pack = lib.pack();
    const s = createMatch({ ruleset: pack.ruleset, board: pack.boards[0], creatures: pack.creatures, powerups: pack.powerups, seed: 1 });
    expect(s.creatures['P2-grim-1']).toMatchObject({ owner: 'P2', x: 4, y: 4, hp: 20 });
    expect(Object.keys(s.creatures)).toHaveLength(3); // 2 board lineup (1 Glubber, 1 Shroud) + 1 placed monster
  });

  it('modifiers default to 0 and take positive and negative values that change battle stats', () => {
    const r = rules();
    const def = testCreature('m');
    setModifier(def, 'speed', 2);
    setModifier(def, 'power', -1);
    setModifier(def, 'shield', 3);
    setModifier(def, 'block', -2);
    const prep: DicePrep = { creatureId: 'x', player: 'P1', sides: 6, dice: [1, 1, 1, 1, 1], locked: [false, false, false, false, false], rollsUsed: 1, maxRolls: 3, stage: 'done', slots: ['speed', 'power', 'shield', 'dash', 'block'].map((category) => ({ category })), slotDice: [0, 1, 2, 3, 4] };
    const b = computeBuild(def, prep, r);
    expect(b.stats).toEqual({ speed: r.creatureBase.speed + 2 + 1, power: r.creatureBase.power - 1 + 1, shield: r.creatureBase.shield + 3 + 1, block: 0, dash: r.creatureBase.dash + 1 }); // block 0-2+1 -> floored at 0; dash = the DASH die
    // Dash value (DASH die + Dash Cooldown Modifier) sets the cooldown; the distance is fixed.
    expect(resolveDash(def, r.combat, 0).cooldown).toBe(7);
    expect(resolveDash(def, r.combat, 6).cooldown).toBe(1);
    expect(resolveDash(def, r.combat, 0).distance).toBe(resolveDash(def, r.combat, 6).distance);
    expect(computeDashCooldown(4, r.combat)).toBe(3);
    expect(new ContentLibrary(basePack(), memoryStorage()).validateMonster({ ...testCreature('q'), modifiers: { power: 120 } }, null).join()).toMatch(/modifiers.power/);
  });

  it('Special slot conditions are stored per slot', () => {
    const def = testCreature('m');
    setSlotCondition(def, 0, 'odd', 5);
    setSlotCondition(def, 1, 4, 5);
    setSlotCondition(def, 2, 'even', 5);
    expect(def.special?.requirement).toEqual({ type: 'slots', slots: ['odd', 4, 'even', null, null] });
    setSlotCondition(def, 1, null, 5);
    expect(slotConditions(def, 5).slots).toEqual(['odd', null, 'even', null, null]);
    // The base monsters' triggers read back as slot conditions too.
    expect(slotConditions(basePack().creatures[0], 5).slots).toEqual([null, null, null, 'odd', null]);
  });

  it('stores a Powerup reference (id), never a copy, and validates it', () => {
    const { lib } = fresh();
    const m = { ...lib.newMonster(), powerupId: 'plasma_bolt' };
    expect(lib.validateMonster(m, null)).toEqual([]);
    lib.saveItem('monster', m, null);
    expect(lib.get('monster', m.id)!.item.powerupId).toBe('plasma_bolt');
    // Only the id is stored: nothing of the Powerup itself (its name or settings) is copied into the monster.
    const saved = lib.get('monster', m.id)!.item;
    expect(JSON.stringify(saved)).not.toContain('Plasma Bolt');
    expect(saved.attack?.ranged).not.toEqual(lib.get('powerup', 'plasma_bolt')!.item.ranged);
    expect(lib.validateMonster({ ...m, powerupId: 'nope' }, m.id).join()).toMatch(/unknown Powerup/);
    expect(lib.monstersUsing('plasma_bolt').map((x) => x.id)).toEqual([m.id]);
  });
});

// --- SPECIAL CONDITIONS --------------------------------------------------------------------------

describe('Special slot conditions (game core)', () => {
  const holds = (slots: Array<SlotCondition | null>, bySlot: number[]) => evaluateRequirement({ type: 'slots', slots }, { all: bySlot, byCategory: {}, bySlot });
  it('ODD: 1,3,5 true; 2,4,6 false', () => {
    for (const v of [1, 3, 5]) expect(holds(['odd'], [v])).toBe(true);
    for (const v of [2, 4, 6]) expect(holds(['odd'], [v])).toBe(false);
  });
  it('EVEN: 2,4,6 true; 1,3,5 false', () => {
    for (const v of [2, 4, 6]) expect(holds(['even'], [v])).toBe(true);
    for (const v of [1, 3, 5]) expect(holds(['even'], [v])).toBe(false);
  });
  it('specific 4: only 4', () => {
    expect(holds([4], [4])).toBe(true);
    for (const v of [1, 2, 3, 5, 6]) expect(holds([4], [v])).toBe(false);
  });
  it('None requires nothing; with no active slot the Special never triggers', () => {
    expect(holds([null, 'odd', null], [2, 3, 6])).toBe(true);
    expect(holds([null, null, null, null, null], [1, 2, 3, 4, 5])).toBe(false);
  });
  it('all active slots must match (ODD · 4 · EVEN)', () => {
    const slots: Array<SlotCondition | null> = ['odd', 4, 'even', null, null];
    expect(holds(slots, [5, 4, 2, 1, 1])).toBe(true);
    expect(holds(slots, [5, 4, 3, 1, 1])).toBe(false);
    expect(holds(slots, [6, 4, 2, 1, 1])).toBe(false);
    expect(holds(slots, [5, 3, 2, 1, 1])).toBe(false);
    expect(holds(slots, [5, 4, 0, 1, 1])).toBe(false); // an empty slot never satisfies a condition
  });
});

// --- POWERUPS -------------------------------------------------------------------------------------

describe('Powerup content and mappings', () => {
  it('creates melee and ranged powerups, validated and saved', () => {
    const { lib, storage } = fresh();
    const ed = new ItemEditor(lib, 'powerup');
    ed.newItem();
    ed.update((p) => ((p.id = 'cleaver'), (p.name = 'Cleaver'), (p.type = 'melee')));
    expect(ed.save().ok).toBe(true);
    ed.newItem();
    ed.update((p) => ((p.id = 'spitter'), (p.name = 'Spitter'), (p.type = 'ranged')));
    ed.update((p) => setPowerupLevel(p, 'ranged', 'impactSize', 7));
    expect(ed.save().ok).toBe(true);
    const again = new ContentLibrary(basePack(), storage);
    expect(again.get('powerup', 'cleaver')!.item.type).toBe('melee');
    expect(again.get('powerup', 'spitter')!.item.ranged!.impactSize).toBe(7);
    expect(lib.validatePowerup({ ...ed.draft, ranged: { ...ed.draft.ranged!, homing: 11 } }, 'spitter').join()).toMatch(/homing/);
    expect(lib.validatePowerup({ ...ed.draft, type: 'laser' as never }, 'spitter').join()).toMatch(/type/);
  });

  it('melee mappings: speed 0.5-5 s, knockback 5-50 px, range 56-200 units', () => {
    const c = rules().combat;
    expect([1, 2, 10].map((l) => M.meleeCooldownTicks(l, c) / c.tickRate)).toEqual([0.5, 1, 5]);
    expect([1, 2, 10].map((l) => M.meleeKnockback(l) / M.PX)).toEqual([5, 10, 50]);
    expect([1, 10].map(M.meleeRange)).toEqual([56, 200]);
    expect(levelMeaning('melee', 'speed', 4, rules())).toBe('2.0 s');
  });

  it('ranged mappings: speed, range, rate of fire, impact size/damage, homing, trajectory, bounce', () => {
    const c = rules().combat;
    expect([1, 10].map(M.projectileSpeed)).toEqual([4, 40]);
    expect(M.projectileRange(10, c)).toBe(20 * c.cellUnits); // 2 cells per level
    expect([1, 4, 10].map((l) => M.rateOfFireTicks(l, c) / c.tickRate)).toEqual([0.5, 2, 5]);
    expect([1, 10].map(M.impactRadius)).toEqual([16, 160]);
    expect([1, 10].map(M.homingPercent)).toEqual([2, 20]);
    expect(M.trajectoryCurve(10)).toBeGreaterThan(M.trajectoryCurve(1) * 9);
    expect([0, 1, 10].map(M.bounceCount)).toEqual([0, 1, 10]);
    expect([0, 1, 10].map(M.trailTicks)).toEqual([0, 3, 30]);
  });
});

// --- GAME CORE consumes the data ---------------------------------------------------------------------

const idle: FighterInput = { dx: 0, dy: 0, attack: false, block: false };
const ranged = (o: Partial<NonNullable<PowerupDef['ranged']>> = {}): PowerupDef => ({
  id: 'gun',
  name: 'Gun',
  type: 'ranged',
  ranged: { speed: 5, range: 10, rateOfFire: 4, impactSize: 1, impactDamage: 7, homing: 1, trajectory: 1, bounce: 1, ...o },
});

/** A battle in combat: P1 (attacker, left, given powerup) vs P2 (defender, right). */
function fightWith(powerup: PowerupDef | null, aExtra: Partial<CreatureDef> = {}, b: CreatureDef = testCreature('b', { maxHp: 200 })): GameState {
  const a = testCreature('a', { maxHp: 200 }, { powerupId: powerup?.id ?? null, ...aExtra });
  const s = createMatch({
    ruleset: basePack().ruleset,
    creatures: [a, { ...b, id: 'b' }],
    powerups: powerup ? [powerup] : [],
    seed: 1,
    board: { id: 't', name: 't', width: 9, height: 9, allowDiagonal: false, passThroughCreatures: false, blockedCells: [], powerPoints: [{ x: 4, y: 0 }], placements: [{ creature: 'a', owner: 'P1', x: 3, y: 2 }, { creature: 'b', owner: 'P2', x: 5, y: 2 }, { creature: 'b', owner: 'P2', x: 8, y: 8 }] },
  });
  return prepareBothAndBegin(ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } }));
}
function run(s: GameState, n: number, a: Partial<FighterInput> = {}, d: Partial<FighterInput> = {}) {
  const events: GameEvent[] = [];
  for (let i = 0; i < n && s.battle?.stage === 'combat'; i++) {
    const r = applyCommand(s, { type: 'COMBAT_TICK', inputs: { attacker: { ...idle, ...a }, defender: { ...idle, ...d } } });
    if (r.error) throw new Error(r.error);
    s = r.state;
    events.push(...r.events);
  }
  return { s, events };
}
const F = (s: GameState) => s.battle!.combat!.fighters;

describe('Game core consumes Powerups', () => {
  it('rate of fire = time between shots; autoFire keeps firing while held', () => {
    const s = fightWith(ranged({ rateOfFire: 4 }), { attack: { autoFire: true } });
    const { events } = run(s, 4 * 30 * 2 + 1, { attackHeld: true });
    const shots = events.filter((e) => e.type === 'PROJECTILE_FIRED' && e.side === 'attacker').length;
    expect(shots).toBe(3); // ticks 1, 121, 241 (2.0 s apart)
  });

  it('projectiles fly at their speed, hit the opponent and deal Power damage reduced by Shield (like melee)', () => {
    let s = fightWith(ranged({ speed: 10, homing: 1 }));
    const hp = F(s).defender.hp;
    const expected = computeDamage(F(s).attacker.stats, F(s).defender.stats, s.ruleset.combat);
    s = run(s, 1, { attack: true }).s;
    const p0 = s.battle!.combat!.projectiles[0];
    expect(p0.vx).toBe(M.projectileSpeed(10) * 256);
    const r = run(s, 60);
    expect(r.events.some((e) => e.type === 'IMPACT' && e.hit)).toBe(true);
    expect(F(r.s).defender.hp).toBe(hp - expected);
  });

  it('range: a short-range shot fizzles before reaching the far opponent', () => {
    const s = run(fightWith(ranged({ range: 1, homing: 1 })), 1, { attack: true }).s;
    const r = run(s, 120);
    expect(r.events.some((e) => e.type === 'IMPACT')).toBe(false);
    expect(r.s.battle!.combat!.projectiles).toHaveLength(0);
  });

  it('bounce: bounces off walls N times; with none left the shot vanishes at the wall (0 = never bounces)', () => {
    // Fire straight up (opponent far away, weak homing). Walls are ~334 then 668 units apart on this path;
    // range 10 = 1600 units of travel.
    const fire = (bounce: number) => {
      const r0 = run(fightWith(ranged({ bounce, range: 10, speed: 10, homing: 1 })), 1, { attack: true, aimX: 0, aimY: -100 });
      return run(r0.s, 200);
    };
    const zero = fire(0);
    expect(zero.events.filter((e) => e.type === 'PROJECTILE_BOUNCED')).toHaveLength(0);
    expect(zero.events.filter((e) => e.type === 'IMPACT')).toHaveLength(0); // gone at the first wall, no blast
    expect(zero.s.battle!.combat!.projectiles).toHaveLength(0);
    const one = fire(1);
    expect(one.events.filter((e) => e.type === 'PROJECTILE_BOUNCED')).toHaveLength(1);
    expect(one.events.filter((e) => e.type === 'IMPACT')).toHaveLength(0); // 2nd wall: vanishes
    const two = fire(2);
    expect(two.events.filter((e) => e.type === 'PROJECTILE_BOUNCED')).toHaveLength(2);
  });

  it('size, trail and colour are look-only settings that reach the weapon (and are validated)', () => {
    const plain = F(fightWith(ranged())).attacker.weapon;
    expect(plain).toMatchObject({ kind: 'ranged', look: { size: 1, trail: 0, color: null } });
    const fancy = F(fightWith(ranged({ size: 7, trail: 10, color: '#33ccff' }))).attacker.weapon;
    expect(fancy).toMatchObject({ kind: 'ranged', look: { size: 7, trail: 10, color: '#33ccff' } });
    // Same gameplay values either way.
    const strip = (w: typeof plain) => ({ ...w, look: undefined });
    expect(strip(fancy)).toEqual(strip(plain));
    const { lib } = fresh();
    const base = { ...lib.newPowerup('ranged'), id: 'zap', name: 'Zap' };
    expect(lib.validatePowerup({ ...base, ranged: { ...base.ranged!, bounce: 0, size: 10, trail: 0, color: '#ABCDEF' } }, null)).toEqual([]);
    expect(lib.validatePowerup({ ...base, ranged: { ...base.ranged!, size: 0 } }, null).join()).toMatch(/size/);
    expect(lib.validatePowerup({ ...base, ranged: { ...base.ranged!, trail: 11 } }, null).join()).toMatch(/trail/);
    expect(lib.validatePowerup({ ...base, ranged: { ...base.ranged!, color: 'red' } }, null).join()).toMatch(/color/);
    expect(lib.validatePowerup({ ...base, ranged: { ...base.ranged!, bounce: -1 } }, null).join()).toMatch(/bounce/);
    // New ranged weapons: no bounce, smallest size, no trail, owner colour.
    expect(base.ranged).toMatchObject({ bounce: 0, size: 1, trail: 0 });
    expect(base.ranged!.color).toBeUndefined();
  });

  it('homing steers towards the opponent; stronger homing turns faster', () => {
    const turned = (h: number) => {
      const s = run(fightWith(ranged({ homing: h, speed: 3 })), 1, { attack: true, aimX: 0, aimY: -100 }).s;
      const p = run(s, 10).s.battle!.combat!.projectiles[0];
      return p.vx; // the opponent is to the right: vx grows as it turns
    };
    expect(turned(10)).toBeGreaterThan(turned(1));
    expect(turned(1)).toBeGreaterThan(0);
  });

  it('trajectory (Magnus) only curves shots fired while moving', () => {
    const still = run(fightWith(ranged({ trajectory: 10, homing: 1 })), 1, { attack: true }).s.battle!.combat!.projectiles[0];
    const moving = run(fightWith(ranged({ trajectory: 10, homing: 1 })), 1, { attack: true, dy: 100 }).s.battle!.combat!.projectiles[0];
    expect(still.curveSin).toBe(0);
    expect(moving.curveSin).toBeGreaterThan(0);
    expect(moving.curveSin).toBeLessThan(65536 * 0.05); // a gentle per-tick turn, not an instant 90°
  });

  it('melee powerup: attack interval, reach and knockback along the attack direction', () => {
    const blade: PowerupDef = { id: 'blade', name: 'Blade', type: 'melee', melee: { speed: 3, knockback: 4, range: 10 } };
    let s = fightWith(blade);
    s = run(s, 60, {}, { dx: -100 }).s; // defender walks away from its wall
    const w = F(s).attacker.weapon;
    expect(w).toMatchObject({ kind: 'melee', cooldownTicks: 90, range: 200, knockback: 40 });
    // Walk into reach (200 units) and swing.
    while (F(s).defender.x - F(s).attacker.x > 190) s = run(s, 1, { dx: 100 }).s;
    const x0 = F(s).defender.x;
    const r = run(s, s.ruleset.combat.windupTicks + 1, { attack: true });
    expect(r.events.some((e) => e.type === 'HIT')).toBe(true);
    expect(F(r.s).defender.x).toBe(x0 + 40); // pushed right, the direction of the attack
    expect(F(r.s).attacker.cooldown).toBeGreaterThan(70);
  });

  it('no powerup keeps the classic melee', () => {
    expect(F(fightWith(null)).attacker.weapon).toMatchObject({ kind: 'melee', powerupId: null, cooldownTicks: null, knockback: 0 });
  });
});

// --- save format / migration / editor shell -----------------------------------------------------------

describe('Content save format v2', () => {
  it('migrates v1 monsters (absolute stats) to modifiers and keeps the base monsters identical', () => {
    const v1 = JSON.stringify({ saveVersion: 1, contentVersion: 1, monsters: [{ id: 'old', name: 'Old', art: {}, stats: { maxHp: 12, movement: 2, power: 12, speed: 5, shield: 1 }, dice: { slots: { speed: 1, power: 1, shield: 1, special: 1, block: 1 } }, special: null }] });
    const r = parseSave(v1, rules());
    expect(r.ok && r.migratedFrom).toBe(1);
    // Absolute v1 stats are kept as the same totals: modifier = old value - ruleset base (base is 0).
    expect(r.ok && r.value.monsters[0]).toMatchObject({ stats: { maxHp: 12, movement: 2 }, modifiers: { power: 12, speed: 5, shield: 1 } });
    expect(basePack().ruleset.creatureBase).toEqual({ power: 0, speed: 0, shield: 0, block: 0, dash: 0 });
    expect(basePack().creatures.every((c) => !c.modifiers)).toBe(true); // Glubber/Shroud start at 0: dice give the values
    // The library rewrites an old save in the current version.
    const { storage } = fresh(v1);
    expect(JSON.parse(storage.text!).saveVersion).toBe(SAVE_VERSION);
    // ...and the old SPECIAL dice slot became DASH.
    expect(r.ok && r.value.monsters[0].dice.slots).toEqual({ speed: 1, power: 1, shield: 1, dash: 1, block: 1 });
  });

  it('exports/imports monster and powerup files and refuses newer versions', () => {
    const { lib } = fresh();
    const m = lib.serialize('monster', lib.get('monster', 'glubber')!.item);
    expect(JSON.parse(m)).toMatchObject({ format: MONSTER_FORMAT, formatVersion: MONSTER_FORMAT_VERSION });
    const p = lib.serialize('powerup', lib.get('powerup', 'plasma_bolt')!.item);
    expect(JSON.parse(p)).toMatchObject({ format: POWERUP_FORMAT, formatVersion: 1 });
    const back = parseContentFile(p, rules());
    expect(back.ok && back.value.kind).toBe('powerup');
    expect(parseContentFile(JSON.stringify({ format: POWERUP_FORMAT, formatVersion: 9, powerup: {} }), rules()).ok).toBe(false);
  });

  it('a Powerup used by a monster cannot be deleted or renamed', () => {
    const { lib } = fresh();
    const gun = { ...lib.newPowerup('ranged'), id: 'gun', name: 'Gun' };
    lib.saveItem('powerup', gun, null);
    lib.saveItem('monster', { ...lib.newMonster(), powerupId: 'gun' }, null);
    const r = lib.removeItem('powerup', 'gun');
    expect(r.ok).toBe(false);
    expect(lib.validatePowerup({ ...gun, id: 'gun2' }, 'gun').join()).toMatch(/keep the id/);
  });

  it('the editor edits the same definitions the game core plays', () => {
    const { lib } = fresh();
    const ed = new ItemEditor(lib, 'monster');
    ed.select('glubber');
    ed.update((m) => setModifier(m, 'power', 3));
    ed.update((m) => (m.powerupId = 'rusty_blade'));
    expect(ed.save().ok).toBe(true);
    const pack = lib.pack();
    const s = createMatch({ ruleset: pack.ruleset, board: pack.boards[0], creatures: pack.creatures, powerups: pack.powerups, seed: 2 });
    expect(s.creatureDefs.glubber).toEqual(lib.get('monster', 'glubber')!.item);
    expect(s.powerupDefs.rusty_blade).toEqual(lib.get('powerup', 'rusty_blade')!.item);
  });

  it('existing content and game flow still work (custom match helpers unaffected)', () => {
    const s = customMatch({ creatures: [testCreature('a'), testCreature('b')], placements: [{ creature: 'a', owner: 'P1', x: 0, y: 0 }, { creature: 'b', owner: 'P2', x: 1, y: 0 }] });
    expect(Object.keys(s.creatures)).toHaveLength(2);
    expect(s.powerupDefs).toEqual({});
  });
});

// --- the monster's own attack (melee/ranged on every monster) ------------------------------------

describe('Monster own attack (melee / ranged settings per monster)', () => {
  const ownRanged = { type: 'ranged' as const, ranged: { speed: 10, range: 10, rateOfFire: 3, impactSize: 1, impactDamage: 9, homing: 1, trajectory: 4, bounce: 2 } };

  it('a new monster starts with its own melee attack and both settings blocks', () => {
    const { lib } = fresh();
    const m = lib.newMonster();
    expect(m.attack?.type).toBe('melee');
    expect(m.attack?.melee).toBeDefined();
    expect(m.attack?.ranged).toBeDefined();
    expect(lib.validateMonster(m, null)).toEqual([]);
  });

  it('the core uses the monster\'s own ranged settings (no Powerup needed)', () => {
    let s = fightWith(null, { attack: ownRanged });
    const w = F(s).attacker.weapon;
    expect(w).toMatchObject({ kind: 'ranged', powerupId: null, speed: M.projectileSpeed(10), cooldownTicks: M.rateOfFireTicks(3, s.ruleset.combat), bounces: 2 });
    const hp = F(s).defender.hp;
    const expected = computeDamage(F(s).attacker.stats, F(s).defender.stats, s.ruleset.combat); // Power vs Shield, like melee
    s = run(s, 1, { attack: true }).s;
    expect(s.battle!.combat!.projectiles).toHaveLength(1);
    expect(F(run(s, 60).s).defender.hp).toBe(hp - expected);
  });

  it('ranged and melee deal the same damage: Power 2 vs Shield 6 = 1 (2 x 70 %), not a fixed weapon damage', () => {
    let s = fightWith(null, { attack: ownRanged });
    F(s).attacker.stats.power = 2;
    F(s).defender.stats.shield = 6;
    const hp = F(s).defender.hp;
    s = run(s, 1, { attack: true }).s;
    expect(F(run(s, 60).s).defender.hp).toBe(hp - 1);
    expect(computeDamage({ power: 2, shield: 0, speed: 0, block: 0, dash: 0 }, { power: 0, shield: 6, speed: 0, block: 0, dash: 0 }, s.ruleset.combat)).toBe(1);
  });

  it('the core uses the monster\'s own melee settings', () => {
    const s = fightWith(null, { attack: { type: 'melee', melee: { speed: 6, knockback: 2, range: 5 } } });
    expect(F(s).attacker.weapon).toMatchObject({ kind: 'melee', powerupId: null, cooldownTicks: 180, range: M.meleeRange(5), knockback: 20 });
  });

  it('an equipped Powerup replaces the own attack; without type the classic melee stays', () => {
    const blade: PowerupDef = { id: 'blade', name: 'Blade', type: 'melee', melee: { speed: 1, knockback: 1, range: 1 } };
    expect(F(fightWith(blade, { attack: ownRanged })).attacker.weapon).toMatchObject({ kind: 'melee', powerupId: 'blade' });
    expect(F(fightWith(null, { attack: { autoFire: true } })).attacker.weapon).toMatchObject({ kind: 'melee', cooldownTicks: null });
    expect(basePack().creatures.every((c) => !c.attack?.type)).toBe(true); // Glubber/Shroud keep the classic attack
  });

  it('monster attack settings are validated like Powerups', () => {
    const { lib } = fresh();
    const m = lib.newMonster();
    expect(lib.validateMonster({ ...m, attack: { type: 'ranged', ranged: { ...ownRanged.ranged, homing: 11 } } }, null).join()).toMatch(/homing/);
    expect(lib.validateMonster({ ...m, attack: { type: 'laser' as never } }, null).join()).toMatch(/type/);
    expect(lib.validateMonster({ ...m, attack: { type: 'ranged' } }, null).join()).toMatch(/needs "ranged"/);
  });

  it('editor: switching type keeps the other settings; levels are clamped; saved data is what the game plays', async () => {
    const { setWeaponType } = await import('../src/devEditor/weaponFields');
    const { setWeaponLevel } = await import('../src/devEditor/model');
    const { lib } = fresh();
    const ed = new ItemEditor(lib, 'monster');
    ed.newItem();
    ed.update((m) => setWeaponType(m.attack!, 'ranged'));
    ed.update((m) => setWeaponLevel(m.attack!, 'ranged', 'trajectory', 9));
    ed.update((m) => setWeaponLevel(m.attack!, 'ranged', 'homing', 99));
    ed.update((m) => setWeaponType(m.attack!, 'melee'));
    ed.update((m) => setWeaponType(m.attack!, 'ranged'));
    expect(ed.draft.attack!.ranged).toMatchObject({ trajectory: 9, homing: 10 });
    ed.update((m) => ((m.player = 'P1'), (m.position = 'E4')));
    expect(ed.save().ok).toBe(true);
    const pack = lib.pack();
    const s = createMatch({ ruleset: pack.ruleset, board: pack.boards[0], creatures: pack.creatures, powerups: pack.powerups, seed: 4 });
    expect(s.creatureDefs[ed.draft.id].attack).toEqual(ed.draft.attack);
  });
});

// --- DASH dice slot (formerly SPECIAL): the die sets the dash cooldown -----------------------------------

describe('DASH dice slot', () => {
  /** P1 with one-sided dice (every die shows 1, so the DASH die = 1) plus a dash modifier. */
  const dashFight = (dashMod = 0) => {
    const a = testCreature('a', { maxHp: 200, dash: dashMod }, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });
    let s = customMatch({ width: 9, height: 9, creatures: [a, testCreature('b', { maxHp: 200 })], placements: [{ creature: 'a', owner: 'P1', x: 3, y: 2 }, { creature: 'b', owner: 'P2', x: 5, y: 2 }, { creature: 'b', owner: 'P2', x: 8, y: 8 }] });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    return prepareBothAndBegin(s);
  };

  it('the DASH die sets the cooldown: die 1 = 7 - 1 = 6 s; the dash covers the fixed distance', () => {
    const s = dashFight();
    const r = rules().combat;
    const before = F(s).attacker.x;
    const after = run(s, 12, { dx: 100, dash: true }).s;
    expect(F(s).attacker.dashCooldownTicks).toBe(6 * r.tickRate);
    expect(F(s).attacker.dashStep * r.dash.durationTicks).toBe(r.dash.distance * r.cellUnits);
    expect(F(after).attacker.x - before).toBeGreaterThanOrEqual(r.dash.distance * r.cellUnits); // dash + normal movement while held
  });

  it('a bigger DASH value only shortens the cooldown (modifier +5 with die 1 = 1 s), never the distance', () => {
    const r = rules().combat;
    expect(F(dashFight(5)).attacker.dashCooldownTicks).toBe(1 * r.tickRate);
    expect(F(dashFight(5)).attacker.dashStep).toBe(F(dashFight()).attacker.dashStep);
  });

  it('a dash value of 0 or less still dashes, with a longer cooldown', () => {
    const s = dashFight(-3); // die 1 + modifier -3 = -2 -> 7 + 2 = 9 s
    const r = run(s, 1, { dx: 100, dash: true });
    expect(r.events).toContainEqual({ type: 'DASH', side: 'attacker' });
    expect(F(r.s).attacker.dashCooldown).toBe(9 * rules().combat.tickRate);
  });

  it('old content with a SPECIAL slot migrates to DASH (incl. requirement targets)', () => {
    const old = { id: 'o', name: 'O', art: {}, stats: { maxHp: 9, movement: 2 }, dice: { slots: { speed: 1, power: 1, shield: 1, special: 1, block: 1 } }, special: { name: 'S', requirement: { type: 'allOdd', target: 'special' }, effect: { type: 'addPower', value: 1 } } };
    const r = parseContentFile(JSON.stringify(old), rules());
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== 'monster') return;
    expect(Object.keys(r.value.item.dice.slots)).toEqual(['speed', 'power', 'shield', 'dash', 'block']);
    expect(r.value.item.special!.requirement).toEqual({ type: 'allOdd', target: 'dash' });
    expect(basePack().creatures.map((c) => Object.keys(c.dice.slots))).toEqual([['speed', 'power', 'shield', 'dash', 'block'], ['speed', 'power', 'shield', 'dash', 'block']]);
  });
});
