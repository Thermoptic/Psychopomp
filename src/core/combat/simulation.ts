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
  PowerupDef,
  Projectile,
  WallSegment,
} from '../types';
import { CHARGE_MOVE_PERCENT, PROJECTILE_RADIUS, fighterPowerup, ownWeapon, resolveWeapon, smallAngleCosSin } from './powerups';
import { circleHitsWall } from './walls';
import { applyEffect, computeAttackCooldown, computeBlockCharges, computeDamage, computeDashCooldown, computeMoveSpeed } from './stats';

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

/**
 * Dash settings. The distance is fixed (creature `dash.distance` or the
 * ruleset's) and does not depend on the DASH die. The dash value (DASH die +
 * Dash Cooldown Modifier + Special) only sets the cooldown, see
 * computeDashCooldown. No distance = no dash (step 0).
 */
export function resolveDash(def: CreatureDef, rules: CombatRules, dashValue: number) {
  const d = { ...rules.dash, ...(def.dash ?? {}) };
  const distance = Math.max(0, d.distance);
  const total = Math.round(distance * rules.cellUnits);
  const cooldown = computeDashCooldown(dashValue, rules);
  return {
    cooldown,
    cooldownTicks: Math.round(cooldown * rules.tickRate),
    distance,
    step: total > 0 ? Math.max(1, Math.round(total / Math.max(1, rules.dash.durationTicks))) : 0,
    damage: d.damage,
    dealsDamage: d.dealsDamage,
  };
}

function createFighter(
  side: BattleSide,
  creature: CreatureState,
  def: CreatureDef,
  build: BattleBuild,
  rules: CombatRules,
  powerups: Record<string, PowerupDef>,
): Fighter {
  const spawn = cellCentre(combatSpawnCell(arenaGrid(rules), creature.owner), rules);
  const dash = resolveDash(def, rules, build.stats.dash);
  const powerup = fighterPowerup(def, powerups, rules);
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
    // A limited Powerup's weapon is only used once it is activated.
    weapon: powerup?.limited ? ownWeapon(def, rules) : resolveWeapon(def, powerups, rules),
    baseWeapon: ownWeapon(def, rules),
    powerup,
    charge: { state: 'none', ticks: 0 },
  };
}

/** Is the fighter's Charge Attack Powerup active right now? */
export const chargeActive = (f: Fighter) => !!f.powerup && f.powerup.chargeTicks > 0 && f.powerup.state === 'active';

/** Starts the fighter's current attack (ranged shot or melee swing). */
function startAttack(combat: CombatState, f: Fighter, input: FighterInput, rules: CombatRules, events: GameEvent[]): void {
  if (f.weapon.kind === 'ranged') {
    fireProjectile(combat, f, input, rules);
    f.cooldown = f.weapon.cooldownTicks;
    events.push({ type: 'PROJECTILE_FIRED', side: f.side });
  } else {
    f.windup = rules.windupTicks;
    // A melee Powerup sets its own attack interval; classic melee uses the Speed stat.
    f.cooldown = f.weapon.cooldownTicks ?? f.attackCooldownTicks;
    f.swingAim = { ...f.aim };
    events.push({ type: 'ATTACK_STARTED', side: f.side });
  }
}

/** A limited Powerup ran out: back to the own attack, any charge is cancelled; spent until the next battle. */
function expirePowerup(f: Fighter, events: GameEvent[]): void {
  const pu = f.powerup!;
  pu.state = 'spent';
  pu.ticksLeft = 0;
  f.weapon = f.baseWeapon;
  if (f.charge.state !== 'none') {
    f.charge = { state: 'none', ticks: 0 };
    events.push({ type: 'CHARGE_CANCELLED', side: f.side, reason: 'expired' });
  }
  events.push({ type: 'POWERUP_EXPIRED', side: f.side, powerupId: pu.id });
}

export interface CombatantSetup {
  creature: CreatureState;
  def: CreatureDef;
  build: BattleBuild;
}

