// Battle state machine:
//
//   dice (both players prepare simultaneously) -> countdown -> combat -> result
//
// Each player has an independent DicePrep (roll -> allocate -> done/READY).
// One player's state never blocks the other's. The countdown is entered only
// from the CONFIRM_ALLOCATION that makes the *second* player READY, so it can
// start exactly once; after that no dice command is accepted.
//
// Leaving `result` (END_BATTLE) writes the fighters' remaining HP back to the
// board creatures. This is the persistent-HP rule: nothing heals them.

import { rule } from '../errors';
import { createCombat, stepCombat } from '../combat/simulation';
import { computeBuild } from '../combat/stats';
import { createDicePrep, roll } from '../dice/dice';
import type { BattleSide, BattleState, Cell, DicePrep, FighterInput, GameEvent, GameState, PlayerId } from '../types';
import { BATTLE_SIDES } from '../types';

export function startBattle(
  state: GameState,
  attackerId: string,
  defenderId: string,
  from: Cell,
  cell: Cell,
  events: GameEvent[],
): BattleState {
  const attacker = state.creatures[attackerId];
  const defender = state.creatures[defenderId];
  const battle: BattleState = {
    attackerId,
    defenderId,
    from: { x: from.x, y: from.y },
    cell: { x: cell.x, y: cell.y },
    stage: 'dice',
    prep: {
      attacker: createDicePrep(attackerId, attacker.owner, state.creatureDefs[attacker.defId], state.ruleset),
      defender: createDicePrep(defenderId, defender.owner, state.creatureDefs[defender.defId], state.ruleset),
    },
    builds: null,
    countdown: 0,
    combat: null,
    result: null,
  };
  state.battle = battle;
  state.phase = 'battle';
  // Both players receive their dice when preparation starts (fixed order for determinism).
  for (const side of BATTLE_SIDES) {
    const prep = battle.prep[side];
    events.push({ type: 'DICE_ROLLED', player: prep.player, values: roll(prep, state.rng) });
  }
  return battle;
}

/** The given player's DicePrep while preparation is open, else null. */
export function prepFor(state: GameState, player: PlayerId): DicePrep | null {
  const b = state.battle;
  if (!b || b.stage !== 'dice') return null;
  return BATTLE_SIDES.map((side) => b.prep[side]).find((p) => p.player === player) ?? null;
}

/** For dice commands: the player's own prep, still editable (not READY). */
export function requirePrep(state: GameState, player: PlayerId): DicePrep {
  rule(player === 'P1' || player === 'P2', 'Dice commands must name the player');
  rule(state.battle && state.battle.stage === 'dice', 'No dice preparation in progress');
  const prep = prepFor(state, player);
  rule(prep, `${player} is not in this battle`);
  rule(prep.stage !== 'done', `${player} is READY - the build is locked`);
  return prep;
}

export function isReady(prep: DicePrep): boolean {
  return prep.stage === 'done';
}

/**
 * Called after a player pressed APPLY. Starts the countdown only when both
 * players are READY and preparation is still open (so at most once).
 */
export function onPlayerReady(state: GameState, events: GameEvent[]): void {
  const b = state.battle!;
  if (b.stage !== 'dice' || !BATTLE_SIDES.every((side) => isReady(b.prep[side]))) return;
  const builds = {} as Record<BattleSide, ReturnType<typeof computeBuild>>;
  for (const side of BATTLE_SIDES) {
    const prep = b.prep[side];
    builds[side] = computeBuild(state.creatureDefs[state.creatures[prep.creatureId].defId], prep);
  }
  b.builds = builds;
  events.push({ type: 'BUILDS_REVEALED' });
  for (const side of BATTLE_SIDES) {
    const build = builds[side];
    if (build.specialActive && build.specialName) {
      events.push({ type: 'SPECIAL_ACTIVATED', creatureId: build.creatureId, name: build.specialName });
    }
  }
  b.stage = 'countdown';
  b.countdown = state.ruleset.combat.countdownTicks;
  events.push({ type: 'COUNTDOWN_STARTED', ticks: b.countdown });
  if (b.countdown <= 0) beginCombat(state, events);
}

function beginCombat(state: GameState, events: GameEvent[]): void {
  const b = state.battle!;
  const fighter = (id: string, side: BattleSide) => {
    const creature = state.creatures[id];
    return { creature, maxHp: state.creatureDefs[creature.defId].stats.maxHp, build: b.builds![side] };
  };
  b.combat = createCombat(fighter(b.attackerId, 'attacker'), fighter(b.defenderId, 'defender'), state.ruleset.combat, state.board);
  b.countdown = 0;
  b.stage = 'combat';
  events.push({ type: 'COMBAT_STARTED' });
}

export function combatTick(state: GameState, inputs: Record<BattleSide, FighterInput>, events: GameEvent[]): void {
  const b = state.battle;
  rule(b && (b.stage === 'countdown' || b.stage === 'combat'), 'No combat in progress');
  if (b.stage === 'countdown') {
    // Inputs are ignored while counting down; nothing can change the builds.
    b.countdown--;
    if (b.countdown <= 0) beginCombat(state, events);
    return;
  }
  const outcome = stepCombat(b.combat!, inputs, state.ruleset.combat, events);
  if (outcome) {
    b.result = {
      outcome,
      attackerHp: b.combat!.fighters.attacker.hp,
      defenderHp: b.combat!.fighters.defender.hp,
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
