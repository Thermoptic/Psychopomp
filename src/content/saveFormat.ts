// Versioned save/exchange formats for content. Pure and portable: the platform
// layer decides where the text lives (browser storage, files, …).
//
// Payloads are always the game's own definitions (CreatureDef, PowerupDef) —
// the exact data the game core uses. There is no separate editor representation.
//
//   Monster file:  { "format": "psychopomp-monster", "formatVersion": 5, "contentVersion": 1, "monster": CreatureDef }
//   Powerup file:  { "format": "psychopomp-powerup", "formatVersion": 1, "contentVersion": 1, "powerup": PowerupDef }
//   Local save:    { "saveVersion": 5, "contentVersion": 1, "monsters": CreatureDef[], "powerups": PowerupDef[] }
//
// Versions: see content/migrate.ts. Monster v0 (bare CreatureDef) and v1
// (absolute stats) migrate to v2 on load; save v1 (monsters only) migrates to
// v2. Newer, unknown versions are refused with a clear error.

import type { CreatureDef, PowerupDef, Ruleset } from '../core/types';
import { MONSTER_FORMAT_VERSION, POWERUP_FORMAT_VERSION, isObj, migrateMonster } from './migrate';
import { validateCreature, validatePowerup } from './validate';

export { MONSTER_FORMAT_VERSION, POWERUP_FORMAT_VERSION };
export const MONSTER_FORMAT = 'psychopomp-monster';
export const POWERUP_FORMAT = 'psychopomp-powerup';
export const SAVE_VERSION = 5;

export type ContentKind = 'monster' | 'powerup';

export interface SaveData {
  saveVersion: number;
  contentVersion: number;
  monsters: CreatureDef[];
  powerups: PowerupDef[];
}

export type ParseResult<T> = { ok: true; value: T; migratedFrom: number | null; warnings: string[] } | { ok: false; errors: string[] };
export type ParsedItem = { kind: 'monster'; item: CreatureDef } | { kind: 'powerup'; item: PowerupDef };

type Obj = Record<string, unknown>;

function parseJson(input: string | unknown): { ok: true; raw: unknown } | { ok: false; errors: string[] } {
  if (typeof input !== 'string') return { ok: true, raw: input };
  try {
    return { ok: true, raw: JSON.parse(input) };
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
}

// --- files ------------------------------------------------------------------------

export function serializeMonster(def: CreatureDef, contentVersion: number): string {
  return JSON.stringify({ format: MONSTER_FORMAT, formatVersion: MONSTER_FORMAT_VERSION, contentVersion, monster: def }, null, 2) + '\n';
}

export function serializePowerup(def: PowerupDef, contentVersion: number): string {
  return JSON.stringify({ format: POWERUP_FORMAT, formatVersion: POWERUP_FORMAT_VERSION, contentVersion, powerup: def }, null, 2) + '\n';
}

/** Monster objects of any version -> current, validated CreatureDef (references not checked). */
export function parseMonster(raw: unknown, ruleset: Ruleset, fromVersion: number | null = null): ParseResult<CreatureDef> {
  if (!isObj(raw)) return { ok: false, errors: ['Monster must be a JSON object'] };
  const m = migrateMonster(raw, ruleset, fromVersion);
  const v = validateCreature(m, ruleset);
  if (!v.ok) return { ok: false, errors: v.errors };
  return { ok: true, value: m as unknown as CreatureDef, migratedFrom: fromVersion, warnings: [] };
}

/** Parses an exported content file (monster or powerup, any supported version) or a bare legacy monster. */
export function parseContentFile(input: string | unknown, ruleset: Ruleset): ParseResult<ParsedItem> {
  const j = parseJson(input);
  if (!j.ok) return j;
  const raw = j.raw;
  if (!isObj(raw)) return { ok: false, errors: ['A content file must be a JSON object'] };

  if (raw.format === POWERUP_FORMAT) {
    const v = raw.formatVersion;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, errors: ['Invalid formatVersion'] };
    if (v > POWERUP_FORMAT_VERSION) return { ok: false, errors: [`Powerup file version ${v} is newer than this game supports (${POWERUP_FORMAT_VERSION})`] };
    const pv = validatePowerup(raw.powerup);
    if (!pv.ok) return { ok: false, errors: pv.errors };
    return { ok: true, value: { kind: 'powerup', item: structuredClone(raw.powerup) as PowerupDef }, migratedFrom: null, warnings: [] };
  }
  if (raw.format === MONSTER_FORMAT || 'formatVersion' in raw) {
    if (raw.format !== MONSTER_FORMAT) return { ok: false, errors: [`Unknown format "${String(raw.format)}"`] };
    const v = raw.formatVersion;
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, errors: ['Invalid formatVersion'] };
    if (v > MONSTER_FORMAT_VERSION) return { ok: false, errors: [`Monster file version ${v} is newer than this game supports (${MONSTER_FORMAT_VERSION})`] };
    const r = parseMonster(raw.monster, ruleset, v < MONSTER_FORMAT_VERSION ? v : null);
    return r.ok ? { ...r, value: { kind: 'monster', item: r.value } } : r;
  }
  if ('id' in raw && 'stats' in raw) {
    // Version 0: a bare CreatureDef (the bundled content's file shape).
    const r = parseMonster(raw, ruleset, 0);
    return r.ok ? { ...r, value: { kind: 'monster', item: r.value } } : r;
  }
  return { ok: false, errors: ['This is not a Psychopomp content file'] };
}

