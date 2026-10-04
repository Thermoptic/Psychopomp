// Content validation. Content is untrusted data (it may come from the editor or
// an imported pack), so everything is checked before it reaches a match.
// Returns human-readable errors instead of throwing.

import { cellInBoard, parseCell } from '../core/board/cells';
import { REQUIREMENT_TYPES } from '../core/dice/requirements';
import type { PlayerId, Ruleset } from '../core/types';

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0;
const ID_RE = /^[a-z0-9_]+$/;
const EFFECT_TYPES = ['addPower', 'addShield', 'addSpeed', 'addBlock', 'addDash', 'multi'];
const TARGETED = new Set<string>(REQUIREMENT_TYPES.filter((t) => !['always', 'never', 'and', 'or', 'not', 'slots'].includes(t)));
const MODIFIER_KEYS = ['power', 'speed', 'shield', 'block', 'dash'] as const;

function intIn(errors: string[], where: string, v: unknown, min: number, max: number): void {
  if (!isInt(v) || v < min || v > max) errors.push(`${where} must be an integer ${min}..${max} (got ${JSON.stringify(v)})`);
}

function validateRequirement(req: unknown, where: string, errors: string[], depth = 0): void {
  if (depth > 16) return void errors.push(`${where}: requirement nested too deeply`);
  if (!isObj(req) || !isStr(req.type)) return void errors.push(`${where}: requirement needs a "type"`);
  const t = req.type;
  if (!(REQUIREMENT_TYPES as readonly string[]).includes(t)) return void errors.push(`${where}: unknown requirement "${t}"`);
  if (t === 'and' || t === 'or') {
    if (!Array.isArray(req.of) || req.of.length === 0) errors.push(`${where}: "${t}" needs a non-empty "of" list`);
    else req.of.forEach((r, i) => validateRequirement(r, `${where}.of[${i}]`, errors, depth + 1));
  } else if (t === 'not') {
    validateRequirement(req.of, `${where}.of`, errors, depth + 1);
  } else if (t === 'slots') {
    if (!Array.isArray(req.slots) || req.slots.length === 0 || req.slots.length > 20) errors.push(`${where}: "slots" needs a list of 1..20 conditions`);
    else
      req.slots.forEach((c, i) => {
        const ok = c === null || c === 'odd' || c === 'even' || (isInt(c) && c >= 1 && c <= 100);
        if (!ok) errors.push(`${where}.slots[${i}] must be null, "odd", "even" or a die face`);
      });
  } else if (TARGETED.has(t)) {
    if (req.target !== undefined && !isStr(req.target)) errors.push(`${where}: "target" must be a category name or "all"`);
    if (t === 'sumAtLeast' || t === 'sumAtMost') intIn(errors, `${where}.value`, req.value, 0, 1000);
    if (t === 'straight' && req.length !== undefined) intIn(errors, `${where}.length`, req.length, 2, 20);
  }
}

function validateEffect(eff: unknown, where: string, errors: string[], depth = 0): void {
  if (depth > 16) return void errors.push(`${where}: effect nested too deeply`);
  if (!isObj(eff) || !isStr(eff.type)) return void errors.push(`${where}: effect needs a "type"`);
  if (!EFFECT_TYPES.includes(eff.type)) return void errors.push(`${where}: unknown effect "${eff.type}"`);
  if (eff.type === 'multi') {
    if (!Array.isArray(eff.effects)) errors.push(`${where}: "multi" needs an "effects" list`);
    else eff.effects.forEach((e, i) => validateEffect(e, `${where}.effects[${i}]`, errors, depth + 1));
  } else {
    intIn(errors, `${where}.value`, eff.value, -99, 99);
  }
}