export function createCombat(
  attacker: CombatantSetup,
  defender: CombatantSetup,
  rules: CombatRules,
  powerups: Record<string, PowerupDef> = {},
  walls: WallSegment[] = [],
): CombatState {
  const grid = arenaGrid(rules);
  return {
    tick: 0,
    arena: { width: grid.width * rules.cellUnits, height: grid.height * rules.cellUnits },
    walls: walls.map((w) => ({ orientation: w.orientation, cells: w.cells.map((c) => ({ ...c })) })),
    fighters: {
      attacker: createFighter('attacker', attacker.creature, attacker.def, attacker.build, rules, powerups),
      defender: createFighter('defender', defender.creature, defender.def, defender.build, rules, powerups),
    },
    projectiles: [],
    nextProjectileId: 1,
  };
}

// --- projectiles (ranged Powerups) -----------------------------------------------------
// Fixed point: positions and velocities are combat units × 256.

const FP = 256;

/** Spawns a projectile in the aim direction; Magnus curve only if the shooter is moving. */
function fireProjectile(combat: CombatState, f: Fighter, input: FighterInput, rules: CombatRules): void {
  const w = f.weapon;
  if (w.kind !== 'ranged') return;
  const aimLen = isqrt(f.aim.x * f.aim.x + f.aim.y * f.aim.y) || 1;
  const speed = w.speed * FP;
  const off = (rules.fighterRadius + PROJECTILE_RADIUS + 2) * FP;
  let angle = 0;
  const mx = clampAxis(input.dx);
  const my = clampAxis(input.dy);
  const moveLen = isqrt(mx * mx + my * my);
  if (moveLen >= 20) {
    // sin(angle between aim and movement), signed: moving sideways curves the shot that way.
    const cross = f.aim.x * my - f.aim.y * mx;
    angle = Math.trunc((w.curve * cross) / (aimLen * moveLen));
  }
  const { cos, sin } = smallAngleCosSin(angle);
  combat.projectiles.push({
    id: combat.nextProjectileId++,
    side: f.side,
    x: f.x * FP + Math.trunc((off * f.aim.x) / aimLen),
    y: f.y * FP + Math.trunc((off * f.aim.y) / aimLen),
    vx: Math.trunc((speed * f.aim.x) / aimLen),
    vy: Math.trunc((speed * f.aim.y) / aimLen),
    speed,
    travelled: 0,
    maxTravel: w.range * FP,
    bouncesLeft: w.bounces,
    homing: w.homing,
    curveCos: cos,
    curveSin: sin,
    impactRadius: w.impactRadius,
  });
}

/**
 * Shockwave at the projectile's position: hits the opponent inside the radius
 * for the shooter's Power, reduced by the target's Shield - the same damage
 * as a melee hit (computeDamage).
 */
function impact(p: Projectile, target: Fighter, shooter: Fighter, rules: CombatRules, damage: Record<BattleSide, number>, events: GameEvent[]): void {
  const x = Math.trunc(p.x / FP);
  const y = Math.trunc(p.y / FP);
  const dx = target.x - x;
  const dy = target.y - y;
  const reach = p.impactRadius + rules.fighterRadius;
  const hit = dx * dx + dy * dy <= reach * reach;
  events.push({ type: 'IMPACT', side: p.side, x, y, radius: p.impactRadius, hit });
  if (!hit) return;
  if (target.guard > 0) events.push({ type: 'BLOCKED', side: target.side });
  else {
    const dmg = computeDamage(shooter.stats, target.stats, rules);
    damage[target.side] += dmg;
    events.push({ type: 'HIT', side: p.side, damage: dmg });
  }
}

