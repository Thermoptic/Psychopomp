// Powerup level -> gameplay value mappings. Designers edit levels (1-10;
// impact damage 1-100); these functions are the single, deterministic place
// that turns them into combat values. All results are integers.
//
// Units: combat units (one arena cell = ruleset cellUnits = 80) and ticks
// (ruleset tickRate = 60/s). "Pixels" in the design notes are converted with
// PX = 2 combat units (an arena cell is ~40 design pixels).
//
//   MELEE
//     speed      time between attacks   level × 0.5 s   (1 = 0.5 s … 10 = 5.0 s)
//     knockback  push on hit            level × 5 px     (1 = 5 px … 10 = 50 px) = level × 10 units
//     range      reach (centre-centre)  56 + (level-1) × 16 units
//                                       1 = 56 (bodies touching, 2 × radius 26 + 4)
//                                       10 = 200 (2.5 cells); classic melee is 96 ≈ level 3.5
//   RANGED
//     speed      projectile speed       level × 4 units/tick (1 = 4 ≈ walking pace … 10 = 40)
//     range      travel before fizzling level × 2 cells (1 = 2 cells … 10 = 20 cells = whole arena)
//     rateOfFire time between shots     level × 0.5 s   (1 = 0.5 s … 10 = 5.0 s)
//     impactSize shockwave radius       level × 16 units (1 ≈ 0.2 cell … 10 = 2 cells)
//     impactDmg  shockwave damage       1-100, used as is (guard blocks it; shield does not reduce it)
//     homing     steering per tick      level × 2 % of speed towards the opponent
//                                       (1 = 2 %: barely bends … 10 = 20 %: turns ~11°/tick),
//                                       a real turn rate — it can still miss and hits walls
//     trajectory Magnus curve           only when the shooter is moving while firing:
//                                       turn per tick = level × 0.225° × sin(angle between aim and
//                                       movement). Total curve = turn × flight ticks, so it works
//                                       with speed: at level 10 a speed-5 / range-5 shot (40 ticks)
//                                       bends ~90°; faster shots bend less, slower ones more.
//     bounce     wall bounces           level (0-10); with none left a wall hit removes the shot
//     size/trail/color                    presentation only (projectile size, fading trail, colour)

import type { CombatRules, CreatureDef, FighterPowerup, PowerupDef, Weapon, WeaponSettings } from '../types';

export const PX = 2;
export const PROJECTILE_RADIUS = 6;
/** 0.225° in radians × 65536. */
const CURVE_PER_LEVEL = 257;

const clampLevel = (v: number) => Math.max(1, Math.min(10, Math.round(v)));
const secondsToTicks = (s: number, rules: CombatRules) => Math.round(s * rules.tickRate);

export const meleeCooldownTicks = (level: number, rules: CombatRules) => secondsToTicks(clampLevel(level) * 0.5, rules);
export const meleeKnockback = (level: number) => clampLevel(level) * 5 * PX;
export const meleeRange = (level: number) => 56 + (clampLevel(level) - 1) * 16;

export const projectileSpeed = (level: number) => clampLevel(level) * 4;
export const projectileRange = (level: number, rules: CombatRules) => clampLevel(level) * 2 * rules.cellUnits;
export const rateOfFireTicks = (level: number, rules: CombatRules) => secondsToTicks(clampLevel(level) * 0.5, rules);
export const impactRadius = (level: number) => clampLevel(level) * 16;
export const homingPercent = (level: number) => clampLevel(level) * 2;
export const trajectoryCurve = (level: number) => clampLevel(level) * CURVE_PER_LEVEL;
export const bounceCount = (level: number) => Math.max(0, Math.min(10, Math.round(level)));
/** Trail length in ticks of projectile history (presentation): 3 per level, 0 = none. */
export const trailTicks = (level: number) => Math.max(0, Math.min(10, Math.round(level))) * 3;

/** The classic melee attack (no Powerup): stat-based cooldown, ruleset range, no knockback. */
export function classicWeapon(rules: CombatRules): Weapon {
  return { kind: 'melee', powerupId: null, cooldownTicks: null, range: rules.attackRange, knockback: 0 };
}

/** The monster's own attack: its attack settings, or without those the classic melee. */
export function ownWeapon(def: CreatureDef, rules: CombatRules): Weapon {
  if (def.attack?.type) return weaponFromSettings(def.attack, null, rules);
  return classicWeapon(rules);
}