/** Dash data (ruleset default when `required`, otherwise optional per-creature overrides). */
function validateDash(d: Obj, where: string, errors: string[], required: boolean): void {
  const num = (k: string, min: number, max: number) => {
    const v = d[k];
    if (v === undefined && !required) return;
    if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max) errors.push(`${where}.${k} must be a number ${min}..${max}`);
  };
  num('distance', 0, 30);
  num('damage', 0, 999);
  if (required) {
    num('baseCooldown', 0, 120);
    num('minCooldown', 0, 120);
  } else if (d.cooldown !== undefined) errors.push(`${where}.cooldown is no longer used (the dash cooldown comes from the DASH die + Dash Cooldown Modifier)`);
  if (d.dealsDamage !== undefined || required) {
    if (typeof d.dealsDamage !== 'boolean') errors.push(`${where}.dealsDamage must be true/false`);
  }
}

/** Optional cross-checks (references and board) for a creature. */
export interface CreatureContext {
  /** Known Powerup ids; when given, powerupId must be one of them. */
  powerupIds?: Set<string>;
  /** Board the position must be on (default 9×9). */
  board?: { width: number; height: number };
}

export function validateCreature(raw: unknown, ruleset: Ruleset, ctx: CreatureContext = {}): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['creature must be an object'] };
  const where = isStr(raw.id) ? `creature "${raw.id}"` : 'creature';

  if (!isStr(raw.id)) errors.push(`${where}: missing "id"`);
  else if (!ID_RE.test(raw.id)) errors.push(`${where}: id must use a-z, 0-9 and _ only`);
  if (!isStr(raw.name)) errors.push(`${where}: missing "name"`);
  if (!isObj(raw.art)) errors.push(`${where}: missing "art" object`);

  if (!isObj(raw.stats)) errors.push(`${where}: missing "stats"`);
  else {
    const s = raw.stats;
    intIn(errors, `${where}.stats.maxHp`, s.maxHp, 1, 999);
    if (s.startHp !== undefined) intIn(errors, `${where}.stats.startHp`, s.startHp, 1, isInt(s.maxHp) ? s.maxHp : 999);
    intIn(errors, `${where}.stats.movement`, s.movement, 1, 20);
  }

  // Start modifiers: positive or negative, default 0. Resulting battle stats are floored at 0 by the core.
  if (raw.modifiers !== undefined) {
    if (!isObj(raw.modifiers)) errors.push(`${where}: "modifiers" must be an object`);
    else
      for (const k of MODIFIER_KEYS) {
        const v = raw.modifiers[k];
        if (v !== undefined) intIn(errors, `${where}.modifiers.${k}`, v, -99, 99);
      }
  }

  // Placement: player + board cell ("A1".."I9").
  if (raw.player !== undefined && raw.player !== 'P1' && raw.player !== 'P2') errors.push(`${where}.player must be "P1" or "P2"`);
  if (raw.position !== undefined && raw.position !== null) {
    const cell = typeof raw.position === 'string' ? parseCell(raw.position) : null;
    if (!cell || !cellInBoard(cell, ctx.board ?? { width: 9, height: 9 })) errors.push(`${where}.position "${String(raw.position)}" is not a board cell`);
    if (raw.player === undefined) errors.push(`${where}: a position needs a player`);
  }

  // Movement rule: default, or a pattern of relative destination offsets.
  if (raw.movement !== undefined) {
    const mv = raw.movement;
    if (!isObj(mv) || (mv.type !== 'default' && mv.type !== 'pattern')) errors.push(`${where}.movement.type must be "default" or "pattern"`);
    else if (mv.type === 'pattern') {
      if (!Array.isArray(mv.cells) || mv.cells.length > 288) errors.push(`${where}.movement.cells must be a list of offsets`);
      else {
        const seen = new Set<string>();
        mv.cells.forEach((c, i) => {
          const ok = isObj(c) && isInt(c.x) && isInt(c.y) && Math.abs(c.x) <= 8 && Math.abs(c.y) <= 8 && !(c.x === 0 && c.y === 0);
          if (!ok) return void errors.push(`${where}.movement.cells[${i}] must be an offset {x, y} within -8..8, not 0,0`);
          const k = `${(c as Obj).x},${(c as Obj).y}`;
          if (seen.has(k)) errors.push(`${where}.movement.cells has ${k} twice`);
          seen.add(k);
        });
      }
    }
  }

  // Powerup reference (by id, never a copy).
  if (raw.powerupId !== undefined && raw.powerupId !== null) {
    if (!isStr(raw.powerupId)) errors.push(`${where}.powerupId must be a Powerup id`);
    else if (ctx.powerupIds && !ctx.powerupIds.has(raw.powerupId)) errors.push(`${where}: unknown Powerup "${raw.powerupId}"`);
  }

  if (raw.powerupNeedsTrigger !== undefined && typeof raw.powerupNeedsTrigger !== 'boolean') errors.push(`${where}.powerupNeedsTrigger must be true or false`);

  if (!isObj(raw.dice) || !isObj(raw.dice.slots)) errors.push(`${where}: missing "dice.slots"`);
  else {
    if (raw.dice.sides !== undefined) intIn(errors, `${where}.dice.sides`, raw.dice.sides, 1, 100);
    let total = 0;
    for (const [cat, n] of Object.entries(raw.dice.slots)) {
      if (!ID_RE.test(cat)) errors.push(`${where}: bad dice category "${cat}"`);
      if (!isInt(n) || n < 0) errors.push(`${where}.dice.slots.${cat} must be a non-negative integer`);
      else total += n;
    }
    if (total !== ruleset.dice.count) {
      errors.push(`${where}: dice slots total ${total}, the ruleset uses ${ruleset.dice.count} dice`);
    }
  }

  if (raw.special === undefined) errors.push(`${where}: missing "special" (use null for none)`);
  else if (raw.special !== null) {
    const sp = raw.special;
    if (!isObj(sp)) errors.push(`${where}: "special" must be an object or null`);
    else {
      if (!isStr(sp.name)) errors.push(`${where}: special needs a "name"`);
      validateRequirement(sp.requirement, `${where}.special.requirement`, errors);
      validateEffect(sp.effect, `${where}.special.effect`, errors);
      if (sp.activation !== undefined && sp.activation !== 'auto' && sp.activation !== 'manual') {
        errors.push(`${where}.special.activation must be "auto" or "manual"`);
      }
    }
  }
  if (raw.attack !== undefined) {
    if (!isObj(raw.attack)) errors.push(`${where}: "attack" must be an object`);
    else {
      if (raw.attack.autoFire !== undefined && typeof raw.attack.autoFire !== 'boolean') errors.push(`${where}.attack.autoFire must be true/false`);
      validateWeapon(raw.attack, `${where}.attack`, errors, false);
    }
  }
  if (raw.dash !== undefined) {
    if (!isObj(raw.dash)) errors.push(`${where}: "dash" must be an object`);
    else validateDash(raw.dash, `${where}.dash`, errors, false);
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Melee/ranged weapon settings (levels 1-10, impact damage 1-100; see
 * core/combat/powerups.ts). `typeRequired`: Powerups must have a type;
 * a monster's attack may omit it (= classic melee).
 */
function validateWeapon(raw: Obj, where: string, errors: string[], typeRequired: boolean): void {
  const typed = raw.type !== undefined || typeRequired;
  if (typed && raw.type !== 'melee' && raw.type !== 'ranged') errors.push(`${where}.type must be "melee" or "ranged"`);
  const block = (key: 'melee' | 'ranged', fields: string[]) => {
    const b = raw[key];
    if (b === undefined) {
      if (raw.type === key) errors.push(`${where}: a ${key} attack needs "${key}" settings`);
      return;
    }
    if (!isObj(b)) return void errors.push(`${where}.${key} must be an object`);
    for (const f of fields) intIn(errors, `${where}.${key}.${f}`, b[f], 1, 10);
  };
  block('melee', ['speed', 'knockback', 'range']);
  // (impactDamage from older content is ignored: damage comes from Power and Shield.)
  block('ranged', ['speed', 'range', 'rateOfFire', 'impactSize', 'homing', 'trajectory']);
  const r = raw.ranged;
  if (isObj(r)) {
    intIn(errors, `${where}.ranged.bounce`, r.bounce, 0, 10);
    if (r.size !== undefined) intIn(errors, `${where}.ranged.size`, r.size, 1, 10);
    if (r.trail !== undefined) intIn(errors, `${where}.ranged.trail`, r.trail, 0, 10);
    if (r.color !== undefined && (typeof r.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(r.color))) errors.push(`${where}.ranged.color must be a colour like "#ff8800"`);
  }
}

/** Level 1-10 settings (impact damage 1-100), see core/combat/powerups.ts for their meaning. */
export function validatePowerup(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['powerup must be an object'] };
  const where = isStr(raw.id) ? `powerup "${raw.id}"` : 'powerup';
  if (!isStr(raw.id)) errors.push(`${where}: missing "id"`);
  else if (!ID_RE.test(raw.id)) errors.push(`${where}: id must use a-z, 0-9 and _ only`);
  if (!isStr(raw.name) || !String(raw.name).trim()) errors.push(`${where}: missing "name"`);
  validateWeapon(raw, where, errors, true);
  // Description (optional free text).
  if (raw.description !== undefined && (typeof raw.description !== 'string' || raw.description.length > 160)) errors.push(`${where}.description must be text of at most 160 characters`);
  // Power override (optional).
  if (raw.power !== undefined) intIn(errors, `${where}.power`, raw.power, 1, 10);
  // Charge (optional): seconds attack must be held.
  if (raw.chargeTime !== undefined) intIn(errors, `${where}.chargeTime`, raw.chargeTime, 1, 10);
  // Movement Speed while charging (optional, only with Charge): 0 = standing still ... 10 = full speed.
  if (raw.chargeMoveSpeed !== undefined) {
    if (raw.chargeTime === undefined) errors.push(`${where}.chargeMoveSpeed is only used by a Charge Powerup`);
    else intIn(errors, `${where}.chargeMoveSpeed`, raw.chargeMoveSpeed, 0, 10);
  }
  if (raw.duration !== undefined && raw.duration !== 'permanent' && raw.duration !== 'limited') errors.push(`${where}.duration must be "permanent" or "limited"`);
  if (raw.duration === 'limited') intIn(errors, `${where}.timeLimit`, raw.timeLimit, 1, 60);
  else if (raw.timeLimit !== undefined) errors.push(`${where}.timeLimit is only used by a limited Powerup`);
  return { ok: errors.length === 0, errors };
}

