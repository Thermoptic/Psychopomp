// The one entry point that changes game state.
//
//   applyCommand(state, command) -> { state, events, error? }
//
// The input state is never mutated: the command runs against a clone. An
// illegal command returns the *original* state object plus an error message,
// so an illegal action can never have a gameplay effect.

import { advancePreparation, beginCombat, combatTick, endBattle, requireActivePrep, startBattle } from '../battle/battle';
import { findLegalMove, getMovableCreatures } from '../board/movement';
import { updatePowerPoints } from '../board/powerPoints';
import { otherPlayer } from '../board/queries';
import { allocate, confirmAllocation, finishRolling, roll, setLocked, unallocate } from '../dice/dice';
import { RuleError, rule } from '../errors';
import { evaluateVictory } from '../rules/victory';
import type { Command, GameEvent, GameState } from '../types';

export interface CommandResult {
  state: GameState;
  events: GameEvent[];
  error?: string;
}

export function applyCommand(state: GameState, command: Command): CommandResult {
  const draft = structuredClone(state);
  const events: GameEvent[] = [];
  try {
    rule(draft.matchResult === 'ONGOING', 'The match is over');
    execute(draft, command, events);
    return { state: draft, events };
  } catch (e) {
    if (e instanceof RuleError) return { state, events: [], error: e.message };
    throw e;
  }
}

/** Applies a list of commands; stops at (and reports) the first illegal one. */
export function applyCommands(state: GameState, commands: Command[]): CommandResult {
  const events: GameEvent[] = [];
  let current = state;
  for (const cmd of commands) {
    const r = applyCommand(current, cmd);
    if (r.error) return { state: current, events, error: `${cmd.type}: ${r.error}` };
    current = r.state;
    events.push(...r.events);
  }
  return { state: current, events };
}

function execute(s: GameState, cmd: Command, events: GameEvent[]): void {
  switch (cmd.type) {
    case 'MOVE_CREATURE': {
      rule(s.phase === 'board', 'Creatures can only move on the board');
      const cr = s.creatures[cmd.creatureId];
      rule(cr && cr.alive, 'No such creature');
      rule(cr.owner === s.currentTurn.player, 'Not your creature');
      rule(cmd.player === undefined || cmd.player === s.currentTurn.player, 'Not your turn');
      const move = findLegalMove(s, cr.id, cmd.to);
      rule(move, 'Illegal move');
      if (move.attacks) {
        events.push({ type: 'BATTLE_STARTED', attackerId: cr.id, defenderId: move.attacks });
        startBattle(s, cr.id, move.attacks, { x: cr.x, y: cr.y }, cmd.to);
        return;
      }
      events.push({ type: 'CREATURE_MOVED', creatureId: cr.id, from: { x: cr.x, y: cr.y }, to: { ...cmd.to } });
      cr.x = cmd.to.x;
      cr.y = cmd.to.y;
      finishTurn(s, events);
      return;
    }
    case 'PASS_TURN': {
      rule(s.phase === 'board', 'Can only pass on the board');
      rule(cmd.player === undefined || cmd.player === s.currentTurn.player, 'Not your turn');
      rule(getMovableCreatures(s).length === 0, 'You have a legal move');
      finishTurn(s, events);
      return;
    }
    case 'ROLL_DICE':
    case 'REROLL': {
      const prep = requireActivePrep(s, cmd.player);
      if (cmd.type === 'REROLL') rule(prep.rollsUsed > 0, 'Roll the dice first');
      const values = roll(prep, s.rng);
      events.push({ type: 'DICE_ROLLED', player: prep.player, values });
      return;
    }
    case 'LOCK_DIE':
    case 'UNLOCK_DIE': {
      const prep = requireActivePrep(s, cmd.player);
      const locked = cmd.type === 'LOCK_DIE';
      setLocked(prep, cmd.die, locked);
      events.push({ type: 'DIE_LOCK_CHANGED', player: prep.player, die: cmd.die, locked });
      return;
    }
    case 'FINISH_ROLLING': {
      finishRolling(requireActivePrep(s, cmd.player));
      return;
    }
    case 'ALLOCATE_DIE': {
      const prep = requireActivePrep(s, cmd.player);
      allocate(prep, cmd.die, cmd.slot);
      events.push({ type: 'DIE_ALLOCATED', player: prep.player, die: cmd.die, slot: cmd.slot });
      return;
    }
    case 'UNALLOCATE_DIE': {
      unallocate(requireActivePrep(s, cmd.player), cmd.slot);
      return;
    }
    case 'CONFIRM_ALLOCATION': {
      const prep = requireActivePrep(s, cmd.player);
      confirmAllocation(prep);
      events.push({ type: 'ALLOCATION_CONFIRMED', player: prep.player });
      advancePreparation(s, events);
      return;
    }
    case 'BEGIN_COMBAT': {
      beginCombat(s, events);
      return;
    }
    case 'COMBAT_TICK': {
      combatTick(s, cmd.inputs, events);
      return;
    }
    case 'END_BATTLE': {
      endBattle(s, events);
      finishTurn(s, events);
      return;
    }
  }
}

/** Power Points, victory check, then hand the turn to the other player. */
function finishTurn(s: GameState, events: GameEvent[]): void {
  updatePowerPoints(s, events);
  const v = evaluateVictory(s);
  if (v.result !== 'ONGOING') {
    s.matchResult = v.result;
    s.victoryReason = v.reason;
    s.phase = 'gameOver';
    events.push({ type: 'MATCH_ENDED', result: v.result });
    return;
  }
  s.currentTurn = { player: otherPlayer(s.currentTurn.player), number: s.currentTurn.number + 1 };
  events.push({ type: 'TURN_STARTED', player: s.currentTurn.player, number: s.currentTurn.number });
}
