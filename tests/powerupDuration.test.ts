import { describe, expect, it } from 'vitest';
import { ContentLibrary, defaultSpecial, memoryStorage } from '../src/content/library';
import { powerupIsGated } from '../src/core';
import { DEFAULT_BINDINGS } from '../src/input/bindings';
import { emptyFrame, type Action, type ActionFrame } from '../src/input/actions';
import { readPad } from '../src/input/gamepad';
import { emptyQueue, queuePresses, toFighterInput } from '../src/input/combatInput';
import {
  applyCommand,
  computeDamage,
  createMatch,
  powerupMapping as M,
  type AttackDef,
  type FighterInput,
  type GameEvent,
  type GameState,
  type PowerupDef,
} from '../src/core';
import {
  POWERUP_TEXT,
  powerupLabel,
  setPowerupChargeTime,
  setPowerupDuration,
  setPowerupTimeLimit,
  setPowerupCharge,
  setPowerupPower,
  setSlotCondition,
} from '../src/devEditor/model';
import { basePack, ok, prepareBothAndBegin, testCreature } from './helpers';

const idle: FighterInput = { dx: 0, dy: 0, attack: false, block: false };
const TICK = 60; // ticks per second (ruleset)

const fresh = (text: string | null = null) => {
  const storage = memoryStorage(text);
  return { storage, lib: new ContentLibrary(basePack(), storage) };
};

const RANGED_ATTACK: AttackDef = { type: 'ranged', ranged: { speed: 6, range: 7, rateOfFire: 3, impactSize: 4, homing: 2, trajectory: 3, bounce: 2 } };
const MELEE_ATTACK: AttackDef = { type: 'melee', melee: { speed: 4, knockback: 6, range: 8 } };

/** A ranged Powerup (the RANGED_ATTACK stats) whose attack must be charged. */
const charge = (over: Partial<PowerupDef> = {}): PowerupDef => ({ id: 'heavy', name: 'Heavy Charge', type: 'ranged', ranged: RANGED_ATTACK.ranged, duration: 'permanent', chargeTime: 3, ...over });
/** The same, as a melee Powerup. */
const meleeCharge = (over: Partial<PowerupDef> = {}) => charge({ type: 'melee', melee: MELEE_ATTACK.melee, ranged: undefined, ...over });
const gun = (over: Partial<PowerupDef> = {}): PowerupDef => ({
  id: 'gun',
  name: 'Gun',
  type: 'ranged',
  ranged: { speed: 9, range: 9, rateOfFire: 1, impactSize: 1, homing: 1, trajectory: 1, bounce: 0 },
  ...over,
});

