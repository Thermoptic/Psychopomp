// Real-time combat as a deterministic fixed-tick simulation. One COMBAT_TICK
// command advances one tick with both players' inputs. Integer maths only, so
// the same inputs always give the same result on every platform.

import type {
  BattleBuild,
  BattleOutcome,
  BattleSide,
  BoardDef,
  Cell,
  CombatRules,
  CombatState,
  CreatureState,
  Fighter,
  FighterInput,
  GameEvent,
  PlayerId,
} from '../types';
import { computeAttackCooldown, computeBlockCharges, computeDamage, computeMoveSpeed } from './stats';

/**
 * Board cell where a player's combatant starts: the centre cell of the left
 * edge for P1, of the right edge for P2 (on 9×9: x 0 / 8, y 4).
 */
export function combatSpawnCell(board: Pick<BoardDef, 'width' | 'height'>, owner: PlayerId): Cell {
  return { x: owner === 'P1' ? 0 : board.width - 1, y: Math.floor((board.height - 1) / 2) };
}

/** Centre of a board cell in combat units. */
export function cellCentre(cell: Cell, rules: CombatRules): Cell {
  const half = Math.floor(rules.cellUnits / 2);
  return { x: cell.x * rules.cellUnits + half, y: cell.y * rules.cellUnits + half };
}

function createFighter(
  side: BattleSide,
  creature: CreatureState,
  maxHp: number,
  build: BattleBuild,
  rules: CombatRules,
  board: Pick<BoardDef, 'width' | 'height'>,
): Fighter {
  const spawn = cellCentre(combatSpawnCell(board, creature.owner), rules);
  return {
    creatureId: creature.id,
    side,
    x: spawn.x,
    y: spawn.y,
    facing: creature.owner === 'P1' ? 1 : -1,
    // Persistent HP: the fight starts with the creature's *current* HP.
    hp: creature.hp,
    maxHp,
    stats: { ...build.stats },
    moveSpeed: computeMoveSpeed(build.stats, rules),
    attackCooldownTicks: computeAttackCooldown(build.stats, rules),
    cooldown: 0,
    windup: 0,
    guard: 0,
    blockCharges: computeBlockCharges(build.stats, rules),
  };
}

export function createCombat(
  attacker: { creature: CreatureState; maxHp: number; build: BattleBuild },
  defender: { creature: CreatureState; maxHp: number; build: BattleBuild },
  rules: CombatRules,
  board: Pick<BoardDef, 'width' | 'height'>,
): CombatState {
  return {
    tick: 0,
    arena: { width: board.width * rules.cellUnits, height: board.height * rules.cellUnits },
    fighters: {
      attacker: createFighter('attacker', attacker.creature, attacker.maxHp, attacker.build, rules, board),
      defender: createFighter('defender', defender.creature, defender.maxHp, defender.build, rules, board),
    },
  };
}

export function distanceSq(a: Fighter, b: Fighter): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

export function inAttackRange(a: Fighter, b: Fighter, rules: CombatRules): boolean {
  return distanceSq(a, b) <= rules.attackRange * rules.attackRange;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function move(f: Fighter, other: Fighter, input: FighterInput, rules: CombatRules, arena: CombatState['arena']): void {
  if (input.dx === 0 && input.dy === 0) return;
  // Diagonal movement is scaled to ~0.7 so it is not faster than straight.
  const speed = input.dx !== 0 && input.dy !== 0 ? Math.floor((f.moveSpeed * 7) / 10) : f.moveSpeed;
  const r = rules.fighterRadius;
  const minDistSq = 4 * r * r;

  const nx = clamp(f.x + input.dx * speed, r, arena.width - r);
  if (nx !== f.x) {
    const dx = nx - other.x;
    const dy = f.y - other.y;
    if (dx * dx + dy * dy >= minDistSq) f.x = nx;
  }
  const ny = clamp(f.y + input.dy * speed, r, arena.height - r);
  if (ny !== f.y) {
    const dx = f.x - other.x;
    const dy = ny - other.y;
    if (dx * dx + dy * dy >= minDistSq) f.y = ny;
  }
}

/**
 * Advances combat by one tick. Mutates `combat`. Returns the outcome when the
 * fight ends this tick, otherwise null.
 */
export function stepCombat(
  combat: CombatState,
  inputs: Record<BattleSide, FighterInput>,
  rules: CombatRules,
  events: GameEvent[],
): BattleOutcome | null {
  combat.tick++;
  const a = combat.fighters.attacker;
  const d = combat.fighters.defender;
  const pairs: Array<[Fighter, Fighter]> = [
    [a, d],
    [d, a],
  ];

  for (const [f] of pairs) {
    if (f.cooldown > 0) f.cooldown--;
    if (f.guard > 0) f.guard--;
  }

  for (const [f, other] of pairs) {
    const input = inputs[f.side];
    const busy = f.windup > 0 || f.guard > 0;
    if (input.block && !busy && f.blockCharges > 0) {
      f.blockCharges--;
      f.guard = rules.guardTicks;
      events.push({ type: 'GUARD', side: f.side });
    } else if (input.attack && !busy && f.cooldown === 0) {
      f.windup = rules.windupTicks;
      f.cooldown = f.attackCooldownTicks;
      events.push({ type: 'ATTACK_STARTED', side: f.side });
    }
    if (f.windup === 0 && f.guard === 0) move(f, other, input, rules, combat.arena);
  }

  a.facing = d.x >= a.x ? 1 : -1;
  d.facing = a.x >= d.x ? 1 : -1;

  // Resolve wind-ups. Damage is applied after both are evaluated so that two
  // hits landing on the same tick can kill both fighters (simultaneous death).
  const damage: Record<BattleSide, number> = { attacker: 0, defender: 0 };
  for (const [f, other] of pairs) {
    if (f.windup === 0) continue;
    f.windup--;
    if (f.windup > 0) continue;
    if (!inAttackRange(f, other, rules)) continue;
    if (other.guard > 0) {
      events.push({ type: 'BLOCKED', side: other.side });
      continue;
    }
    const dmg = computeDamage(f.stats, other.stats, rules);
    damage[other.side] += dmg;
    events.push({ type: 'HIT', side: f.side, damage: dmg });
  }
  a.hp = Math.max(0, a.hp - damage.attacker);
  d.hp = Math.max(0, d.hp - damage.defender);

  const aDead = a.hp <= 0;
  const dDead = d.hp <= 0;
  if (aDead && dDead) return 'DRAW';
  if (dDead) return 'ATTACKER_WINS';
  if (aDead) return 'DEFENDER_WINS';
  if (rules.timeoutTicks > 0 && combat.tick >= rules.timeoutTicks) return 'TIMEOUT';
  return null;
}
