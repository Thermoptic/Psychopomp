// POWERUPS section: id, name, type, and only the settings of the chosen type.
// Edits PowerupDef (levels); core/combat/powerups.ts maps them to gameplay.

import type { PowerupDef } from '../core';
import { group, h, row, segmented, slider, textInput } from './dom';
import { MELEE_FIELDS, RANGED_FIELDS, fieldMax, levelMeaning, setPowerupLevel, type ItemEditor } from './model';

const idSanitize = (v: string) => v.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32);

export function powerupForm(ed: ItemEditor<'powerup'>, refresh: () => void, rebuild: () => void): HTMLElement {
  const rules = ed.lib.ruleset;
  const d = ed.draft;
  const edit = (fn: (p: PowerupDef) => void, layout = false) => {
    ed.update(fn);
    if (layout) rebuild();
    else refresh();
  };
  const fields = d.type === 'melee' ? MELEE_FIELDS : RANGED_FIELDS;
  const values = (d[d.type] ?? {}) as Record<string, number>;
  return h(
    'div',
    {},
    group(
      'POWERUP',
      row('ID', textInput(d.id, (v) => edit((p) => (p.id = v)), { sanitize: idSanitize }), 'stable id monsters refer to'),
      row('Name', textInput(d.name, (v) => edit((p) => (p.name = v)))),
      row(
        'Type',
        segmented(
          [
            { value: 'melee', label: 'MELEE' },
            { value: 'ranged', label: 'RANGED' },
          ],
          d.type,
          (v) =>
            edit((p) => {
              p.type = v;
              // Keep the other type's settings (switching back restores them); fill defaults if missing.
              const fresh = ed.lib.newPowerup(v);
              if (!p[v]) (p as unknown as Record<string, unknown>)[v] = fresh[v];
            }, true),
        ),
      ),
    ),
    group(
      d.type === 'melee' ? 'MELEE' : 'RANGED',
      ...fields.map((f) =>
        row(
          f.label,
          slider({
            min: 1,
            max: fieldMax(f.key),
            value: values[f.key] ?? 1,
            meaning: (v) => levelMeaning(d.type, f.key, v, rules),
            onInput: (v) => edit((p) => setPowerupLevel(p, p.type, f.key, v)),
          }),
          f.hint,
        ),
      ),
    ),
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