/** A battle in combat: P1 attacker 'a' (left) vs P2 defender 'b' (right); open arena. */
function battle(powerup: PowerupDef | null, attack?: AttackDef): GameState {
  const a = testCreature('a', { maxHp: 500 }, { powerupId: powerup?.id ?? null, ...(attack ? { attack } : {}) });
  const b = testCreature('b', { maxHp: 500 });
  const pack = basePack();
  const s = createMatch({
    ruleset: { ...pack.ruleset, combat: { ...pack.ruleset.combat, walls: false } },
    creatures: [a, b],
    powerups: powerup ? [powerup] : [],
    seed: 1,
    board: {
      id: 't',
      name: 't',
      width: 9,
      height: 9,
      allowDiagonal: false,
      passThroughCreatures: false,
      blockedCells: [],
      powerPoints: [{ x: 4, y: 0 }],
      placements: [
        { creature: 'a', owner: 'P1', x: 3, y: 2 },
        { creature: 'b', owner: 'P2', x: 5, y: 2 },
        { creature: 'b', owner: 'P2', x: 8, y: 8 },
      ],
    },
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
const A = (s: GameState) => s.battle!.combat!.fighters.attacker;
const D = (s: GameState) => s.battle!.combat!.fighters.defender;
const has = (events: GameEvent[], type: GameEvent['type']) => events.some((e) => e.type === type && (!('side' in e) || e.side === 'attacker'));
const count = (events: GameEvent[], type: GameEvent['type']) => events.filter((e) => e.type === type && (!('side' in e) || e.side === 'attacker')).length;
/** Puts the defender right in front of the attacker (melee reach). */
const closeIn = (s: GameState) => {
  D(s).x = A(s).x + 70;
  D(s).y = A(s).y;
  A(s).aim = { x: 100, y: 0 };
  return s;
};
const HOLD = { attackHeld: true };
const PRESS = { attack: true, attackHeld: true };
/** Charge = the Left Trigger (special): press starts it, holding it keeps charging. */
const CPRESS = { special: true, specialHeld: true };
const CHOLD = { specialHeld: true };
/** Presses the charge button: the charge has just started. */
const startCharge = (s: GameState, extra: Partial<FighterInput> = {}) => run(s, 1, { ...CPRESS, ...extra });
/** Press, hold until fully charged (chargeTime seconds), then release. */
const chargeAndRelease = (s: GameState, seconds: number) => {
  s = startCharge(s).s;
  s = run(s, seconds * TICK, CHOLD).s;
  return run(s, 1);
};

// --- POWERUP CREATION -----------------------------------------------------------------------

describe('Powerup creation (editor)', () => {
  it('a new Powerup is created with a name, Permanent duration and a type', () => {
    const { lib } = fresh();
    const p = lib.newPowerup();
    expect(p.name).toMatch(/Powerup/);
    expect(p.duration).toBe('permanent');
    expect(p.type).toBe('melee');
    expect(lib.validatePowerup(p, null)).toEqual([]);
  });

  it('saves name, duration, time limit, type with all its settings, Charge and charge time (and reads them back)', () => {
    const { lib, storage } = fresh();
    const p = { ...lib.newPowerup(), id: 'heavy_charge', name: 'Heavy Charge' };
    setPowerupDuration(p, 'limited');
    setPowerupTimeLimit(p, 12);
    p.type = 'ranged';
    setPowerupCharge(p, true);
    setPowerupChargeTime(p, 4);
    expect(lib.saveItem('powerup', p, null).ok).toBe(true);
    const back = new ContentLibrary(basePack(), memoryStorage(storage.text)).get('powerup', 'heavy_charge')!.item;
    expect(back).toMatchObject({ name: 'Heavy Charge', duration: 'limited', timeLimit: 12, type: 'ranged', chargeTime: 4 });
    // Charge is part of the attack: the ranged settings are kept as they are.
    expect(back.ranged).toEqual(p.ranged);
  });

  it('Permanent is saved without a time limit; unticking Charge drops the charge time', () => {
    const { lib } = fresh();
    const p = lib.newPowerup();
    setPowerupDuration(p, 'limited');
    expect(p.timeLimit).toBe(10);
    setPowerupDuration(p, 'permanent');
    expect(p.duration).toBe('permanent');
    expect(p.timeLimit).toBeUndefined();
    setPowerupCharge(p, true);
    expect(p.chargeTime).toBe(3);
    setPowerupCharge(p, false);
    expect(p.chargeTime).toBeUndefined();
    expect(p.melee).toBeDefined();
    expect(lib.validatePowerup(p, null)).toEqual([]);
  });

  it('sliders clamp: Time Limit 1-60 s, Charge Time 1-10 s', () => {
    const p = charge();
    setPowerupTimeLimit(p, 0);
    expect(p.timeLimit).toBe(1);
    setPowerupTimeLimit(p, 99);
    expect(p.timeLimit).toBe(60);
    setPowerupChargeTime(p, 0);
    expect(p.chargeTime).toBe(1);
    setPowerupChargeTime(p, 11);
    expect(p.chargeTime).toBe(10);
  });

  it('rejects invalid values', () => {
    const { lib } = fresh();
    const bad = (over: Partial<PowerupDef> | Record<string, unknown>) => lib.validatePowerup({ ...charge(), ...over } as PowerupDef, null).join(' | ');
    expect(bad({ name: '  ' })).toMatch(/name/i);
    expect(bad({ duration: 'forever' as never })).toMatch(/duration/);
    expect(bad({ duration: 'limited' })).toMatch(/timeLimit/);
    expect(bad({ duration: 'limited', timeLimit: 0 })).toMatch(/timeLimit/);
    expect(bad({ duration: 'limited', timeLimit: 61 })).toMatch(/timeLimit/);
    expect(bad({ duration: 'permanent', timeLimit: 10 })).toMatch(/timeLimit/);
    expect(bad({ chargeTime: 0 })).toMatch(/chargeTime/);
    expect(bad({ chargeTime: 11 })).toMatch(/chargeTime/);
    expect(bad({ type: 'chargeAttack' as never })).toMatch(/type/);
    expect(bad({ type: 'laser' as never })).toMatch(/type/);
    // Charge is optional: without it the attack is a normal one.
    expect(bad({ chargeTime: undefined })).toBe('');
    expect(bad({ duration: 'limited', timeLimit: 60, chargeTime: 10 })).toBe('');
  });

  it('editor texts and labels', () => {
    expect(POWERUP_TEXT.permanent).toMatch(/^Permanent: /);
    expect(POWERUP_TEXT.limited).toMatch(/^Limited: /);
    expect(POWERUP_TEXT.charge).toMatch(/^Charge: /);
    expect(powerupLabel(charge())).toBe('Ranged · Charge 3s · Permanent');
    expect(powerupLabel(meleeCharge({ chargeTime: 5, duration: 'limited', timeLimit: 20 }))).toBe('Melee · Charge 5s · Limited 20s');
    expect(powerupLabel(gun({ duration: 'limited', timeLimit: 8 }))).toBe('Ranged · Limited 8s');
  });
});

// --- DURATION -------------------------------------------------------------------------------

describe('Powerup duration', () => {
  it('Permanent: active from the start of the battle and never expires', () => {
    let s = battle(gun());
    expect(A(s).powerup).toMatchObject({ state: 'active', limited: false });
    expect(A(s).weapon.powerupId).toBe('gun');
    const r = run(s, 5000, { special: true });
    s = r.s;
    expect(A(s).powerup!.state).toBe('active');
    expect(has(r.events, 'POWERUP_EXPIRED')).toBe(false);
  });

  it('Limited: inactive until the SPECIAL (Powerup) input, then counts down and expires at 0', () => {
    let s = battle(gun({ duration: 'limited', timeLimit: 10 }));
    expect(A(s).powerup).toMatchObject({ state: 'inactive', limited: true });
    expect(A(s).weapon.powerupId).toBeNull(); // own attack until activated
    s = run(s, 30).s;
    expect(A(s).powerup!.state).toBe('inactive'); // not active by itself
    let r = run(s, 1, { special: true });
    s = r.s;
    expect(has(r.events, 'POWERUP_ACTIVATED')).toBe(true);
    expect(A(s).powerup).toMatchObject({ state: 'active', ticksLeft: 10 * TICK });
    expect(A(s).weapon.powerupId).toBe('gun');
    s = run(s, 4 * TICK).s;
    expect(A(s).powerup!.ticksLeft).toBe(6 * TICK);
    r = run(s, 6 * TICK - 1);
    s = r.s;
    expect(A(s).powerup!.state).toBe('active');
    expect(A(s).powerup!.ticksLeft).toBe(1);
    r = run(s, 1);
    s = r.s;
    expect(has(r.events, 'POWERUP_EXPIRED')).toBe(true);
    expect(A(s).powerup).toMatchObject({ state: 'spent', ticksLeft: 0 });
    expect(A(s).weapon.powerupId).toBeNull(); // back to the own attack
  });

  it('a spent Limited Powerup cannot be activated again in the same battle', () => {
    let s = battle(gun({ duration: 'limited', timeLimit: 1 }));
    s = run(s, 1, { special: true }).s;
    s = run(s, TICK).s;
    expect(A(s).powerup!.state).toBe('spent');
    const r = run(s, 10, { special: true });
    expect(has(r.events, 'POWERUP_ACTIVATED')).toBe(false);
    expect(A(r.s).powerup!.state).toBe('spent');
  });

  it('the next battle (round) starts with the Limited Powerup available again', () => {
    let s = battle(gun({ duration: 'limited', timeLimit: 1 }));
    s = run(s, 1, { special: true }).s;
    s = run(s, TICK).s;
    expect(A(s).powerup!.state).toBe('spent');
    // End this battle (timeout: the attacker withdraws), then attack again.
    s.ruleset.combat.timeoutTicks = s.battle!.combat!.tick + 1;
    s = run(s, 2).s;
    s = ok(s, { type: 'END_BATTLE' });
    expect(s.battle).toBeNull();
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P2-b-2', to: { x: 8, y: 7 } });
    s = prepareBothAndBegin(ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } }));
    expect(s.battle!.stage).toBe('combat');
    expect(A(s).powerup).toMatchObject({ state: 'inactive', ticksLeft: 0 });
    const r = run(s, 1, { special: true });
    expect(has(r.events, 'POWERUP_ACTIVATED')).toBe(true);
  });
});