/** Back-compat helper: parse a file that must contain a monster. */
export function parseMonsterFile(input: string | unknown, ruleset: Ruleset): ParseResult<CreatureDef> {
  const r = parseContentFile(input, ruleset);
  if (!r.ok) return r;
  if (r.value.kind !== 'monster') return { ok: false, errors: ['This file contains a powerup, not a monster'] };
  return { ok: true, value: r.value.item, migratedFrom: r.migratedFrom, warnings: r.warnings };
}

// --- local save -----------------------------------------------------------------------

export function emptySave(contentVersion: number): SaveData {
  return { saveVersion: SAVE_VERSION, contentVersion, monsters: [], powerups: [] };
}

export function serializeSave(save: SaveData): string {
  return JSON.stringify(save);
}

/**
 * Parses the local save (any supported version). Invalid entries are dropped
 * with a warning instead of breaking the game; an unreadable or newer save
 * yields an error.
 */
export function parseSave(input: string | unknown, ruleset: Ruleset): ParseResult<SaveData> {
  const j = parseJson(input);
  if (!j.ok) return { ok: false, errors: j.errors.map((e) => `Save: ${e}`) };
  const raw = j.raw;
  if (!isObj(raw)) return { ok: false, errors: ['Save must be a JSON object'] };
  const v = raw.saveVersion;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) return { ok: false, errors: ['Save has no valid saveVersion'] };
  if (v > SAVE_VERSION) return { ok: false, errors: [`Save version ${v} is newer than this game supports (${SAVE_VERSION})`] };

  const warnings: string[] = [];
  const collect = <T extends { id: string }>(list: unknown, parse: (x: unknown) => ParseResult<T>, what: string): T[] => {
    const out: T[] = [];
    const seen = new Set<string>();
    for (const item of Array.isArray(list) ? list : []) {
      const r = parse(item);
      if (!r.ok) {
        warnings.push(`Skipped a saved ${what}: ${r.errors[0]}`);
        continue;
      }
      if (seen.has(r.value.id)) {
        warnings.push(`Skipped duplicate saved ${what} "${r.value.id}"`);
        continue;
      }
      seen.add(r.value.id);
      out.push(r.value);
    }
    return out;
  };
  // Save and monster versions move together, so a save older than v5 holds v<5 monsters.
  const monsters = collect(raw.monsters, (x) => parseMonster(x, ruleset, v < SAVE_VERSION ? v : null), 'monster');
  const powerups = collect(
    raw.powerups,
    (x): ParseResult<PowerupDef> => {
      const pv = validatePowerup(x);
      return pv.ok ? { ok: true, value: structuredClone(x) as PowerupDef, migratedFrom: null, warnings: [] } : { ok: false, errors: pv.errors };
    },
    'powerup',
  );
  return {
    ok: true,
    value: { saveVersion: SAVE_VERSION, contentVersion: Number((raw as Obj).contentVersion ?? 1), monsters, powerups },
    migratedFrom: v < SAVE_VERSION ? v : null,
    warnings,
  };
}
