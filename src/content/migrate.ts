// Content migrations. Older content is upgraded to the current shape before
// validation, wherever it comes from (bundled pack, local save, imported file).
//
// Monster versions:
//   v0  bare CreatureDef, absolute stats (power/speed/shield/block in `stats`)
//   v1  same CreatureDef inside a { format, formatVersion: 1 } file
//   v2  stats hold only maxHp/startHp/movement; power/speed/shield/block/dash
//       are `modifiers` relative to the ruleset's `creatureBase` (default 0)

import type { Ruleset } from '../core/types';

export const MONSTER_FORMAT_VERSION = 2;
export const POWERUP_FORMAT_VERSION = 1;

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const STAT_KEYS = ['power', 'speed', 'shield', 'block'] as const;

/** Upgrades any older monster object to v2. Never mutates its input. */
export function migrateMonster(raw: Obj, ruleset: Ruleset): Obj {
  const m: Obj = structuredClone(raw);
  if (m.special === undefined) m.special = null;
  if (!isObj(m.art)) m.art = {};
  const stats = m.stats;
  if (isObj(stats) && STAT_KEYS.some((k) => k in stats)) {
    // Absolute stats -> modifiers relative to the ruleset base (0 = same as base).
    const mods: Obj = isObj(m.modifiers) ? { ...m.modifiers } : {};
    for (const k of STAT_KEYS) {
      const v = stats[k];
      if (typeof v === 'number' && mods[k] === undefined) {
        const diff = v - ruleset.creatureBase[k];
        if (diff !== 0) mods[k] = diff;
      }
      delete stats[k];
    }
    if (Object.keys(mods).length > 0) m.modifiers = mods;
  }
  return m;
}