// --- CHARGE ---------------------------------------------------------------------------------

describe('Charge', () => {
  it('the attack button (RT) is always the own attack: fires at once, no charge, not the Powerup attack', () => {
    const base = A(battle(charge({ chargeTime: 3 }), RANGED_ATTACK)).baseWeapon;
    let s = battle(charge({ chargeTime: 3 }), RANGED_ATTACK);
    expect(A(s).weapon).not.toEqual(base); // the Powerup weapon is the equipped one
    const r = run(s, 1, PRESS);
    s = r.s;
    expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
    expect(A(s).charge).toEqual({ state: 'none', ticks: 0 });
    expect(A(s).cooldown).toBe(base.kind === 'ranged' ? base.cooldownTicks : -1);
    // Holding RT never charges either.
    expect(has(run(s, 3 * TICK, HOLD).events, 'CHARGE_STARTED')).toBe(false);
  });

  it('melee: the attack button swings the own attack (own range/power), not the Powerup melee', () => {
    let s = closeIn(battle(meleeCharge({ chargeTime: 1, melee: { speed: 1, knockback: 10, range: 10 } })));
    const own = A(s).baseWeapon;
    expect(own).not.toEqual(A(s).weapon);
    const r = run(s, 1, PRESS);
    expect(has(r.events, 'ATTACK_STARTED')).toBe(true);
    expect(A(r.s).swingWeapon).toEqual(own);
  });

  it('Left Trigger starts charging at once (no attack); ready after exactly Charge Time', () => {
    let s = battle(charge({ chargeTime: 3 }), RANGED_ATTACK);
    let r = run(s, 1, CPRESS);
    s = r.s;
    expect(has(r.events, 'CHARGE_STARTED')).toBe(true);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
    expect(A(s).charge).toEqual({ state: 'charging', ticks: 0 });
    r = run(s, 3 * TICK - 1, CHOLD);
    s = r.s;
    expect(A(s).charge.state).toBe('charging');
    expect(has(r.events, 'CHARGE_READY')).toBe(false);
    r = run(s, 1, CHOLD);
    s = r.s;
    expect(A(s).charge).toEqual({ state: 'ready', ticks: 3 * TICK });
    expect(count(r.events, 'CHARGE_READY')).toBe(1);
    // Staying ready while held: no new events, no attack.
    r = run(s, 120, CHOLD);
    expect(A(r.s).charge.state).toBe('ready');
    expect(has(r.events, 'CHARGE_READY')).toBe(false);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
  });

  it('while charging the attack button does nothing', () => {
    let s = startCharge(battle(charge({ chargeTime: 3 }), RANGED_ATTACK)).s;
    const r = run(s, 30, { ...CHOLD, attack: true, attackHeld: true });
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
    expect(A(r.s).charge.state).toBe('charging');
  });

  it('respects other charge times (1 s and 10 s)', () => {
    for (const secs of [1, 10]) {
      let s = startCharge(battle(charge({ chargeTime: secs }), RANGED_ATTACK)).s;
      s = run(s, secs * TICK - 1, CHOLD).s;
      expect(A(s).charge.state).toBe('charging');
      expect(A(run(s, 1, CHOLD).s).charge.state).toBe('ready');
    }
  });

  it('movement is heavily reduced while charging, and normal again afterwards', () => {
    const right = { dx: 100, dy: 0 };
    const plain = battle(charge(), RANGED_ATTACK);
    const x0 = A(plain).x;
    const normal = A(run(plain, 60, right).s).x - x0;
    let s = startCharge(battle(charge(), RANGED_ATTACK), right).s;
    const c0 = A(s).x;
    s = run(s, 60, { ...CHOLD, ...right }).s;
    const charged = A(s).x - c0;
    expect(normal).toBe(60 * A(s).moveSpeed);
    expect(charged).toBeGreaterThan(0);
    expect(charged).toBeLessThanOrEqual(normal * 0.2);
    // Release (early): normal speed again; the Speed stat never changed.
    const speed = A(s).moveSpeed;
    s = run(s, 1, right).s;
    const r0 = A(s).x;
    s = run(s, 10, right).s;
    expect(A(s).x - r0).toBe(10 * speed);
  });

  it('releasing early cancels: no attack, back to normal, and can charge again', () => {
    let s = startCharge(battle(charge({ chargeTime: 3 }), RANGED_ATTACK)).s;
    s = run(s, TICK, CHOLD).s;
    let r = run(s, 1);
    s = r.s;
    expect(r.events).toContainEqual({ type: 'CHARGE_CANCELLED', side: 'attacker', reason: 'early' });
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
    expect(A(s).charge).toEqual({ state: 'none', ticks: 0 });
    expect(A(s).cooldown).toBe(0); // nothing was spent
    expect(has(startCharge(s).events, 'CHARGE_STARTED')).toBe(true);
  });

  it('ranged: release after ready fires the configured ranged attack (same projectile, same cooldown)', () => {
    // Reference: the same own attack without a Powerup.
    const ref = run(battle(charge({ chargeTime: undefined })), 1, PRESS).s;
    const refShot = ref.battle!.combat!.projectiles[0];
    let s = battle(charge({ chargeTime: 2 }), RANGED_ATTACK);
    const weaponBefore = structuredClone(A(s).weapon);
    const statsBefore = structuredClone(A(s).stats);
    s = startCharge(s).s;
    s = run(s, 2 * TICK, CHOLD).s;
    // Aim and position as in the reference shot.
    const r = run(s, 1);
    s = r.s;
    expect(has(r.events, 'CHARGE_RELEASED')).toBe(true);
    expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
    const shot = s.battle!.combat!.projectiles[0];
    for (const k of ['speed', 'maxTravel', 'bouncesLeft', 'homing', 'impactRadius', 'vx', 'vy'] as const) expect(shot[k]).toBe(refShot[k]);
    expect(A(s).cooldown).toBe(M.rateOfFireTicks(3, s.ruleset.combat)); // the attack's own rate of fire
    // Nothing about the attack or the stats changed.
    expect(A(s).weapon).toEqual(weaponBefore);
    expect(A(s).stats).toEqual(statsBefore);
    expect(A(s).charge).toEqual({ state: 'none', ticks: 0 });
  });

  it('ranged: the charged shot hits for the attack Power reduced by Shield', () => {
    let s = battle(charge({ chargeTime: 1 }), RANGED_ATTACK);
    D(s).x = A(s).x + 400; // within the attack's range
    const expected = computeDamage(A(s).stats, D(s).stats, s.ruleset.combat);
    const hp = D(s).hp;
    s = chargeAndRelease(s, 1).s;
    const r = run(s, 400);
    expect(r.events).toContainEqual({ type: 'HIT', side: 'attacker', damage: expected });
    expect(D(r.s).hp).toBe(hp - expected);
  });

  it('melee: release after ready swings the configured melee attack (Power, Speed, Range, Knockback)', () => {
    let s = closeIn(battle(meleeCharge({ chargeTime: 1 })));
    const weapon = structuredClone(A(s).weapon);
    expect(weapon).toMatchObject({ kind: 'melee', range: M.meleeRange(8), knockback: M.meleeKnockback(6) });
    const expected = computeDamage(A(s).stats, D(s).stats, s.ruleset.combat);
    const hp = D(s).hp;
    s = startCharge(s).s;
    expect(A(s).windup).toBe(0); // charging, not swinging
    s = run(s, TICK, CHOLD).s;
    let r = run(s, 1);
    s = r.s;
    expect(has(r.events, 'ATTACK_STARTED')).toBe(true);
    expect(A(s).cooldown).toBe(M.meleeCooldownTicks(4, s.ruleset.combat)); // the attack's own speed
    r = run(s, s.ruleset.combat.windupTicks);
    expect(r.events).toContainEqual({ type: 'HIT', side: 'attacker', damage: expected });
    expect(r.events.find((e) => e.type === 'KNOCKBACK')).toBeDefined();
    expect(D(r.s).hp).toBe(hp - expected);
    expect(A(r.s).weapon).toEqual(weapon);
  });

  it('melee: the configured range still decides whether the charged swing connects', () => {
    let s = battle(meleeCharge({ chargeTime: 1, melee: { speed: 1, knockback: 1, range: 1 } }));
    D(s).x = A(s).x + M.meleeRange(1) + 30;
    D(s).y = A(s).y;
    A(s).aim = { x: 100, y: 0 };
    s = chargeAndRelease(s, 1).s;
    const r = run(s, s.ruleset.combat.windupTicks);
    expect(has(r.events, 'HIT')).toBe(false);
  });

  it('can charge again once the attack cooldown allows', () => {
    let s = battle(charge({ chargeTime: 1 }), RANGED_ATTACK);
    s = chargeAndRelease(s, 1).s;
    // Still on cooldown: pressing does nothing.
    let r = run(s, 1, PRESS);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
    s = run(r.s, M.rateOfFireTicks(3, s.ruleset.combat)).s;
    r = startCharge(s);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(true);
    s = run(r.s, 1 * TICK, CHOLD).s;
    r = run(s, 1);
    expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
  });

  it('is deterministic: the same inputs give the same state', () => {
    const play = () => {
      let s = battle(charge({ chargeTime: 2, duration: 'limited', timeLimit: 5 }), RANGED_ATTACK);
      s = run(s, 1, { special: true }).s;
      s = run(s, 1, { ...CPRESS, dx: 50 }).s;
      s = run(s, 150, { ...CHOLD, dx: 50, dy: -30 }).s;
      return run(s, 200, { dx: -100 }).s.battle!.combat;
    };
    expect(play()).toEqual(play());
  });
});