export function validateRuleset(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['ruleset must be an object'] };
  if (!isStr(raw.id)) errors.push('ruleset: missing "id"');
  if (!isObj(raw.creatureBase)) errors.push('ruleset: missing "creatureBase"');
  else for (const k of ['power', 'speed', 'shield', 'block', 'dash']) intIn(errors, `ruleset.creatureBase.${k}`, raw.creatureBase[k], 0, 99);
  if (raw.firstPlayer !== 'P1' && raw.firstPlayer !== 'P2') errors.push('ruleset.firstPlayer must be "P1" or "P2"');
  if (!isObj(raw.dice)) errors.push('ruleset: missing "dice"');
  else {
    intIn(errors, 'ruleset.dice.count', raw.dice.count, 1, 20);
    intIn(errors, 'ruleset.dice.sides', raw.dice.sides, 1, 100);
    intIn(errors, 'ruleset.dice.maxRerolls', raw.dice.maxRerolls, 0, 20);
  }
  if (!isObj(raw.combat)) errors.push('ruleset: missing "combat"');
  else {
    const c = raw.combat;
    for (const k of [
      'tickRate', 'cellUnits', 'arenaColumns', 'arenaRows', 'fighterRadius', 'attackRange', 'windupTicks',
      'baseCooldownTicks', 'minCooldownTicks', 'baseMoveSpeed', 'speedPerMoveUnit', 'guardTicks', 'blockChargeDivisor',
    ]) {
      intIn(errors, `ruleset.combat.${k}`, c[k], 1, 100000);
    }
    for (const k of ['cooldownPerSpeed', 'minDamage', 'timeoutTicks', 'countdownTicks']) intIn(errors, `ruleset.combat.${k}`, c[k], 0, 1000000);
    for (const k of ['shieldPercentPerPoint', 'shieldMaxPercent']) intIn(errors, `ruleset.combat.${k}`, c[k], 0, 100);
    intIn(errors, 'ruleset.combat.attackConeCos', c.attackConeCos, -100, 100);
    if (c.walls !== undefined && typeof c.walls !== 'boolean') errors.push('ruleset.combat.walls must be true or false');
    if (!isObj(c.dash)) errors.push('ruleset.combat: missing "dash"');
    else {
      validateDash(c.dash, 'ruleset.combat.dash', errors, true);
      intIn(errors, 'ruleset.combat.dash.durationTicks', c.dash.durationTicks, 1, 600);
      intIn(errors, 'ruleset.combat.dash.minInput', c.dash.minInput, 1, 100);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateBoard(raw: unknown, creatureIds: Set<string>): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['board must be an object'] };
  const where = `board "${String(raw.id)}"`;
  if (!isStr(raw.id)) errors.push('board: missing "id"');
  intIn(errors, `${where}.width`, raw.width, 2, 64);
  intIn(errors, `${where}.height`, raw.height, 2, 64);
  const w = isInt(raw.width) ? raw.width : 0;
  const h = isInt(raw.height) ? raw.height : 0;
  const inside = (c: unknown) => isObj(c) && isInt(c.x) && isInt(c.y) && c.x >= 0 && c.y >= 0 && c.x < w && c.y < h;

  if (typeof raw.allowDiagonal !== 'boolean') errors.push(`${where}.allowDiagonal must be true/false`);
  if (typeof raw.passThroughCreatures !== 'boolean') errors.push(`${where}.passThroughCreatures must be true/false`);
  if (!Array.isArray(raw.blockedCells)) errors.push(`${where}.blockedCells must be a list`);
  else raw.blockedCells.forEach((c, i) => !inside(c) && errors.push(`${where}.blockedCells[${i}] is off the board`));

  if (!Array.isArray(raw.powerPoints) || raw.powerPoints.length === 0) errors.push(`${where} needs powerPoints`);
  else {
    raw.powerPoints.forEach((c, i) => {
      if (!inside(c)) errors.push(`${where}.powerPoints[${i}] is off the board`);
      const owner = isObj(c) ? c.owner : undefined;
      if (owner !== undefined && owner !== null && owner !== 'P1' && owner !== 'P2') {
        errors.push(`${where}.powerPoints[${i}].owner is invalid`);
      }
    });
  }

  if (!Array.isArray(raw.placements)) errors.push(`${where}.placements must be a list`);
  else {
    const seen = new Set<string>();
    const owners = new Set<PlayerId>();
    raw.placements.forEach((p, i) => {
      if (!inside(p)) return void errors.push(`${where}.placements[${i}] is off the board`);
      const pl = p as Obj;
      if (!creatureIds.has(String(pl.creature))) errors.push(`${where}.placements[${i}] uses unknown creature "${String(pl.creature)}"`);
      if (pl.owner !== 'P1' && pl.owner !== 'P2') errors.push(`${where}.placements[${i}].owner is invalid`);
      else owners.add(pl.owner);
      const k = `${pl.x},${pl.y}`;
      if (seen.has(k)) errors.push(`${where}: two placements on ${k}`);
      seen.add(k);
    });
    if (!owners.has('P1') || !owners.has('P2')) errors.push(`${where}: both players need at least one creature`);
  }
  return { ok: errors.length === 0, errors };
}

