import { loadContentPack, type ContentPack } from '../src/content/loader';
import {
  applyCommand,
  createMatch,
  createRng,
  getLegalMoves,
  inAttackRange,
  nextInt,
  type BattleSide,
  type BoardDef,
  type Command,
  type CreatureDef,
  type FighterInput,
  type GameState,
  type Placement,
  type RngState,
} from '../src/core';
import { bundledPackFiles } from '../src/platform/web/bundledContent';

export function basePack(): ContentPack {
  const r = loadContentPack(bundledPackFiles().base);
  if (!r.ok) throw new Error(r.errors.join('\n'));
  return r.pack;
}

export function newMatch(seed = 1234): GameState {
  const pack = basePack();
  return createMatch({ ruleset: pack.ruleset, board: pack.boards[0], creatures: pack.creatures, seed });
}

/** A creature def with overridable stats (defaults: Glubber-like, no Special). */
export function testCreature(id: string, over: Partial<CreatureDef['stats']> = {}, extra: Partial<CreatureDef> = {}): CreatureDef {
  return {
    id,
    name: id.toUpperCase(),
    art: {},
    stats: { maxHp: 20, movement: 3, power: 10, speed: 5, shield: 4, ...over },
    dice: { slots: { speed: 1, power: 1, shield: 1, special: 1, block: 1 } },
    special: null,
    ...extra,
  };
}

export interface CustomMatch {
  width?: number;
  height?: number;
  placements: Placement[];
  powerPoints?: BoardDef['powerPoints'];
  creatures: CreatureDef[];
  seed?: number;
  allowDiagonal?: boolean;
  blockedCells?: BoardDef['blockedCells'];
}

export function customMatch(c: CustomMatch): GameState {
  const pack = basePack();
  return createMatch({
    ruleset: pack.ruleset,
    creatures: c.creatures,
    seed: c.seed ?? 1,
    board: {
      id: 'test',
      name: 'Test',
      width: c.width ?? 5,
      height: c.height ?? 5,
      allowDiagonal: c.allowDiagonal ?? false,
      passThroughCreatures: false,
      blockedCells: c.blockedCells ?? [],
      powerPoints: c.powerPoints ?? [
        { x: 0, y: 4 },
        { x: 4, y: 4 },
      ],
      placements: c.placements,
    },
  });
}

/** Applies a command and fails the test on error. */
export function ok(state: GameState, cmd: Command): GameState {
  const r = applyCommand(state, cmd);
  if (r.error) throw new Error(`${cmd.type} rejected: ${r.error}`);
  return r.state;
}

/** Rolls once, keeps the dice and places die i in slot i. */
export function quickPrepare(state: GameState): GameState {
  let s = ok(state, { type: 'ROLL_DICE' });
  s = ok(s, { type: 'FINISH_ROLLING' });
  const prep = s.battle!.prep[s.battle!.preparing!];
  for (let i = 0; i < prep.slots.length; i++) s = ok(s, { type: 'ALLOCATE_DIE', die: i, slot: i });
  return ok(s, { type: 'CONFIRM_ALLOCATION' });
}

/** Both sides quick-prepare, then combat begins. */
export function prepareBothAndBegin(state: GameState): GameState {
  let s = quickPrepare(state);
  s = quickPrepare(s);
  return ok(s, { type: 'BEGIN_COMBAT' });
}

const idle: FighterInput = { dx: 0, dy: 0, attack: false, block: false };

/** Simple AI: walk towards the opponent, attack when in range and ready. */
export function chaseInput(state: GameState, side: BattleSide): FighterInput {
  const c = state.battle!.combat!;
  const me = c.fighters[side];
  const other = c.fighters[side === 'attacker' ? 'defender' : 'attacker'];
  if (inAttackRange(me, other, state.ruleset.combat)) {
    return { ...idle, attack: me.cooldown === 0 && me.windup === 0 };
  }
  return { ...idle, dx: Math.sign(other.x - me.x) as -1 | 0 | 1, dy: Math.sign(other.y - me.y) as -1 | 0 | 1 };
}