// --- LIMITED + CHARGE -----------------------------------------------------------------------

describe('Limited + Charge', () => {
  const limitedCharge = () => battle(charge({ chargeTime: 2, duration: 'limited', timeLimit: 10 }), RANGED_ATTACK);

  it('before activation the attack is normal (no charge); after activation it must be charged', () => {
    let s = limitedCharge();
    let r = run(s, 1, PRESS);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(true);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
    s = run(r.s, 200).s; // cooldown over
    s = run(s, 1, { special: true }).s;
    expect(A(s).powerup!.state).toBe('active');
    r = startCharge(s);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(true);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
    s = run(r.s, 2 * TICK, CHOLD).s;
    r = run(s, 1);
    expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
    // Countdown tracked: after activation, 1 (press) + 120 (charge) + 1 (release) ticks of 600 used.
    expect(A(r.s).powerup!.ticksLeft).toBe(10 * TICK - 122);
  });

  it('when the timer reaches 0 the charge is no longer available (attacks are normal again)', () => {
    let s = run(limitedCharge(), 1, { special: true }).s;
    s = run(s, 10 * TICK).s;
    expect(A(s).powerup!.state).toBe('spent');
    const r = run(s, 1, PRESS);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(true);
  });

  it('a charge in progress when the Powerup expires is cancelled, without firing', () => {
    let s = run(limitedCharge(), 1, { special: true }).s;
    s = run(s, 10 * TICK - 90).s;
    s = run(s, 1, CPRESS).s;
    const r = run(s, 90, CHOLD);
    expect(r.events).toContainEqual({ type: 'CHARGE_CANCELLED', side: 'attacker', reason: 'expired' });
    expect(has(r.events, 'POWERUP_EXPIRED')).toBe(true);
    expect(has(r.events, 'CHARGE_READY')).toBe(false);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
    expect(A(r.s).charge).toEqual({ state: 'none', ticks: 0 });
    // Releasing afterwards does nothing either.
    expect(has(run(r.s, 1).events, 'PROJECTILE_FIRED')).toBe(false);
  });

  it('the Left Trigger press that activates the Powerup does not also start a charge', () => {
    let r = run(limitedCharge(), 1, CPRESS);
    expect(has(r.events, 'POWERUP_ACTIVATED')).toBe(true);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
    r = run(r.s, 30, CHOLD); // still holding it: nothing
    expect(A(r.s).charge.state).toBe('none');
    // Let go and press again: now it charges.
    const s = run(r.s, 1).s;
    expect(has(run(s, 1, CPRESS).events, 'CHARGE_STARTED')).toBe(true);
  });

  it('cannot be activated again in the same battle', () => {
    let s = run(limitedCharge(), 1, { special: true }).s;
    s = run(s, 10 * TICK).s;
    const r = run(s, 30, { special: true });
    expect(has(r.events, 'POWERUP_ACTIVATED')).toBe(false);
    expect(A(r.s).powerup!.state).toBe('spent');
  });
});

