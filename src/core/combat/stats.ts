// All combat formulas live here. UI and simulation code must call these rather
// than computing stats themselves.
//
//   BattleStats = BaseStats + DiceModifiers + SpecialModifiers
//
// Battle stats are temporary; they are never written back to content.

import { diceView } from '../dice/dice';
import { evaluateRequirement } from '../dice/requirements';
import type { BattleBuild, BattleStats, CombatRules, CreatureDef, DicePrep, Effect, StatCategory } from '../types';

/** Categories whose dice add directly to a battle stat of the same name. */
const STAT_CATEGORIES: ReadonlyArray<keyof BattleStats> = ['power', 'shield', 'speed', 'block'];

export function baseBattleStats(def: CreatureDef): BattleStats {
  return {
    power: def.stats.power,
    shield: def.stats.shield,
    speed: def.stats.speed,
    block: def.stats.block ?? 0,
  };
}

export function applyEffect(stats: BattleStats, effect: Effect): void {
  switch (effect.type) {
    case 'addPower':
      stats.power += effect.value;
      break;
    case 'addShield':
      stats.shield += effect.value;
      break;
    case 'addSpeed':
      stats.speed += effect.value;
      break;
    case 'addBlock':
      stats.block += effect.value;
      break;
    case 'multi':
      for (const e of effect.effects) applyEffect(stats, e);
      break;
  }
}

/** Computes the temporary build from a creature's content and its final dice. */
export function computeBuild(def: CreatureDef, prep: DicePrep): BattleBuild {
  const view = diceView(prep);
  const diceByCategory: Record<StatCategory, number> = {};
  for (const [cat, values] of Object.entries(view.byCategory)) {
    diceByCategory[cat] = values.reduce((a, b) => a + b, 0);
  }

  const stats = baseBattleStats(def);
  for (const key of STAT_CATEGORIES) stats[key] += diceByCategory[key] ?? 0;

  const specialActive = def.special ? evaluateRequirement(def.special.requirement, view) : false;
  if (def.special && specialActive) applyEffect(stats, def.special.effect);

  for (const key of STAT_CATEGORIES) stats[key] = Math.max(0, stats[key]);

  return {
    creatureId: prep.creatureId,
    diceByCategory,
    specialName: def.special?.name ?? null,
    specialActive,
    stats,
  };
}

/** damage_taken = max(minDamage, incoming_power - effective_shield) */
export function computeDamage(attacker: BattleStats, defender: BattleStats, rules: CombatRules): number {
  return Math.max(rules.minDamage, attacker.power - defender.shield);
}

/** Arena units per tick. */
export function computeMoveSpeed(stats: BattleStats, rules: CombatRules): number {
  return rules.baseMoveSpeed + Math.floor(stats.speed / Math.max(1, rules.speedPerMoveUnit));
}

export function computeAttackCooldown(stats: BattleStats, rules: CombatRules): number {
  return Math.max(rules.minCooldownTicks, rules.baseCooldownTicks - stats.speed * rules.cooldownPerSpeed);
}

export function computeBlockCharges(stats: BattleStats, rules: CombatRules): number {
  return Math.floor(stats.block / Math.max(1, rules.blockChargeDivisor));
}
