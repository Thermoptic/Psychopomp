// Public surface of the portable game core.
export * from './types';
export { createRng, nextInt, nextFloat, rollDie } from './rng';
export { RuleError } from './errors';
export { createMatch, type MatchSetup } from './state/createMatch';
export { applyCommand, applyCommands, type CommandResult } from './state/applyCommand';
export { getLegalMoves, findLegalMove, getMovableCreatures, type LegalMove } from './board/movement';
export { creatureAt, livingCreatures, powerPointAt, otherPlayer } from './board/queries';
export { evaluateVictory } from './rules/victory';
export { activePrep } from './battle/battle';
export {
  buildSlots,
  categoryOrder,
  diceView,
  isAllocated,
  rerollsRemaining,
  validateAllocation,
} from './dice/dice';
export { evaluateRequirement, describeRequirement, REQUIREMENT_TYPES, type DiceView } from './dice/requirements';
export {
  computeBuild,
  computeDamage,
  computeMoveSpeed,
  computeAttackCooldown,
  computeBlockCharges,
  baseBattleStats,
} from './combat/stats';
export { inAttackRange, combatSpawnCell, cellCentre } from './combat/simulation';