// --- REGRESSION -----------------------------------------------------------------------------

describe('Without Charge nothing changes', () => {
  it('a monster without a Powerup attacks at once, as before', () => {
    const s = battle(null, RANGED_ATTACK);
    expect(A(s).powerup).toBeNull();
    const r = run(s, 1, PRESS);
    expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
  });

  it('existing Powerups (no duration set) are permanent weapons, exactly as before', () => {
    const base = basePack().powerups;
    expect(base.length).toBeGreaterThan(0);
    for (const p of base) {
      expect(p.duration).toBeUndefined();
      const s = battle(p);
      expect(A(s).powerup).toMatchObject({ state: 'active', limited: false });
      expect(A(s).weapon.powerupId).toBe(p.id);
      const r = run(s, 1, PRESS);
      expect(has(r.events, 'PROJECTILE_FIRED') || has(r.events, 'ATTACK_STARTED')).toBe(true);
    }
  });

});

// --- POWER OVERRIDE -------------------------------------------------------------------------

describe('Powerup Power override', () => {
  it('editor: 1-10 is stored, 0 = the monster Power (nothing stored); validation 1-10', () => {
    const { lib } = fresh();
    const p = lib.newPowerup('ranged');
    setPowerupPower(p, 10);
    expect(p.power).toBe(10);
    setPowerupPower(p, 99);
    expect(p.power).toBe(10);
    setPowerupPower(p, 0);
    expect(p.power).toBeUndefined();
    expect(lib.validatePowerup({ ...p, power: 7 }, null)).toEqual([]);
    expect(lib.validatePowerup({ ...p, power: 0 }, null).join()).toMatch(/power/);
    expect(lib.validatePowerup({ ...p, power: 11 }, null).join()).toMatch(/power/);
  });

  it('melee: the swing hits with the Powerup Power instead of the monster Power', () => {
    let s = closeIn(battle(meleeCharge({ chargeTime: undefined, power: 10 })));
    const expected = computeDamage({ ...A(s).stats, power: 10 }, D(s).stats, s.ruleset.combat);
    expect(expected).not.toBe(computeDamage(A(s).stats, D(s).stats, s.ruleset.combat));
    s = run(s, 1, PRESS).s;
    const r = run(s, s.ruleset.combat.windupTicks);
    expect(r.events).toContainEqual({ type: 'HIT', side: 'attacker', damage: expected });
    expect(A(r.s).stats.power).not.toBe(10); // the monster's own Power is untouched
  });

  it('ranged + Charge: the charged shot hits with the Powerup Power', () => {
    let s = battle(charge({ chargeTime: 1, power: 10 }));
    D(s).x = A(s).x + 400;
    const expected = computeDamage({ ...A(s).stats, power: 10 }, D(s).stats, s.ruleset.combat);
    s = chargeAndRelease(s, 1).s;
    expect(s.battle!.combat!.projectiles[0].power).toBe(10);
    const r = run(s, 400);
    expect(r.events).toContainEqual({ type: 'HIT', side: 'attacker', damage: expected });
  });

  it('without an override the monster Power is used (as before)', () => {
    let s = closeIn(battle(meleeCharge({ chargeTime: undefined })));
    expect(A(s).weapon.power).toBeUndefined();
    const expected = computeDamage(A(s).stats, D(s).stats, s.ruleset.combat);
    s = run(s, 1, PRESS).s;
    expect(run(s, s.ruleset.combat.windupTicks).events).toContainEqual({ type: 'HIT', side: 'attacker', damage: expected });
  });

  it('a Limited Powerup Power only counts while it is active', () => {
    const s = battle(meleeCharge({ chargeTime: undefined, power: 10, duration: 'limited', timeLimit: 5 }));
    expect(A(s).weapon.power).toBeUndefined();
    expect(A(run(s, 1, { special: true }).s).weapon.power).toBe(10);
  });
});

