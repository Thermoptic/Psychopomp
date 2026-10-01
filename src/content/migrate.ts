// Content migrations. Older content is upgraded to the current shape before
// validation, wherever it comes from (bundled pack, local save, imported file).
//
// Monster versions:
//   v0  bare CreatureDef, absolute stats (power/speed/shield/block in `stats`)
//   v1  same CreatureDef inside a { format, formatVersion: 1 } file
//   v2  stats hold only maxHp/startHp/movement; power/speed/shield/block/dash
//       are `modifiers` relative to the ruleset's `creatureBase` (default 0)
//   v3  the SPECIAL dice slot is now DASH (its die sets dash distance); dice
//       slots, slot order and requirement targets named "special" become "dash"
//   v4  `movement` rule: { type: "default" } (the original N-step cardinal
//       movement) or { type: "pattern", cells }; missing = default

import type { Ruleset } from '../core/types';

export const MONSTER_FORMAT_VERSION = 4;
export const POWERUP_FORMAT_VERSION = 1;

type Obj = Record<string, unknown>;
export const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

const STAT_KEYS = ['power', 'speed', 'shield', 'block'] as const;

/** Upgrades any older monster object to the current version (v3). Never mutates its input. */
export function migrateMonster(raw: Obj, ruleset: Ruleset): Obj {
  const m: Obj = structuredClone(raw);
  if (m.special === undefined) m.special = null;
  if (!isObj(m.art)) m.art = {};
  if (m.movement === undefined) m.movement = { type: 'default' };
  renameSpecialSlot(m);
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

/** v3: the dice category "special" is now "dash" (same slot position). */
function renameSpecialSlot(m: Obj): void {
  const dice = m.dice;
  if (isObj(dice) && isObj(dice.slots) && 'special' in dice.slots) {
    const slots = { ...dice.slots } as Obj;
    slots.dash = Number(slots.dash ?? 0) + Number(slots.special ?? 0);
    delete slots.special;
    // Keep the slot in the same place in the layout.
    const ordered: Obj = {};
    for (const k of Object.keys(dice.slots)) ordered[k === 'special' ? 'dash' : k] = slots[k === 'special' ? 'dash' : k];
    dice.slots = ordered;
    if (Array.isArray(dice.order)) dice.order = dice.order.map((c) => (c === 'special' ? 'dash' : c));
  }
  const fixTarget = (req: unknown): void => {
    if (!isObj(req)) return;
    if (req.target === 'special') req.target = 'dash';
    if (Array.isArray(req.of)) req.of.forEach(fixTarget);
    else fixTarget(req.of);
  };
  if (isObj(m.special)) fixTarget(m.special.requirement);
}
