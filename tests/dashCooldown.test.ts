import { describe, expect, it } from 'vitest';
import { ContentLibrary, memoryStorage } from '../src/content/library';
import { MONSTER_FORMAT, parseContentFile, parseSave } from '../src/content/saveFormat';
import { applyCommand, computeBuild, computeDashCooldown, type CreatureDef, type DicePrep, type FighterInput, type GameState } from '../src/core';
import { resolveDash } from '../src/core/combat/simulation';
import { basePack, customMatch, ok, prepareBothAndBegin, testCreature } from './helpers';

const rules = () => basePack().ruleset;
const CATS = ['speed', 'power', 'shield', 'dash', 'block'];

/** The battle build for a DASH die of `die` (null = no die on DASH) and a Dash Cooldown Modifier. */
function buildWith(die: number | null, modifier: number) {
  const def = testCreature('m', {}, { modifiers: { dash: modifier } });
  const dice = [1, 1, 1, die ?? 1, 1];
  const prep: DicePrep = {
    creatureId: 'm',
    player: 'P1',
    sides: 6,
    dice,
    locked: [false, false, false, false, false],
    rollsUsed: 1,
    maxRolls: 3,
    stage: 'done',
    slots: CATS.map((category) => ({ category })),
    // No die on DASH: that slot stays empty.
    slotDice: die === null ? [0, 1, 2, null, 4] : [0, 1, 2, 3, 4],
  } as DicePrep;
  return { def, build: computeBuild(def, prep, rules()) };
}

/** Cooldown in seconds as the game computes it: dice -> build -> resolveDash. */
const cooldownFor = (die: number | null, modifier: number) => {
  const { def, build } = buildWith(die, modifier);
  return resolveDash(def, rules().combat, build.stats.dash).cooldown;
};

describe('dash cooldown = max(1, 7 - DASH die - Dash Cooldown Modifier)', () => {
  it.each([
    [null, 0, 7],
    [1, 0, 6],
    [2, 0, 5],
    [3, 0, 4],
    [4, 0, 3],
    [5, 0, 2],
    [6, 0, 1],
  ])('die %s, modifier %i -> %i s', (die, modifier, seconds) => {
    expect(cooldownFor(die, modifier)).toBe(seconds);
  });

  it.each([
    [3, -1, 5],
    [3, -2, 6],
    [3, -3, 7],
    [3, 1, 3],
    [3, 2, 2],
    [6, 5, 1], // minimum 1 s
    [0, -2, 9], // heavy monster, no die: slower than the base
  ])('die %i, modifier %i -> %i s', (die, modifier, seconds) => {
    expect(cooldownFor(die === 0 ? null : die, modifier)).toBe(seconds);
  });

  it('never goes below 1 s', () => {
    for (let v = 6; v <= 40; v++) expect(computeDashCooldown(v, rules().combat)).toBe(1);
  });

  it('the die and the modifier are separate values: the die comes from the dice, the modifier from the monster', () => {
    const { def, build } = buildWith(4, -2);
    expect(def.modifiers?.dash).toBe(-2);
    expect(build.diceByCategory.dash).toBe(4);
    expect(build.stats.dash).toBe(2);
    expect(resolveDash(def, rules().combat, build.stats.dash).cooldown).toBe(5); // 7 - 4 - (-2)
  });

  it('a + Dash Special shortens the cooldown like extra pips', () => {
    const def = testCreature('m', {}, { special: { name: 'Zip', requirement: { type: 'always' }, effect: { type: 'addDash', value: 2 } } });
    const prep = buildWith(3, 0).build; // die 3 -> 4 s without the Special
    expect(prep.stats.dash).toBe(3);
    const withSpecial = computeBuild(def, { creatureId: 'm', player: 'P1', sides: 6, dice: [1, 1, 1, 3, 1], locked: [false, false, false, false, false], rollsUsed: 1, maxRolls: 3, stage: 'done', slots: CATS.map((category) => ({ category })), slotDice: [0, 1, 2, 3, 4] }, rules());
    expect(computeDashCooldown(withSpecial.stats.dash, rules().combat)).toBe(2);
  });
});