// --- POWERUP NEEDS THE SPECIAL TRIGGER --------------------------------------------------------

describe('Powerup unlocked by its slot conditions', () => {
  /** P1 monster 'a' with a Powerup and (if `gated`) the condition "slot 1 = Even"; its slot-1 die is `die`. */
  function triggered(die: number, gated: boolean, powerup: PowerupDef = charge({ chargeTime: 2 })): GameState {
    const a = testCreature('a', { maxHp: 500 }, { powerupId: powerup.id, attack: RANGED_ATTACK, dice: { sides: 6, slots: { speed: 1, power: 1, shield: 1, dash: 1, block: 1 } } });
    if (gated) setSlotCondition(a, 0, 'even', 5);
    const pack = basePack();
    let s = createMatch({
      ruleset: { ...pack.ruleset, combat: { ...pack.ruleset.combat, walls: false } },
      creatures: [a, testCreature('b', { maxHp: 500 })],
      powerups: [powerup],
      seed: 1,
      board: {
        id: 't', name: 't', width: 9, height: 9, allowDiagonal: false, passThroughCreatures: false, blockedCells: [], powerPoints: [{ x: 4, y: 0 }],
        placements: [{ creature: 'a', owner: 'P1', x: 3, y: 2 }, { creature: 'b', owner: 'P2', x: 5, y: 2 }, { creature: 'b', owner: 'P2', x: 8, y: 8 }],
      },
    });
    s = ok(s, { type: 'MOVE_CREATURE', creatureId: 'P1-a-1', to: { x: 5, y: 2 } });
    for (const pl of ['P1', 'P2'] as const) {
      const prep = Object.values(s.battle!.prep).find((p) => p.player === pl)!;
      if (pl === 'P1') prep.dice[0] = die;
      for (let i = 0; i < prep.slots.length; i++) s = ok(s, { type: 'ALLOCATE_DIE', die: i, slot: i, player: pl });
      s = ok(s, { type: 'CONFIRM_ALLOCATION', player: pl });
    }
    while (s.battle!.stage === 'countdown') s = ok(s, { type: 'COMBAT_TICK', inputs: { attacker: idle, defender: idle } });
    return s;
  }

  it('trigger met (even die): the Powerup works, and the build is not locked', () => {
    const s = triggered(2, true);
    expect(s.battle!.builds!.attacker).toMatchObject({ specialActive: true, powerupLocked: false });
    expect(A(s).powerup!.state).toBe('active');
    expect(has(startCharge(s).events, 'CHARGE_STARTED')).toBe(true);
  });

  it('trigger NOT met (odd die): the Powerup is locked for the whole battle and the own attack is used', () => {
    let s = triggered(3, true);
    expect(s.battle!.builds!.attacker).toMatchObject({ specialActive: false, powerupLocked: true });
    expect(A(s).powerup!.state).toBe('locked');
    expect(A(s).weapon).toEqual(A(s).baseWeapon);
    const r = run(s, 1, PRESS);
    s = r.s;
    expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
    expect(has(r.events, 'PROJECTILE_FIRED')).toBe(true); // the own (ranged) attack, at once
    expect(A(run(s, 600, HOLD).s).powerup!.state).toBe('locked');
  });

  it('a locked Limited Powerup cannot be activated with the Powerup button', () => {
    const s = triggered(3, true, gun({ duration: 'limited', timeLimit: 5 }));
    const r = run(s, 5, { special: true });
    expect(has(r.events, 'POWERUP_ACTIVATED')).toBe(false);
    expect(A(r.s).powerup!.state).toBe('locked');
    expect(A(r.s).weapon.powerupId).toBeNull();
  });

  it('without any slot condition the Powerup is always available (nothing to meet)', () => {
    const s = triggered(3, false);
    expect(s.battle!.builds!.attacker).toMatchObject({ powerupLocked: false });
    expect(A(s).powerup!.state).toBe('active');
  });

  it('a monster without a Special has no condition: its Powerup is never locked', () => {
    const a = testCreature('a', {}, { powerupId: 'gun' });
    expect(a.special).toBeNull();
    expect(powerupIsGated(a)).toBe(false);
  });

  it('the default Special has an empty effect: slot conditions only gate the Powerup', () => {
    expect(defaultSpecial(5).effect).toEqual({ type: 'multi', effects: [] });
  });
});

