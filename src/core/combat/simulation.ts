// Real-time combat as a deterministic fixed-tick simulation. One COMBAT_TICK
// command advances one tick with both players' inputs. Integer maths only, so
// the same inputs always give the same result on every platform.
//
// Controls model (twin-stick):
//   move (dx,dy)   analog movement, -100..100 per axis; also the dash direction
//   aim  (aimX,Y)  aim direction; 0,0 keeps the last aim
//   attack         a swing in the aim direction (hits inside a cone)
//   attackHeld     keeps attacking for creatures with autoFire
//   dash           quick burst along the movement direction, own cooldown
//   special        triggers a 'manual' Special once per battle
//   block          guard (unchanged)

import type {
  BattleBuild,
  BattleOutcome,
  BattleSide,
  Cell,
  CombatRules,
  CombatState,
  CreatureDef,
  CreatureState,
  Fighter,
  FighterInput,
  GameEvent,
  PlayerId,
} from '../types';
import { applyEffect, computeAttackCooldown, computeBlockCharges, computeDamage, computeMoveSpeed } from './stats';

/** The combat arena grid (columns × rows) from the ruleset. */
export function arenaGrid(rules: CombatRules): { width: number; height: number } {
  return { width: rules.arenaColumns, height: rules.arenaRows };
}

/**
 * Grid cell where a player's combatant starts: the vertically centred cell of
 * the leftmost column for P1 and of the rightmost column for P2.
 */
export function combatSpawnCell(grid: { width: number; height: number }, owner: PlayerId): Cell {
  return { x: owner === 'P1' ? 0 : grid.width - 1, y: Math.floor((grid.height - 1) / 2) };
}

/** Centre of a board cell in combat units. */
export function cellCentre(cell: Cell, rules: CombatRules): Cell {
  const half = Math.floor(rules.cellUnits / 2);
  return { x: cell.x * rules.cellUnits + half, y: cell.y * rules.cellUnits + half };
}

/** Exact integer square root (floor), independent of floating-point sqrt quirks. */
export function isqrt(n: number): number {
  if (n < 2) return Math.max(0, n);
  let x = Math.floor(Math.sqrt(n));
  while (x * x > n) x--;
  while ((x + 1) * (x + 1) <= n) x++;
  return x;
}

const clampAxis = (v: number | undefined) => (v === undefined ? 0 : Math.max(-100, Math.min(100, Math.trunc(v))));

/** Dash settings for a creature: its own `dash` data over the ruleset default. */
export function resolveDash(def: CreatureDef, rules: CombatRules) {
  const d = { ...rules.dash, ...(def.dash ?? {}) };
  const total = Math.round(d.distance * rules.cellUnits);
  return {
    cooldownTicks: Math.max(0, Math.round(d.cooldown * rules.tickRate)),
    step: Math.max(1, Math.round(total / Math.max(1, rules.dash.durationTicks))),
    damage: d.damage,
    dealsDamage: d.dealsDamage,
  };
}

function createFighter(side: BattleSide, creature: CreatureState, def: CreatureDef, build: BattleBuild, rules: CombatRules): Fighter {
  const spawn = cellCentre(combatSpawnCell(arenaGrid(rules), creature.owner), rules);
  const dash = resolveDash(def, rules);
  const facing = creature.owner === 'P1' ? 1 : -1;
  return {
    creatureId: creature.id,
    side,
    x: spawn.x,
    y: spawn.y,
    facing,
    // Persistent HP: the fight starts with the creature's *current* HP.
    hp: creature.hp,
    maxHp: def.stats.maxHp,
    stats: { ...build.stats },
    moveSpeed: computeMoveSpeed(build.stats, rules),
    attackCooldownTicks: computeAttackCooldown(build.stats, rules),
    cooldown: 0,
    windup: 0,
    guard: 0,
    blockCharges: computeBlockCharges(build.stats, rules),
    // Initial aim: towards the opponent's side.
    aim: { x: 100 * facing, y: 0 },
    swingAim: { x: 100 * facing, y: 0 },
    autoFire: def.attack?.autoFire === true,
    dashTicks: 0,
    dashDir: { x: 0, y: 0 },
    dashStep: dash.step,
    dashCooldown: 0,
    dashCooldownTicks: dash.cooldownTicks,
    dashDamage: dash.damage,
    dashDealsDamage: dash.dealsDamage,
    dashHit: false,
    special: !build.specialName || !build.specialActive ? 'none' : build.specialManual ? 'ready' : 'passive',
  };
}

export interface CombatantSetup {
  creature: CreatureState;
  def: CreatureDef;
  build: BattleBuild;
}

