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
//     bounce     wall bounces           level (1-10); the next wall hit after that is its impact

import type { CombatRules, CreatureDef, PowerupDef, Weapon, WeaponSettings } from '../types';

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
export const impactDamage = (value: number) => Math.max(1, Math.min(100, Math.round(value)));
export const homingPercent = (level: number) => clampLevel(level) * 2;
export const trajectoryCurve = (level: number) => clampLevel(level) * CURVE_PER_LEVEL;
export const bounceCount = (level: number) => clampLevel(level);

/** The classic melee attack (no Powerup): stat-based cooldown, ruleset range, no knockback. */
export function classicWeapon(rules: CombatRules): Weapon {
  return { kind: 'melee', powerupId: null, cooldownTicks: null, range: rules.attackRange, knockback: 0 };
}

/**
 * A creature's weapon: an equipped Powerup replaces the monster's own attack;
 * otherwise the monster's own attack settings; without those the classic melee.
 */
export function resolveWeapon(def: CreatureDef, powerups: Record<string, PowerupDef>, rules: CombatRules): Weapon {
  const p = def.powerupId ? powerups[def.powerupId] : undefined;
  if (p) return weaponFromSettings(p, p.id, rules);
  if (def.attack?.type) return weaponFromSettings(def.attack, null, rules);
  return classicWeapon(rules);
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
      impactDamage: impactDamage(r.impactDamage),
      homing: homingPercent(r.homing),
      curve: trajectoryCurve(r.trajectory),
      bounces: bounceCount(r.bounce),
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