// --- CHARGE ON THE LEFT TRIGGER, THROUGH THE REAL INPUT PIPELINE ------------------------------

/**
 * Plays one button press of `pressMs` through the game's input path (ActionFrame ->
 * queuePresses -> toFighterInput -> COMBAT_TICK) at a display refresh rate, then idles
 * `tailMs`. `action` is the abstract action held: RT = 'attack', LT = 'special' (the
 * keyboard's Powerup key gives the same actions).
 */
function playPress(s: GameState, action: Action, pressMs: number, tailMs: number, hz = 60, held?: () => Set<Action>) {
  const events: GameEvent[] = [];
  const dt = 1000 / hz;
  const step = 1000 / s.ruleset.combat.tickRate;
  let acc = 0;
  let q = emptyQueue();
  let prev = false;
  const states: string[] = [];
  for (let t = 0; t < pressMs + tailMs; t += dt) {
    const down = t < pressMs;
    const f: ActionFrame = emptyFrame();
    if (down) f.held = held ? held() : new Set<Action>([action]);
    if (down && !prev) f.pressed.add(action);
    prev = down;
    queuePresses(q, f);
    acc += dt;
    while (acc >= step) {
      acc -= step;
      const input = toFighterInput(f, q, null);
      q = emptyQueue();
      const r = applyCommand(s, { type: 'COMBAT_TICK', inputs: { attacker: input, defender: idle } });
      if (r.error) throw new Error(r.error);
      s = r.state;
      events.push(...r.events);
      states.push(A(s).charge.state);
    }
  }
  return { s, events, states };
}