export function createCombat(attacker: CombatantSetup, defender: CombatantSetup, rules: CombatRules): CombatState {
  const grid = arenaGrid(rules);
  return {
    tick: 0,
    arena: { width: grid.width * rules.cellUnits, height: grid.height * rules.cellUnits },
    fighters: {
      attacker: createFighter('attacker', attacker.creature, attacker.def, attacker.build, rules),
      defender: createFighter('defender', defender.creature, defender.def, defender.build, rules),
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

/**
 * Is `target` inside the attack cone around `aim`? `coneCos` is cos(half-angle)
 * in percent. Exact integer comparison (values stay far below 2^53).
 */
export function inAimCone(from: { x: number; y: number }, target: { x: number; y: number }, aim: { x: number; y: number }, coneCos: number): boolean {
  if (coneCos <= -100) return true;
  const tx = target.x - from.x;
  const ty = target.y - from.y;
  const t2 = tx * tx + ty * ty;
  const a2 = aim.x * aim.x + aim.y * aim.y;
  if (t2 === 0 || a2 === 0) return true;
  const dot = tx * aim.x + ty * aim.y;
  const lhs = dot * dot * 10000;
  const rhs = coneCos * coneCos * t2 * a2;
  if (coneCos >= 0) return dot >= 0 && lhs >= rhs;
  return dot >= 0 || lhs <= rhs;
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

/**
 * Moves by (sx, sy) per axis, stopping at the arena edge and at the opponent.
 * Returns true if the opponent blocked the movement.
 */
function tryMove(f: Fighter, other: Fighter, sx: number, sy: number, rules: CombatRules, arena: CombatState['arena']): boolean {
  const r = rules.fighterRadius;
  const minDistSq = 4 * r * r;
  let blocked = false;
  const nx = clamp(f.x + sx, r, arena.width - r);
  if (nx !== f.x) {
    const dx = nx - other.x;
    const dy = f.y - other.y;
    if (dx * dx + dy * dy >= minDistSq) f.x = nx;
    else blocked = true;
  }
  const ny = clamp(f.y + sy, r, arena.height - r);
  if (ny !== f.y) {
    const dx = f.x - other.x;
    const dy = ny - other.y;
    if (dx * dx + dy * dy >= minDistSq) f.y = ny;
    else blocked = true;
  }
  return blocked;
}

/**
 * Where a step of (sx, sy) would end up, clamped to the arena (opponent ignored).
 * Used to detect a dash that would only push into a wall.
 */
function clampedProgress(f: Fighter, sx: number, sy: number, rules: CombatRules, arena: CombatState['arena']): number {
  const r = rules.fighterRadius;
  const nx = clamp(f.x + sx, r, arena.width - r);
  const ny = clamp(f.y + sy, r, arena.height - r);
  return isqrt((nx - f.x) * (nx - f.x) + (ny - f.y) * (ny - f.y));
}

/** Splits `length` along the direction (x, y) into integer axis steps. */
function along(x: number, y: number, length: number): { sx: number; sy: number } {
  const len = isqrt(x * x + y * y);
  if (len === 0) return { sx: 0, sy: 0 };
  return { sx: Math.trunc((length * x) / len), sy: Math.trunc((length * y) / len) };
}

/**
 * Analog movement: direction from the stick, speed scaled by how far it is
 * pushed (full deflection = moveSpeed; a full diagonal is not faster).
 */
function move(f: Fighter, other: Fighter, input: FighterInput, rules: CombatRules, arena: CombatState['arena']): void {
  const x = clampAxis(input.dx);
  const y = clampAxis(input.dy);
  if (x === 0 && y === 0) return;
  const len = isqrt(x * x + y * y);
  const mag = Math.min(100, len);
  const sx = Math.trunc((f.moveSpeed * x * mag) / (len * 100));
  const sy = Math.trunc((f.moveSpeed * y * mag) / (len * 100));
  tryMove(f, other, sx, sy, rules, arena);
}

/** Applies a 'manual' Special's effect to the fighter (once). */
function triggerSpecial(f: Fighter, def: CreatureDef, rules: CombatRules): void {
  if (!def.special) return;
  const before = computeBlockCharges(f.stats, rules);
  applyEffect(f.stats, def.special.effect);
  for (const k of ['power', 'shield', 'speed', 'block'] as const) f.stats[k] = Math.max(0, f.stats[k]);
  f.moveSpeed = computeMoveSpeed(f.stats, rules);
  f.attackCooldownTicks = computeAttackCooldown(f.stats, rules);
  f.blockCharges = Math.max(0, f.blockCharges + computeBlockCharges(f.stats, rules) - before);
  f.special = 'used';
}

/**
 * Advances combat by one tick. Mutates `combat`. Returns the outcome when the
 * fight ends this tick, otherwise null.
 *
 * @param defs creature definitions of the attacker/defender (for Special effects).
 */
export function stepCombat(
  combat: CombatState,
  inputs: Record<BattleSide, FighterInput>,
  rules: CombatRules,
  events: GameEvent[],
  defs?: Record<BattleSide, CreatureDef>,
): BattleOutcome | null {
  combat.tick++;
  const a = combat.fighters.attacker;
  const d = combat.fighters.defender;
  const pairs: Array<[Fighter, Fighter]> = [
    [a, d],
    [d, a],
  ];
  const damage: Record<BattleSide, number> = { attacker: 0, defender: 0 };

  for (const [f] of pairs) {
    if (f.cooldown > 0) f.cooldown--;
    if (f.guard > 0) f.guard--;
    if (f.dashCooldown > 0) f.dashCooldown--;
  }

  for (const [f, other] of pairs) {
    const input = inputs[f.side];

    // Aim: updated by any non-neutral aim input, otherwise kept.
    const ax = clampAxis(input.aimX);
    const ay = clampAxis(input.aimY);
    if (ax !== 0 || ay !== 0) f.aim = { x: ax, y: ay };

    // Special (manual Specials only; instant, once per battle).
    if (input.special && f.special === 'ready' && defs) {
      triggerSpecial(f, defs[f.side], rules);
      events.push({ type: 'SPECIAL_TRIGGERED', side: f.side, name: defs[f.side].special!.name });
    }

    const mx = clampAxis(input.dx);
    const my = clampAxis(input.dy);
    const busy = f.windup > 0 || f.guard > 0 || f.dashTicks > 0;
    const wantsAttack = input.attack || (f.autoFire && input.attackHeld === true);
    if (input.block && !busy && f.blockCharges > 0) {
      f.blockCharges--;
      f.guard = rules.guardTicks;
      events.push({ type: 'GUARD', side: f.side });
    } else if (input.dash && !busy) {
      // Dash along the movement direction. It needs a deliberate stick push and
      // room to move; otherwise nothing happens and no cooldown is spent.
      const first = along(mx, my, f.dashStep);
      if (f.dashCooldown > 0) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'cooldown' });
      } else if (isqrt(mx * mx + my * my) < rules.dash.minInput) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'noDirection' });
      } else if (clampedProgress(f, first.sx, first.sy, rules, combat.arena) * 2 < f.dashStep) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'blocked' });
      } else {
        f.dashDir = { x: mx, y: my };
        f.dashTicks = rules.dash.durationTicks;
        f.dashCooldown = f.dashCooldownTicks;
        f.dashHit = false;
        events.push({ type: 'DASH', side: f.side });
      }
    } else if (wantsAttack && !busy && f.cooldown === 0) {
      f.windup = rules.windupTicks;
      f.cooldown = f.attackCooldownTicks;
      f.swingAim = { ...f.aim };
      events.push({ type: 'ATTACK_STARTED', side: f.side });
    }

    if (f.dashTicks > 0) {
      const { sx, sy } = along(f.dashDir.x, f.dashDir.y, f.dashStep);
      const fromX = f.x;
      const fromY = f.y;
      const blocked = tryMove(f, other, sx, sy, rules, combat.arena);
      f.dashTicks--;
      // Reaching a wall ends the dash instead of standing still in it.
      const moved = isqrt((f.x - fromX) * (f.x - fromX) + (f.y - fromY) * (f.y - fromY));
      if (!blocked && moved * 2 < f.dashStep) f.dashTicks = 0;
      if (blocked) {
        if (f.dashDealsDamage && !f.dashHit && f.dashDamage > 0) {
          f.dashHit = true;
          if (other.guard > 0) events.push({ type: 'BLOCKED', side: other.side });
          else {
            damage[other.side] += f.dashDamage;
            events.push({ type: 'DASH_HIT', side: f.side, damage: f.dashDamage });
          }
        }
        f.dashTicks = 0; // a dash stops when it runs into the opponent
      }
    } else if (f.windup === 0 && f.guard === 0) {
      move(f, other, input, rules, combat.arena);
    }
  }

  // Sprites face the aim direction (horizontal component).
  for (const [f] of pairs) if (f.aim.x !== 0) f.facing = f.aim.x > 0 ? 1 : -1;

  // Resolve wind-ups. Damage is applied after both are evaluated so that two
  // hits landing on the same tick can kill both fighters (simultaneous death).
  for (const [f, other] of pairs) {
    if (f.windup === 0) continue;
    f.windup--;
    if (f.windup > 0) continue;
    if (!inAttackRange(f, other, rules)) continue;
    if (!inAimCone(f, other, f.swingAim, rules.attackConeCos)) continue;
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
