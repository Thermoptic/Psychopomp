// Shared melee/ranged settings editor, used by both the MONSTERS (the
// monster's own attack) and POWERUPS sections. Edits WeaponSettings.

import { defaultWeaponSettings } from '../content/library';
import type { Ruleset, WeaponSettings } from '../core';
import { group, h, row, segmented, slider } from './dom';
import { MELEE_FIELDS, RANGED_FIELDS, fieldDefault, fieldMax, fieldMin, levelMeaning, setWeaponLevel } from './model';

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

/** The sliders of the active type only (MELEE: 3, RANGED: 8), plus any `extra` rows (e.g. a Powerup's Charge). */
export function weaponSettingsGroup(w: WeaponSettings, rules: Ruleset, edit: (fn: (w: WeaponSettings) => void) => void, extra: Array<HTMLElement | null> = []): HTMLElement | null {
  const type = w.type;
  if (!type) return null;
  const fields = type === 'melee' ? MELEE_FIELDS : RANGED_FIELDS;
  const values = (w[type] ?? {}) as Record<string, number>;
  // Projectile colour: a picker, or the owner's colour (none stored).
  const colour = type === 'ranged' ? w.ranged?.color : undefined;
  const setColour = (c: string | undefined) =>
    edit((x) => {
      const r = { ...(x.ranged as NonNullable<WeaponSettings['ranged']>) };
      if (c) r.color = c;
      else delete r.color;
      x.ranged = r;
    });
  const colourRow =
    type === 'ranged'
      ? row(
          'Color',
          h(
            'div',
            { class: 'pos-line' },
            h('input', { type: 'color', value: colour ?? '#ffffff', on: { input: (e: Event) => setColour((e.target as HTMLInputElement).value) } }),
            h('span', { text: colour ? colour.toUpperCase() : 'player colour  ' }),
            colour ? h('button', { type: 'button', class: 'btn', text: 'PLAYER COLOUR', on: { click: () => setColour(undefined) } }) : null,
          ),
          'projectile and trail colour (default: the owner\'s colour)',
        )
      : null;
  return group(
    type === 'melee' ? 'MELEE' : 'RANGED',
    ...fields.map((f) =>
      row(
        f.label,
        slider({
          min: fieldMin(f.key),
          max: fieldMax(f.key),
          value: values[f.key] ?? fieldDefault(f.key),
          meaning: (v) => levelMeaning(type, f.key, v, rules),
          onInput: (v) => edit((x) => setWeaponLevel(x, type, f.key, v)),
        }),
        f.hint,
      ),
    ),
    colourRow,
    ...extra,
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
    return `RANGED · ${levelMeaning('ranged', 'speed', r.speed, rules)} · ${levelMeaning('ranged', 'range', r.range, rules)} · ${levelMeaning('ranged', 'rateOfFire', r.rateOfFire, rules)} · Power dmg`;
  }
  return w.type;
}

