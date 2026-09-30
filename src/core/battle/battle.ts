// Battle state machine:
//
//   dice (attacker prepares -> defender prepares) -> reveal -> combat -> result
//
// Leaving `result` (END_BATTLE) writes the fighters' remaining HP back to the
// board creatures. This is the persistent-HP rule: nothing heals them.

import { rule } from '../errors';
import { createCombat, stepCombat } from '../combat/simulation';
import { computeBuild } from '../combat/stats';
import { createDicePrep } from '../dice/dice';
import type { BattleSide, BattleState, Cell, DicePrep, FighterInput, GameEvent, GameState, PlayerId } from '../types';

export function startBattle(state: GameState, attackerId: string, defenderId: string, from: Cell, cell: Cell): BattleState {
  const attacker = state.creatures[attackerId];
  const defender = state.creatures[defenderId];
  const battle: BattleState = {
    attackerId,
    defenderId,
    from: { x: from.x, y: from.y },
    cell: { x: cell.x, y: cell.y },
    stage: 'dice',
    preparing: 'attacker',
    prep: {
      attacker: createDicePrep(attackerId, attacker.owner, state.creatureDefs[attacker.defId], state.ruleset),
      defender: createDicePrep(defenderId, defender.owner, state.creatureDefs[defender.defId], state.ruleset),
    },
    builds: null,
    combat: null,
    result: null,
  };
  state.battle = battle;
  state.phase = 'battle';
  return battle;
}

/** The DicePrep that dice commands currently apply to. */
export function activePrep(state: GameState): DicePrep | null {
  const b = state.battle;
  if (!b || b.stage !== 'dice' || !b.preparing) return null;
  return b.prep[b.preparing];
}

export function requireActivePrep(state: GameState, player: PlayerId | undefined): DicePrep {
  const prep = activePrep(state);
  rule(prep, 'No dice preparation in progress');
  rule(player === undefined || player === prep.player, `It is ${prep.player}'s dice phase`);
  return prep;
}

/** Called after the preparing side confirmed its allocation. */
export function advancePreparation(state: GameState, events: GameEvent[]): void {
  const b = state.battle!;
  if (b.preparing === 'attacker') {
    b.preparing = 'defender';
    return;
  }
  b.preparing = null;
  const sides: BattleSide[] = ['attacker', 'defender'];
  const builds = {} as BattleState['builds'] & object;
  for (const side of sides) {
    const prep = b.prep[side];
    const cr = state.creatures[prep.creatureId];
    const build = computeBuild(state.creatureDefs[cr.defId], prep);
    builds[side] = build;
  }
  b.builds = builds;
  b.stage = 'reveal';
  events.push({ type: 'BUILDS_REVEALED' });
  for (const side of sides) {
    const build = builds[side];
    if (build.specialActive && build.specialName) {
      events.push({ type: 'SPECIAL_ACTIVATED', creatureId: build.creatureId, name: build.specialName });
    }
  }
}

export function beginCombat(state: GameState, events: GameEvent[]): void {
  const b = state.battle;
  rule(b && b.stage === 'reveal' && b.builds, 'Builds are not revealed yet');
  const fighter = (id: string, side: BattleSide) => {
    const creature = state.creatures[id];
    return { creature, maxHp: state.creatureDefs[creature.defId].stats.maxHp, build: b.builds![side] };
  };
  b.combat = createCombat(fighter(b.attackerId, 'attacker'), fighter(b.defenderId, 'defender'), state.ruleset.combat);
  b.stage = 'combat';
  events.push({ type: 'COMBAT_STARTED' });
}

export function combatTick(state: GameState, inputs: Record<BattleSide, FighterInput>, events: GameEvent[]): void {
  const b = state.battle;
  rule(b && b.stage === 'combat' && b.combat, 'No combat in progress');
  const outcome = stepCombat(b.combat, inputs, state.ruleset.combat, events);
  if (outcome) {
    b.result = {
      outcome,
      attackerHp: b.combat.fighters.attacker.hp,
      defenderHp: b.combat.fighters.defender.hp,
    };
    b.stage = 'result';
    events.push({ type: 'COMBAT_ENDED', outcome });
  }
}

/**
 * Applies the battle result to the board: remaining HP persists, the dead are
 * removed, a winning attacker takes the contested cell, a losing or withdrawn
 * attacker never left its origin cell.
 */
export function endBattle(state: GameState, events: GameEvent[]): void {
  const b = state.battle;
  rule(b && b.stage === 'result' && b.result, 'Battle has not finished');
  const attacker = state.creatures[b.attackerId];
  const defender = state.creatures[b.defenderId];

  attacker.hp = b.result.attackerHp;
  defender.hp = b.result.defenderHp;

  for (const cr of [attacker, defender]) {
    if (cr.hp <= 0) {
      cr.hp = 0;
      cr.alive = false;
      events.push({ type: 'CREATURE_DIED', creatureId: cr.id });
    }
  }

  if (b.result.outcome === 'ATTACKER_WINS') {
    events.push({ type: 'CREATURE_MOVED', creatureId: attacker.id, from: { ...b.from }, to: { ...b.cell } });
    attacker.x = b.cell.x;
    attacker.y = b.cell.y;
  }

  state.battle = null;
  state.phase = 'board';
}
