// Shared melee/ranged settings editor, used by both the MONSTERS (the
// monster's own attack) and POWERUPS sections. Edits WeaponSettings.

import { defaultWeaponSettings } from '../content/library';
import type { Ruleset, WeaponSettings } from '../core';
import { group, row, segmented, slider } from './dom';
import { MELEE_FIELDS, RANGED_FIELDS, fieldMax, levelMeaning, setWeaponLevel } from './model';

/** Switches the weapon type, keeping both settings blocks (switching back restores them). */
export function setWeaponType(w: WeaponSettings, type: 'melee' | 'ranged'): void {
  w.type = type;
  const defaults = defaultWeaponSettings();
  if (!w.melee) w.melee = defaults.melee;
  if (!w.ranged) w.ranged = defaults.ranged;
}

export function weaponTypeSelector(type: 'melee' | 'ranged' | undefined, onChange: (t: 'melee' | 'ranged') => void): HTMLElement {
  return segmented(
    [
      { value: 'melee', label: 'MELEE' },
      { value: 'ranged', label: 'RANGED' },
    ],
    (type ?? '') as 'melee' | 'ranged',
    onChange,
  );
}

/** The sliders of the active type only (MELEE: 3, RANGED: 8). */
export function weaponSettingsGroup(w: WeaponSettings, rules: Ruleset, edit: (fn: (w: WeaponSettings) => void) => void): HTMLElement | null {
  const type = w.type;
  if (!type) return null;
  const fields = type === 'melee' ? MELEE_FIELDS : RANGED_FIELDS;
  const values = (w[type] ?? {}) as Record<string, number>;
  return group(
    type === 'melee' ? 'MELEE' : 'RANGED',
    ...fields.map((f) =>
      row(
        f.label,
        slider({
          min: 1,
          max: fieldMax(f.key),
          value: values[f.key] ?? 1,
          meaning: (v) => levelMeaning(type, f.key, v, rules),
          onInput: (v) => edit((x) => setWeaponLevel(x, type, f.key, v)),
        }),
        f.hint,
      ),
    ),
  );
}

/** One-line summary for previews, e.g. "RANGED · 20 u/tick · 12 cells · 1.0 s". */
export function weaponSummary(w: WeaponSettings | undefined, rules: Ruleset): string {
  if (!w?.type) return 'classic melee';
  if (w.type === 'melee' && w.melee) {
    const m = w.melee;
    return `MELEE · ${levelMeaning('melee', 'speed', m.speed, rules)} · ${levelMeaning('melee', 'range', m.range, rules)} · kb ${levelMeaning('melee', 'knockback', m.knockback, rules)}`;
  }
  if (w.type === 'ranged' && w.ranged) {
    const r = w.ranged;
    return `RANGED · ${levelMeaning('ranged', 'speed', r.speed, rules)} · ${levelMeaning('ranged', 'range', r.range, rules)} · ${levelMeaning('ranged', 'rateOfFire', r.rateOfFire, rules)} · ${r.impactDamage} dmg`;
  }
  return w.type;
}