export function tick(state: GameState, attacker: FighterInput = idle, defender: FighterInput = idle): GameState {
  return ok(state, { type: 'COMBAT_TICK', inputs: { attacker, defender } });
}

/** Both fighters chase and attack until the battle has a result. */
export function fightToResult(state: GameState, maxTicks = 20000): GameState {
  let s = state;
  for (let i = 0; i < maxTicks && s.battle?.stage === 'combat'; i++) {
    s = tick(s, chaseInput(s, 'attacker'), chaseInput(s, 'defender'));
  }
  return s;
}

/**
 * A deterministic bot that picks the next command for whatever the game is
 * waiting on. Used for full-match and determinism tests.
 */
export function botCommand(state: GameState, rng: RngState): Command {
  if (state.phase === 'board') {
    const mine = Object.values(state.creatures).filter((c) => c.alive && c.owner === state.currentTurn.player);
    const enemies = Object.values(state.creatures).filter((c) => c.alive && c.owner !== state.currentTurn.player);
    type Option = { creatureId: string; x: number; y: number; score: number };
    const options: Option[] = [];
    for (const c of mine) {
      for (const m of getLegalMoves(state, c.id)) {
        const pp = state.powerPoints.find((p) => p.x === m.x && p.y === m.y);
        const nearest = Math.min(...enemies.map((e) => Math.abs(e.x - m.x) + Math.abs(e.y - m.y)));
        let score = -nearest;
        if (m.attacks) score += 100;
        if (pp && pp.owner !== state.currentTurn.player) score += 50;
        options.push({ creatureId: c.id, x: m.x, y: m.y, score });
      }
    }
    if (options.length === 0) return { type: 'PASS_TURN' };
    const best = Math.max(...options.map((o) => o.score));
    const top = options.filter((o) => o.score === best);
    const pick = top[nextInt(rng, 0, top.length - 1)];
    return { type: 'MOVE_CREATURE', creatureId: pick.creatureId, to: { x: pick.x, y: pick.y } };
  }

  const b = state.battle!;
  if (b.stage === 'dice') {
    const prep = b.prep[b.preparing!];
    if (prep.stage === 'roll') {
      if (prep.rollsUsed === 0) return { type: 'ROLL_DICE' };
      // Keep 5s and 6s, reroll the rest once.
      const lowUnlocked = prep.dice.findIndex((v, i) => v < 5 && !prep.locked[i]);
      const highUnlocked = prep.dice.findIndex((v, i) => v >= 5 && !prep.locked[i]);
      if (highUnlocked >= 0) return { type: 'LOCK_DIE', die: highUnlocked };
      if (prep.rollsUsed === 1 && lowUnlocked >= 0) return { type: 'REROLL' };
      return { type: 'FINISH_ROLLING' };
    }
    const emptySlot = prep.slotDice.indexOf(null);
    if (emptySlot >= 0) {
      const die = prep.dice.findIndex((_, i) => !prep.slotDice.includes(i));
      return { type: 'ALLOCATE_DIE', die, slot: emptySlot };
    }
    return { type: 'CONFIRM_ALLOCATION' };
  }
  if (b.stage === 'reveal') return { type: 'BEGIN_COMBAT' };
  if (b.stage === 'combat') {
    return { type: 'COMBAT_TICK', inputs: { attacker: chaseInput(state, 'attacker'), defender: chaseInput(state, 'defender') } };
  }
  return { type: 'END_BATTLE' };
}

/** Plays a whole match with bots. Returns final state and the command log. */
export function playBotMatch(seed: number, botSeed = 99, maxCommands = 200000) {
  let state = newMatch(seed);
  const rng = createRng(botSeed);
  const log: Command[] = [];
  for (let i = 0; i < maxCommands && state.matchResult === 'ONGOING'; i++) {
    const cmd = botCommand(state, rng);
    log.push(cmd);
    state = ok(state, cmd);
  }
  return { state, log };
}
