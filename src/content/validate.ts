// Content validation. Content is untrusted data (it may come from the editor or
// an imported pack), so everything is checked before it reaches a match.
// Returns human-readable errors instead of throwing.

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
const EFFECT_TYPES = ['addPower', 'addShield', 'addSpeed', 'addBlock', 'multi'];
const TARGETED = new Set<string>(REQUIREMENT_TYPES.filter((t) => !['always', 'never', 'and', 'or', 'not'].includes(t)));

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

export function validateCreature(raw: unknown, ruleset: Ruleset): ValidationResult {
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
    intIn(errors, `${where}.stats.power`, s.power, 0, 99);
    intIn(errors, `${where}.stats.speed`, s.speed, 0, 99);
    intIn(errors, `${where}.stats.shield`, s.shield, 0, 99);
    if (s.block !== undefined) intIn(errors, `${where}.stats.block`, s.block, 0, 99);
  }

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
    }
  }
  return { ok: errors.length === 0, errors };
}

export function validateRuleset(raw: unknown): ValidationResult {
  const errors: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ['ruleset must be an object'] };
  if (!isStr(raw.id)) errors.push('ruleset: missing "id"');
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
      'tickRate', 'cellUnits', 'fighterRadius', 'attackRange', 'windupTicks',
      'baseCooldownTicks', 'minCooldownTicks', 'baseMoveSpeed', 'speedPerMoveUnit', 'guardTicks', 'blockChargeDivisor',
    ]) {
      intIn(errors, `ruleset.combat.${k}`, c[k], 1, 100000);
    }
    for (const k of ['cooldownPerSpeed', 'minDamage', 'timeoutTicks', 'countdownTicks']) intIn(errors, `ruleset.combat.${k}`, c[k], 0, 1000000);
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