describe('dash distance is fixed', () => {
  it('is identical for every DASH die and modifier', () => {
    const r = rules().combat;
    const results = [null, 1, 2, 3, 4, 5, 6].flatMap((die) =>
      [-3, 0, 3].map((mod) => {
        const { def, build } = buildWith(die, mod);
        const d = resolveDash(def, r, build.stats.dash);
        return `${d.distance}/${d.step}`;
      }),
    );
    expect(new Set(results).size).toBe(1);
    expect(resolveDash(testCreature('m'), r, 0).distance).toBe(r.dash.distance);
    expect(r.dash.distance).toBe(3); // the original fixed dash distance
  });

  it('moves the same distance in combat whatever the dash value', () => {
    const idle: FighterInput = { dx: 0, dy: 0, attack: false, block: false };
    const travelled = (mod: number) => {
      const a = testCreature('a', { maxHp: 200, dash: mod }, { dice: { sides: 1, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });
      let s: GameState = customMatch({ width: 9, height: 9, creatures: [a, testCreature('b', { maxHp: 200 })], placements: [{ creature: 'a', owner: 'P1', x: 3, y: 2 }, { creature: 'b', owner: 'P2', x: 5, y: 2 }, { creature: 'b', owner: 'P2', x: 8, y: 8 }] });
      s = prepareBothAndBegin(ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } }));
      const x0 = s.battle!.combat!.fighters.attacker.y;
      for (let i = 0; i < 12; i++) s = applyCommand(s, { type: 'COMBAT_TICK', inputs: { attacker: { ...idle, dy: i === 0 ? 100 : 0, dash: i === 0 }, defender: idle } }).state;
      return s.battle!.combat!.fighters.attacker.y - x0;
    };
    const base = travelled(0);
    expect(base).toBe(rules().combat.dash.distance * rules().combat.cellUnits);
    expect(travelled(5)).toBe(base);
    expect(travelled(-4)).toBe(base);
  });
});

describe('dash migration (monster format / save v5)', () => {
  const oldMonster = (extra: Partial<CreatureDef> & Record<string, unknown>) => ({
    id: 'old',
    name: 'Old',
    art: {},
    stats: { maxHp: 9, movement: 3 },
    dice: { slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } },
    special: null,
    ...extra,
  });

  it('v4 files: the old distance-based dash values are dropped, other dash settings kept', () => {
    const file = { format: MONSTER_FORMAT, formatVersion: 4, contentVersion: 1, monster: oldMonster({ modifiers: { power: 2, dash: 3 }, dash: { distance: 1, cooldown: 2, damage: 4, dealsDamage: true } as never }) };
    const r = parseContentFile(JSON.stringify(file), rules());
    expect(r.ok).toBe(true);
    if (!r.ok || r.value.kind !== 'monster') return;
    expect(r.value.item.modifiers).toEqual({ power: 2 }); // dash modifier (was cells) -> 0
    expect(r.value.item.dash).toEqual({ damage: 4, dealsDamage: true });
    expect(r.migratedFrom).toBe(4);
  });

  it('v5 files keep the Dash Cooldown Modifier (also negative) and the fixed distance', () => {
    const file = { format: MONSTER_FORMAT, formatVersion: 5, contentVersion: 1, monster: oldMonster({ modifiers: { dash: -2 }, dash: { distance: 2 }, movement: { type: 'default' } }) };
    const r = parseContentFile(JSON.stringify(file), rules());
    expect(r.ok && r.value.kind === 'monster' && r.value.item).toMatchObject({ modifiers: { dash: -2 }, dash: { distance: 2 } });
  });

  it('local saves: v4 monsters are migrated, v5 monsters are kept', () => {
    const v4 = parseSave(JSON.stringify({ saveVersion: 4, contentVersion: 1, monsters: [oldMonster({ modifiers: { dash: 5 } })] }), rules());
    expect(v4.ok && v4.value.monsters[0].modifiers).toEqual({});
    const v5 = parseSave(JSON.stringify({ saveVersion: 5, contentVersion: 1, monsters: [oldMonster({ modifiers: { dash: -2 } })] }), rules());
    expect(v5.ok && v5.value.monsters[0].modifiers).toEqual({ dash: -2 });
  });

  it('a saved monster with a negative modifier survives save + reload', () => {
    const storage = memoryStorage();
    const lib = new ContentLibrary(basePack(), storage);
    const m = { ...lib.newMonster(), id: 'heavy', name: 'Heavy', modifiers: { power: 2, speed: -2, shield: 2, dash: -2, block: 0 } };
    expect(lib.validateMonster(m, null)).toEqual([]);
    expect(lib.saveItem('monster', m, null).ok).toBe(true);
    expect(new ContentLibrary(basePack(), storage).get('monster', 'heavy')!.item.modifiers?.dash).toBe(-2);
  });

  it('the bundled monsters and ruleset use the new dash model', () => {
    const pack = basePack();
    expect(pack.ruleset.combat.dash).toMatchObject({ distance: 3, baseCooldown: 7, minCooldown: 1 });
    expect('distancePerPoint' in pack.ruleset.combat.dash).toBe(false);
    for (const c of pack.creatures) {
      expect(c.modifiers?.dash ?? 0).toBe(0);
      expect(c.dash).toBeUndefined();
    }
  });
});
