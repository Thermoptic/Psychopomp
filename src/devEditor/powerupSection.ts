// POWERUPS section: id, name, duration (Permanent / Limited + time limit),
// type (Melee / Ranged) and only the settings of that type - including the
// optional Charge (hold attack for Charge Time, release to fire this attack).
// Edits PowerupDef (levels); core/combat/powerups.ts maps them to gameplay.

import { powerupMapping as M, type PowerupDef } from '../core';
import { group, h, row, segmented, slider, textInput } from './dom';
import {
  DEFAULT_CHARGE_TIME,
  DEFAULT_TIME_LIMIT,
  MELEE_FIELDS,
  POWERUP_TEXT,
  RANGED_FIELDS,
  fieldDefault,
  levelMeaning,
  powerupLabel,
  setPowerupCharge,
  setPowerupChargeTime,
  setPowerupDuration,
  setPowerupTimeLimit,
  type ItemEditor,
} from './model';
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
  const limited = d.duration === 'limited';
  const charged = d.chargeTime !== undefined;
  // Charge: part of this attack's settings (shown under the melee/ranged sliders).
  const chargeRows = [
    row(
      'Charge',
      h('input', { type: 'checkbox', checked: charged, on: { change: (e: Event) => edit((p) => setPowerupCharge(p, (e.target as HTMLInputElement).checked), true) } }),
      'hold attack to charge, release to fire this attack',
    ),
    charged
      ? row(
          'Charge Time',
          slider({
            min: M.CHARGE_TIME_MIN,
            max: M.CHARGE_TIME_MAX,
            value: d.chargeTime ?? DEFAULT_CHARGE_TIME,
            meaning: (v) => `CHARGE TIME: ${v}s`,
            onInput: (v) => edit((p) => setPowerupChargeTime(p, v)),
          }),
          'seconds attack must be held',
        )
      : null,
    charged ? h('div', { class: 'hint dim', text: POWERUP_TEXT.charge }) : null,
  ];
  return h(
    'div',
    {},
    group(
      'POWERUP',
      row('ID', textInput(d.id, (v) => edit((p) => (p.id = v)), { sanitize: idSanitize }), 'stable id monsters refer to'),
      row('Name', textInput(d.name, (v) => edit((p) => (p.name = v)))),
      row(
        'Duration',
        segmented(
          [
            { value: 'permanent', label: 'PERMANENT' },
            { value: 'limited', label: 'LIMITED' },
          ],
          limited ? 'limited' : 'permanent',
          (v) => edit((p) => setPowerupDuration(p, v), true),
        ),
        limited ? POWERUP_TEXT.limited : POWERUP_TEXT.permanent,
      ),
      limited
        ? row(
            'Time Limit',
            slider({
              min: M.TIME_LIMIT_MIN,
              max: M.TIME_LIMIT_MAX,
              value: d.timeLimit ?? DEFAULT_TIME_LIMIT,
              meaning: (v) => `TIME LIMIT: ${v}s`,
              onInput: (v) => edit((p) => setPowerupTimeLimit(p, v)),
            }),
            'seconds active after activation (Powerup button: Left Trigger / SPECIAL)',
          )
        : null,
      row('Type', weaponTypeSelector(d.type, (t) => edit((p) => setWeaponType(p, t), true))),
    ),
    weaponSettingsGroup(d, rules, (fn) => edit((p) => fn(p)), chargeRows),
    h('div', { class: 'hint dim', text: `A monster with this Powerup equipped uses it instead of its own attack${limited ? ' while it is active' : ''}.` }),
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
    h('div', { class: 'sub', text: `${powerupLabel(d).toUpperCase()} · ${origin}${ed.dirty ? ' · UNSAVED' : ''}` }),
    h(
      'table',
      {},
      ...fields.map((f) => h('tr', {}, h('td', { class: 'k', text: `${f.label} ${values[f.key] ?? '-'}` }), h('td', { text: levelMeaning(d.type, f.key, values[f.key] ?? fieldDefault(f.key), rules) }))),
      d.chargeTime !== undefined ? h('tr', {}, h('td', { class: 'k', text: 'Charge' }), h('td', { text: `${d.chargeTime}s hold` })) : null,
    ),
    h('div', { class: 'sub', text: '' }),
    h('div', { class: 'dim', text: users.length ? `Used by: ${users.join(', ')}` : 'Not used by any monster yet' }),
    d.type === 'ranged' ? h('div', { class: 'hint faint', text: 'Trajectory only curves shots fired while moving. Rate of fire and Auto Fire (monster) work together.' }) : null,
  );
}
