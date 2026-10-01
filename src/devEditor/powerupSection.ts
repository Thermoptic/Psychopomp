// POWERUPS section: id, name, type, and only the settings of the chosen type.
// Edits PowerupDef (levels); core/combat/powerups.ts maps them to gameplay.

import type { PowerupDef } from '../core';
import { group, h, row, textInput } from './dom';
import { MELEE_FIELDS, RANGED_FIELDS, levelMeaning, type ItemEditor } from './model';
import { setWeaponType, weaponSettingsGroup, weaponTypeSelector } from './weaponFields';

const idSanitize = (v: string) => v.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32);

export function powerupForm(ed: ItemEditor<'powerup'>, refresh: () => void, rebuild: () => void): HTMLElement {
  const rules = ed.lib.ruleset;
  const d = ed.draft;
  const edit = (fn: (p: PowerupDef) => void, layout = false) => {
    ed.update(fn);
    if (layout) rebuild();
    else refresh();
  };
  return h(
    'div',
    {},
    group(
      'POWERUP',
      row('ID', textInput(d.id, (v) => edit((p) => (p.id = v)), { sanitize: idSanitize }), 'stable id monsters refer to'),
      row('Name', textInput(d.name, (v) => edit((p) => (p.name = v)))),
      row('Type', weaponTypeSelector(d.type, (t) => edit((p) => setWeaponType(p, t), true))),
    ),
    weaponSettingsGroup(d, rules, (fn) => edit((p) => fn(p))),
    h('div', { class: 'hint dim', text: 'A monster with this Powerup equipped uses it instead of its own attack.' }),
  );
}

export function powerupPreview(ed: ItemEditor<'powerup'>): HTMLElement {
  const d = ed.draft;
  const rules = ed.lib.ruleset;
  const fields = d.type === 'melee' ? MELEE_FIELDS : RANGED_FIELDS;
  const values = (d[d.type] ?? {}) as Record<string, number>;
  const users = ed.originalId ? ed.lib.monstersUsing(ed.originalId).map((m) => m.name) : [];
  const origin = ed.originalId === null ? 'NEW' : ed.origin() === 'base' ? 'BASE' : ed.origin() === 'modified' ? 'MODIFIED BASE' : 'CUSTOM';
  return h(
    'div',
    {},
    h('div', { class: 'name', text: d.name || '?' }),
    h('div', { class: 'sub', text: `${d.type.toUpperCase()} · ${origin}${ed.dirty ? ' · UNSAVED' : ''}` }),
    h('table', {}, ...fields.map((f) => h('tr', {}, h('td', { class: 'k', text: `${f.label} ${values[f.key] ?? '-'}` }), h('td', { text: levelMeaning(d.type, f.key, values[f.key] ?? 1, rules) })))),
    h('div', { class: 'sub', text: '' }),
    h('div', { class: 'dim', text: users.length ? `Used by: ${users.join(', ')}` : 'Not used by any monster yet' }),
    d.type === 'ranged' ? h('div', { class: 'hint faint', text: 'Trajectory only curves shots fired while moving. Rate of fire and Auto Fire (monster) work together.' }) : null,
  );
}