describe('Charge: Left Trigger holds the charge, Right Trigger is the normal attack (real input path)', () => {
  const fresh3 = () => battle(charge({ chargeTime: 3 }), RANGED_ATTACK);
  for (const hz of [60, 144]) {
    for (const ms of [30, 100, 500, 1500]) {
      it(`${hz} Hz: a ${ms} ms Right Trigger press fires the normal attack and never charges`, () => {
        const r = playPress(fresh3(), 'attack', ms, 400, hz);
        expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
        expect(has(r.events, 'CHARGE_STARTED')).toBe(false);
        expect(r.states.every((x) => x === 'none')).toBe(true);
      });
    }

    it(`${hz} Hz: holding Left Trigger charges; releasing before ready cancels (no shot)`, () => {
      const r = playPress(fresh3(), 'special', 2000, 400, hz);
      expect(has(r.events, 'CHARGE_STARTED')).toBe(true);
      expect(r.events).toContainEqual({ type: 'CHARGE_CANCELLED', side: 'attacker', reason: 'early' });
      expect(has(r.events, 'PROJECTILE_FIRED')).toBe(false);
      expect(A(r.s).charge.state).toBe('none');
    });

    it(`${hz} Hz: holding Left Trigger for Charge Time reaches READY and releasing fires the charged attack`, () => {
      const ready = playPress(fresh3(), 'special', 3100, 0, hz);
      expect(A(ready.s).charge.state).toBe('ready');
      expect(count(ready.events, 'CHARGE_READY')).toBe(1);
      const r = playPress(fresh3(), 'special', 3100, 300, hz);
      expect(has(r.events, 'CHARGE_RELEASED')).toBe(true);
      expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
    });
  }

  it('movement is normal with no charge, and very low only while charging', () => {
    const right = { dx: 100, dy: 0 };
    const s0 = battle(charge({ chargeTime: 3 }), RANGED_ATTACK);
    const x0 = A(s0).x;
    const normal = A(run(s0, 30, right).s).x - x0;
    // RT held: still normal movement.
    expect(A(run(s0, 30, { ...right, ...HOLD }).s).x - x0).toBe(normal);
    // LT held: heavily reduced.
    const c = run(s0, 30, { ...right, ...CPRESS }).s;
    expect(A(c).x - x0).toBeLessThan(normal * 0.2);
  });

  it('gamepad: LT (6) is the special/charge action, RT (7) the attack', () => {
    const pad = (idx: number) => ({ connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, (_, i) => ({ pressed: i === idx, value: i === idx ? 1 : 0 })) });
    expect([...readPad(pad(6), DEFAULT_BINDINGS).held]).toEqual(['special']);
    expect([...readPad(pad(7), DEFAULT_BINDINGS).held]).toEqual(['attack']);
    const lt = playPress(fresh3(), 'special', 3100, 300, 60, () => readPad(pad(6), DEFAULT_BINDINGS).held);
    expect(has(lt.events, 'CHARGE_RELEASED')).toBe(true);
    const rt = playPress(fresh3(), 'attack', 300, 300, 60, () => readPad(pad(7), DEFAULT_BINDINGS).held);
    expect(has(rt.events, 'CHARGE_STARTED')).toBe(false);
    expect(count(rt.events, 'PROJECTILE_FIRED')).toBe(1);
  });

  it('keyboard: the Powerup key (X / Numpad -) is the charge action, Space / Enter the attack', () => {
    expect(DEFAULT_BINDINGS.keyboard.P1.KeyX).toBe('special');
    expect(DEFAULT_BINDINGS.keyboard.P2.NumpadSubtract).toBe('special');
  });

  it('a monster without Charge: Right Trigger attacks immediately, Left Trigger starts no charge', () => {
    const s = battle(null, RANGED_ATTACK);
    const r = playPress(s, 'attack', 16, 0, 60);
    expect(count(r.events, 'PROJECTILE_FIRED')).toBe(1);
    const lt = playPress(battle(null, RANGED_ATTACK), 'special', 1500, 0, 60);
    expect(has(lt.events, 'CHARGE_STARTED')).toBe(false);
    expect(lt.states.every((x) => x === 'none')).toBe(true);
  });

  it('is deterministic: the same press timing gives the same state', () => {
    const a = playPress(fresh3(), 'special', 2500, 300, 144);
    const b = playPress(fresh3(), 'special', 2500, 300, 144);
    expect(a.s.battle!.combat).toEqual(b.s.battle!.combat);
    expect(a.events).toEqual(b.events);
  });
});