function stepProjectiles(combat: CombatState, rules: CombatRules, damage: Record<BattleSide, number>, events: GameEvent[]): void {
  const r = PROJECTILE_RADIUS * FP;
  const W = combat.arena.width * FP;
  const H = combat.arena.height * FP;
  const walls = combat.walls ?? [];
  const keep: Projectile[] = [];
  for (const p of combat.projectiles) {
    const target = combat.fighters[p.side === 'attacker' ? 'defender' : 'attacker'];
    // Homing: steer a fraction of the way towards the opponent each tick.
    if (p.homing > 0) {
      const tx = target.x * FP - p.x;
      const ty = target.y * FP - p.y;
      const tl = isqrt(tx * tx + ty * ty);
      if (tl > 0) {
        p.vx += Math.trunc(((Math.trunc((p.speed * tx) / tl) - p.vx) * p.homing) / 100);
        p.vy += Math.trunc(((Math.trunc((p.speed * ty) / tl) - p.vy) * p.homing) / 100);
      }
    }
    // Magnus curve: rotate the velocity a little every tick.
    if (p.curveSin !== 0) {
      const vx = Math.trunc((p.vx * p.curveCos - p.vy * p.curveSin) / 65536);
      const vy = Math.trunc((p.vx * p.curveSin + p.vy * p.curveCos) / 65536);
      p.vx = vx;
      p.vy = vy;
    }
    // Keep the projectile's speed constant.
    const vl = isqrt(p.vx * p.vx + p.vy * p.vy);
    if (vl > 0) {
      p.vx = Math.trunc((p.vx * p.speed) / vl);
      p.vy = Math.trunc((p.vy * p.speed) / vl);
    }
    const ox = p.x;
    const oy = p.y;
    p.x += p.vx;
    p.y += p.vy;
    p.travelled += p.speed;

    // Walls: bounce while bounces are left; after that a wall hit removes the shot.
    let wall = false;
    // Arena walls: reflect on the axis that ran into the wall (both at a corner).
    if (walls.length && circleHitsWall(p.x / FP, p.y / FP, PROJECTILE_RADIUS, walls, rules.cellUnits)) {
      const hitX = circleHitsWall(p.x / FP, oy / FP, PROJECTILE_RADIUS, walls, rules.cellUnits);
      const hitY = circleHitsWall(ox / FP, p.y / FP, PROJECTILE_RADIUS, walls, rules.cellUnits);
      if (hitX || !hitY) {
        p.x = ox;
        p.vx = -p.vx;
      }
      if (hitY || !hitX) {
        p.y = oy;
        p.vy = -p.vy;
      }
      wall = true;
    }
    if (p.x < r || p.x > W - r) {
      p.x = p.x < r ? r : W - r;
      p.vx = -p.vx;
      wall = true;
    }
    if (p.y < r || p.y > H - r) {
      p.y = p.y < r ? r : H - r;
      p.vy = -p.vy;
      wall = true;
    }
    if (wall) {
      if (p.bouncesLeft > 0) {
        p.bouncesLeft--;
        events.push({ type: 'PROJECTILE_BOUNCED', side: p.side });
      } else continue; // no bounces left: the shot is gone
    }
    // Direct hit on the opponent.
    const hx = target.x * FP - p.x;
    const hy = target.y * FP - p.y;
    const reach = (rules.fighterRadius + PROJECTILE_RADIUS) * FP;
    if (hx * hx + hy * hy <= reach * reach) {
      impact(p, target, combat.fighters[p.side], rules, damage, events);
      continue;
    }
    if (p.travelled >= p.maxTravel) continue; // out of range: fizzles
    keep.push(p);
  }
  combat.projectiles = keep;
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
 * How far along one axis a fighter at (x, y) gets towards `to` before an
 * arena wall stops it (the largest step that does not overlap a wall).
 */
function wallLimit(x: number, y: number, to: number, axis: 'x' | 'y', rules: CombatRules, walls: WallSegment[]): number {
  const from = axis === 'x' ? x : y;
  if (to === from || !walls.length) return to;
  const at = (v: number) => (axis === 'x' ? circleHitsWall(v, y, rules.fighterRadius, walls, rules.cellUnits) : circleHitsWall(x, v, rules.fighterRadius, walls, rules.cellUnits));
  if (!at(to)) return to;
  const dir = to > from ? 1 : -1;
  let lo = 0;
  let hi = Math.abs(to - from);
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (at(from + dir * mid)) hi = mid - 1;
    else lo = mid;
  }
  return from + dir * lo;
}