/** Limited Powerup time limit, seconds. */
export const TIME_LIMIT_MIN = 1;
export const TIME_LIMIT_MAX = 60;
/** Charge time, seconds. */
export const CHARGE_TIME_MIN = 1;
export const CHARGE_TIME_MAX = 10;
/** A Charge Powerup: holding attack this long (seconds) starts the charge; a shorter press is a normal attack. */
export const CHARGE_HOLD_SECONDS = 1;
/** Movement while charging, percent of normal movement speed ("almost stationary"). */
export const CHARGE_MOVE_PERCENT = 15;

const clampIn = (v: number | undefined, lo: number, hi: number, fallback: number) => Math.max(lo, Math.min(hi, Math.round(v ?? fallback)));

/**
 * A creature's weapon: an equipped Powerup replaces the monster's own attack;
 * otherwise the monster's own attack settings; without those the classic melee.
 */
export function resolveWeapon(def: CreatureDef, powerups: Record<string, PowerupDef>, rules: CombatRules): Weapon {
  const p = def.powerupId ? powerups[def.powerupId] : undefined;
  if (p) return powerupWeapon(p, rules);
  return ownWeapon(def, rules);
}

/** Power override range (Powerups). */
export const POWER_MIN = 1;
export const POWER_MAX = 10;

/** A Powerup's weapon, with its Power override if it has one. */
export function powerupWeapon(p: PowerupDef, rules: CombatRules): Weapon {
  const w = weaponFromSettings(p, p.id, rules);
  if (p.power !== undefined) w.power = clampIn(p.power, POWER_MIN, POWER_MAX, POWER_MAX);
  return w;
}

/** The battle state of a creature's equipped Powerup (fresh every battle), or null. */
export function fighterPowerup(def: CreatureDef, powerups: Record<string, PowerupDef>, rules: CombatRules): FighterPowerup | null {
  const p = def.powerupId ? powerups[def.powerupId] : undefined;
  if (!p) return null;
  const limited = p.duration === 'limited';
  const charge = p.chargeTime !== undefined;
  return {
    id: p.id,
    type: p.type,
    limited,
    state: limited ? 'inactive' : 'active',
    ticksLeft: 0,
    limitTicks: limited ? secondsToTicks(clampIn(p.timeLimit, TIME_LIMIT_MIN, TIME_LIMIT_MAX, 10), rules) : 0,
    holdTicks: secondsToTicks(CHARGE_HOLD_SECONDS, rules),
    chargeTicks: charge ? secondsToTicks(clampIn(p.chargeTime, CHARGE_TIME_MIN, CHARGE_TIME_MAX, 3), rules) : 0,
    weapon: powerupWeapon(p, rules),
  };
}

/** Gameplay values for melee/ranged settings (shared by monster attacks and Powerups). */
export function weaponFromSettings(w: WeaponSettings, powerupId: string | null, rules: CombatRules): Weapon {
  if (w.type === 'melee' && w.melee) {
    return {
      kind: 'melee',
      powerupId,
      cooldownTicks: meleeCooldownTicks(w.melee.speed, rules),
      range: meleeRange(w.melee.range),
      knockback: meleeKnockback(w.melee.knockback),
    };
  }
  if (w.type === 'ranged' && w.ranged) {
    const r = w.ranged;
    return {
      kind: 'ranged',
      powerupId,
      cooldownTicks: rateOfFireTicks(r.rateOfFire, rules),
      speed: projectileSpeed(r.speed),
      range: projectileRange(r.range, rules),
      impactRadius: impactRadius(r.impactSize),
      homing: homingPercent(r.homing),
      curve: trajectoryCurve(r.trajectory),
      bounces: bounceCount(r.bounce),
      look: {
        size: Math.max(1, Math.min(10, Math.round(r.size ?? 1))),
        trail: Math.max(0, Math.min(10, Math.round(r.trail ?? 0))),
        color: r.color ?? null,
      },
    };
  }
  return classicWeapon(rules);
}

/** Fixed-point cos/sin (×65536) of a small angle given ×65536, via Taylor series (deterministic integers). */
export function smallAngleCosSin(angleFp: number): { cos: number; sin: number } {
  const a = angleFp;
  const a2 = Math.trunc((a * a) / 65536);
  const a3 = Math.trunc((a2 * a) / 65536);
  return { cos: 65536 - Math.trunc(a2 / 2), sin: a - Math.trunc(a3 / 6) };
}
