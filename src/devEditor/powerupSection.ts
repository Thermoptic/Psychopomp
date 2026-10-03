// POWERUPS section: id, name, duration (Permanent / Limited + time limit),
// type (Melee / Ranged / Charge Attack) and only the settings of that type.
// Edits PowerupDef (levels); core/combat/powerups.ts maps them to gameplay.

import { powerupMapping as M, type PowerupDef, type WeaponSettings } from '../core';
import { group, h, row, segmented, selectBox, slider, textInput } from './dom';
import {
  DEFAULT_CHARGE_TIME,
  DEFAULT_TIME_LIMIT,
  MELEE_FIELDS,
  POWERUP_TEXT,
  POWERUP_TYPES,
  RANGED_FIELDS,
  fieldDefault,
  levelMeaning,
  powerupLabel,
  setPowerupChargeTime,
  setPowerupDuration,
  setPowerupTimeLimit,
  setPowerupType,
  type ItemEditor,
} from './model';
import { weaponSettingsGroup } from './weaponFields';

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
  const typeIndex = Math.max(0, POWERUP_TYPES.findIndex((t) => t.value === d.type));
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
      row(
        'Type',
        selectBox(
          POWERUP_TYPES.map((t) => t.label),
          typeIndex,
          (i) => edit((p) => setPowerupType(p, POWERUP_TYPES[i].value), true),
        ),
      ),
    ),
    d.type === 'chargeAttack'
      ? group(
          'CHARGE ATTACK',
          row(
            'Charge Time',
            slider({
              min: M.CHARGE_TIME_MIN,
              max: M.CHARGE_TIME_MAX,
              value: d.chargeTime ?? DEFAULT_CHARGE_TIME,
              meaning: (v) => `CHARGE TIME: ${v}s`,
              onInput: (v) => edit((p) => setPowerupChargeTime(p, v)),
            }),
            'seconds attack must be held',
          ),
          h('div', { class: 'hint dim', text: POWERUP_TEXT.chargeAttack }),
          h('div', { class: 'hint faint', text: "The attack itself is the monster's own attack (MONSTERS -> ATTACK): Melee or Ranged with all its settings." }),
        )
      : weaponSettingsGroup(d as WeaponSettings, rules, (fn) => edit((p) => fn(p as WeaponSettings))),
    h('div', {
      class: 'hint dim',
      text:
        d.type === 'chargeAttack'
          ? 'A monster with this Powerup keeps its own attack, which must be charged.'
          : `A monster with this Powerup equipped uses it instead of its own attack${limited ? ' while it is active' : ''}.`,
    }),
  );
}

export function powerupPreview(ed: ItemEditor<'powerup'>): HTMLElement {
  const d = ed.draft;
  const rules = ed.lib.ruleset;
  const users = ed.originalId ? ed.lib.monstersUsing(ed.originalId).map((m) => m.name) : [];
  const origin = ed.originalId === null ? 'NEW' : ed.origin() === 'base' ? 'BASE' : ed.origin() === 'modified' ? 'MODIFIED BASE' : 'CUSTOM';
  const weaponType = d.type === 'chargeAttack' ? null : d.type;
  const fields = weaponType === 'melee' ? MELEE_FIELDS : RANGED_FIELDS;
  const values = (weaponType ? (d[weaponType] ?? {}) : {}) as Record<string, number>;
  return h(
    'div',
    {},
    h('div', { class: 'name', text: d.name || '?' }),
    h('div', { class: 'sub', text: `${powerupLabel(d).toUpperCase()} · ${origin}${ed.dirty ? ' · UNSAVED' : ''}` }),
    weaponType
      ? h(
          'table',
          {},
          ...fields.map((f) =>
            h('tr', {}, h('td', { class: 'k', text: `${f.label} ${values[f.key] ?? '-'}` }), h('td', { text: levelMeaning(weaponType, f.key, values[f.key] ?? fieldDefault(f.key), rules) })),
          ),
        )
      : h('table', {}, h('tr', {}, h('td', { class: 'k', text: 'Charge Time' }), h('td', { text: `${d.chargeTime ?? DEFAULT_CHARGE_TIME}s` }))),
    h('div', { class: 'sub', text: '' }),
    h('div', { class: 'dim', text: users.length ? `Used by: ${users.join(', ')}` : 'Not used by any monster yet' }),
    weaponType === 'ranged' ? h('div', { class: 'hint faint', text: 'Trajectory only curves shots fired while moving. Rate of fire and Auto Fire (monster) work together.' }) : null,
  );
}