/**
 * Moves by (sx, sy) per axis, stopping at the arena edge, at arena walls and
 * at the opponent. Returns true if the opponent blocked the movement.
 */
function tryMove(f: Fighter, other: Fighter, sx: number, sy: number, rules: CombatRules, combat: CombatState): boolean {
  const { arena } = combat;
  const walls = combat.walls ?? [];
  const r = rules.fighterRadius;
  const minDistSq = 4 * r * r;
  let blocked = false;
  const nx = wallLimit(f.x, f.y, clamp(f.x + sx, r, arena.width - r), 'x', rules, walls);
  if (nx !== f.x) {
    const dx = nx - other.x;
    const dy = f.y - other.y;
    if (dx * dx + dy * dy >= minDistSq) f.x = nx;
    else blocked = true;
  }
  const ny = wallLimit(f.x, f.y, clamp(f.y + sy, r, arena.height - r), 'y', rules, walls);
  if (ny !== f.y) {
    const dx = f.x - other.x;
    const dy = ny - other.y;
    if (dx * dx + dy * dy >= minDistSq) f.y = ny;
    else blocked = true;
  }
  return blocked;
}

/**
 * Where a step of (sx, sy) would end up, stopped by the arena edge and arena
 * walls (opponent ignored). Used to detect a dash that would only push into a wall.
 */
function clampedProgress(f: Fighter, sx: number, sy: number, rules: CombatRules, combat: CombatState): number {
  const { arena } = combat;
  const walls = combat.walls ?? [];
  const r = rules.fighterRadius;
  const nx = wallLimit(f.x, f.y, clamp(f.x + sx, r, arena.width - r), 'x', rules, walls);
  const ny = wallLimit(nx, f.y, clamp(f.y + sy, r, arena.height - r), 'y', rules, walls);
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
function move(f: Fighter, other: Fighter, input: FighterInput, rules: CombatRules, combat: CombatState, speed = f.moveSpeed): void {
  const x = clampAxis(input.dx);
  const y = clampAxis(input.dy);
  if (x === 0 && y === 0) return;
  const len = isqrt(x * x + y * y);
  const mag = Math.min(100, len);
  const sx = Math.trunc((speed * x * mag) / (len * 100));
  const sy = Math.trunc((speed * y * mag) / (len * 100));
  tryMove(f, other, sx, sy, rules, combat);
}

/** Applies a 'manual' Special's effect to the fighter (once). */
function triggerSpecial(f: Fighter, def: CreatureDef, rules: CombatRules): void {
  if (!def.special) return;
  const before = computeBlockCharges(f.stats, rules);
  applyEffect(f.stats, def.special.effect);
  for (const k of ['power', 'shield', 'speed', 'block'] as const) f.stats[k] = Math.max(0, f.stats[k]);
  // A + Dash effect shortens the cooldown of the next dash (the distance stays fixed).
  f.dashCooldownTicks = resolveDash(def, rules, f.stats.dash).cooldownTicks;
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
    // Limited Powerup timer.
    if (f.powerup?.limited && f.powerup.state === 'active' && --f.powerup.ticksLeft <= 0) expirePowerup(f, events);
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
    // The same input activates a limited Powerup (once per battle).
    const pu = f.powerup;
    if (input.special && pu?.limited && pu.state === 'inactive') {
      pu.state = 'active';
      pu.ticksLeft = pu.limitTicks;
      f.weapon = pu.weapon;
      events.push({ type: 'POWERUP_ACTIVATED', side: f.side, powerupId: pu.id });
    }

    const mx = clampAxis(input.dx);
    const my = clampAxis(input.dy);
    const busy = f.windup > 0 || f.guard > 0 || f.dashTicks > 0;
    const wantsAttack = input.attack || (f.autoFire && input.attackHeld === true);
    // Charge Attack in progress: holding attack charges; releasing fires (if ready)
    // or cancels. Nothing else (block, dash, a new attack) starts meanwhile.
    const charging = f.charge.state !== 'none';
    if (charging) {
      if (input.attackHeld) {
        f.charge.ticks++;
        if (f.charge.state === 'charging' && f.charge.ticks >= f.powerup!.chargeTicks) {
          f.charge.state = 'ready';
          events.push({ type: 'CHARGE_READY', side: f.side });
        }
      } else {
        const ready = f.charge.state === 'ready';
        f.charge = { state: 'none', ticks: 0 };
        if (ready) {
          events.push({ type: 'CHARGE_RELEASED', side: f.side });
          startAttack(combat, f, input, rules, events);
        } else events.push({ type: 'CHARGE_CANCELLED', side: f.side, reason: 'early' });
      }
    } else if (input.block && !busy && f.blockCharges > 0) {
      f.blockCharges--;
      f.guard = rules.guardTicks;
      events.push({ type: 'GUARD', side: f.side });
    } else if (input.dash && !busy) {
      // Dash along the movement direction. It needs a deliberate stick push and
      // room to move; otherwise nothing happens and no cooldown is spent.
      const first = along(mx, my, f.dashStep);
      if (f.dashStep === 0) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'noDash' });
      } else if (f.dashCooldown > 0) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'cooldown' });
      } else if (isqrt(mx * mx + my * my) < rules.dash.minInput) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'noDirection' });
      } else if (clampedProgress(f, first.sx, first.sy, rules, combat) * 2 < f.dashStep) {
        events.push({ type: 'DASH_DENIED', side: f.side, reason: 'blocked' });
      } else {
        f.dashDir = { x: mx, y: my };
        f.dashTicks = rules.dash.durationTicks;
        f.dashCooldown = f.dashCooldownTicks;
        f.dashHit = false;
        events.push({ type: 'DASH', side: f.side });
      }
    } else if (wantsAttack && !busy && f.cooldown === 0) {
      if (chargeActive(f)) {
        // Charge Attack: the attack must be held first (fires on release when ready).
        f.charge = { state: 'charging', ticks: 0 };
        events.push({ type: 'CHARGE_STARTED', side: f.side });
      } else startAttack(combat, f, input, rules, events);
    }

    if (f.dashTicks > 0) {
      const { sx, sy } = along(f.dashDir.x, f.dashDir.y, f.dashStep);
      const fromX = f.x;
      const fromY = f.y;
      const blocked = tryMove(f, other, sx, sy, rules, combat);
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
      if (f.charge.state !== 'none') {
        // Charging: almost stationary (CHARGE_MOVE_PERCENT of the speed, spread over the ticks).
        const t = f.charge.ticks;
        const step = Math.trunc((f.moveSpeed * CHARGE_MOVE_PERCENT * t) / 100) - Math.trunc((f.moveSpeed * CHARGE_MOVE_PERCENT * Math.max(0, t - 1)) / 100);
        move(f, other, input, rules, combat, step);
      } else move(f, other, input, rules, combat);
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
    const range = f.weapon.kind === 'melee' ? f.weapon.range : rules.attackRange;
    if (distanceSq(f, other) > range * range) continue;
    if (!inAimCone(f, other, f.swingAim, rules.attackConeCos)) continue;
    if (other.guard > 0) {
      events.push({ type: 'BLOCKED', side: other.side });
      continue;
    }
    const dmg = computeDamage(f.stats, other.stats, rules);
    damage[other.side] += dmg;
    events.push({ type: 'HIT', side: f.side, damage: dmg });
    // Knockback: push the target along the attack direction (stops at walls).
    if (f.weapon.kind === 'melee' && f.weapon.knockback > 0) {
      const { sx, sy } = along(f.swingAim.x, f.swingAim.y, f.weapon.knockback);
      const x0 = other.x;
      const y0 = other.y;
      tryMove(other, f, sx, sy, rules, combat);
      const moved = isqrt((other.x - x0) * (other.x - x0) + (other.y - y0) * (other.y - y0));
      events.push({ type: 'KNOCKBACK', side: f.side, distance: moved });
    }
  }
  stepProjectiles(combat, rules, damage, events);
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
