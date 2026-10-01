// MONSTERS section: identity, health, player, 9×9 position, start modifiers,
// Special slot conditions, Powerup reference, behaviour. Edits CreatureDef.

import { baseBattleStats, cellCode, describeRequirement, parseCell, type CreatureDef, type Effect, type SlotCondition } from '../core';
import { resolveDash } from '../core/combat/simulation';
import { drawCreature } from '../rendering/sprites';
import { boardGrid, group, h, row, segmented, selectBox, slider, textInput } from './dom';
import { setWeaponType, weaponSettingsGroup, weaponSummary, weaponTypeSelector } from './weaponFields';
import {
  MODIFIER_KEYS,
  SLOT_OPTIONS,
  modifier,
  setModifier,
  setSlotCondition,
  slotCategories,
  slotConditions,
  slotOptionIndex,
  type ItemEditor,
  MOVE_PRESETS,
  PATTERN_RADIUS,
  defaultReach,
  isPatternMovement,
  movementLabel,
  patternCells,
  setDefaultMovement,
  setPatternMovement,
  toggleMovementCell,
} from './model';

const idSanitize = (v: string) => v.toLowerCase().replace(/\s/g, '_').replace(/[^a-z0-9_]/g, '').slice(0, 32);
const EFFECTS: Array<Exclude<Effect['type'], 'multi'>> = ['addPower', 'addShield', 'addSpeed', 'addBlock', 'addDash'];
const EFFECT_LABELS = ['+ Power', '+ Shield', '+ Speed', '+ Block', '+ Dash'];
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function monsterForm(ed: ItemEditor<'monster'>, refresh: () => void, rebuild: () => void): HTMLElement {
  const lib = ed.lib;
  const rules = lib.ruleset;
  const d = ed.draft;
  const edit = (fn: (m: CreatureDef) => void, layout = false) => {
    ed.update(fn);
    if (layout) rebuild();
    else refresh();
  };

  // --- identity / health / player -------------------------------------------------------------
  const identity = group(
    'IDENTITY',
    row('ID', textInput(d.id, (v) => edit((m) => (m.id = v)), { sanitize: idSanitize }), 'stable id: a-z, 0-9, _'),
    row('Name', textInput(d.name, (v) => edit((m) => (m.name = v)))),
  );
  const health = group(
    'HEALTH',
    row('Starting Health', slider({ min: 1, max: 100, numberMax: 999, value: d.stats.maxHp, meaning: (v) => `${v} HP`, onInput: (v) => edit((m) => (m.stats.maxHp = Math.max(1, Math.min(999, Math.round(v))))) })),
  );
  const player = group(
    'PLAYER',
    row(
      'Side',
      segmented(
        [
          { value: 'P1', label: 'P1', cls: 'p1' },
          { value: 'P2', label: 'P2', cls: 'p2' },
        ],
        d.player ?? 'P1',
        (v) => edit((m) => (m.player = v), true),
      ),
    ),
  );

  // --- 9×9 position ---------------------------------------------------------------------------
  const board = lib.board;
  const taken = new Map<string, { owner: string; who: string }>();
  for (const p of board.placements) taken.set(cellCode(p), { owner: p.owner, who: `board lineup (${p.creature})` });
  for (const m of lib.creatures()) {
    if (m.id === ed.originalId || !m.player || !m.position) continue;
    taken.set(m.position.toUpperCase(), { owner: m.player, who: m.name });
  }
  const pps = new Set(board.powerPoints.map((p) => cellCode(p)));
  const selected = d.position ? cellCode(parseCell(d.position) ?? { x: -1, y: -1 }) : null;
  const grid = boardGrid(board.width, board.height, (x, y) => {
    const code = cellCode({ x, y });
    const t = taken.get(code);
    const isSel = code === selected;
    return {
      cls: `${isSel ? `sel ${(d.player ?? 'P1').toLowerCase()}` : ''} ${t ? `taken ${t.owner.toLowerCase()}` : ''} ${pps.has(code) ? 'pp' : ''}`,
      text: pps.has(code) && !isSel ? '◆' : code,
      title: t ? `${code}: ${t.who}` : pps.has(code) ? `${code}: Power Point` : code,
      disabled: !!t,
      onClick: () => edit((m) => ((m.position = code), (m.player = m.player ?? 'P1')), true),
    };
  });
  const position = group(
    'POSITION',
    grid,
    h(
      'div',
      { class: 'pos-line' },
      h('span', { text: `Position: ${selected ?? 'None (not placed)'}  ` }),
      selected ? h('button', { type: 'button', class: 'btn', text: 'CLEAR', on: { click: () => edit((m) => delete m.position, true) } }) : null,
    ),
    h('div', { class: 'hint dim', text: 'A1 top-left · E5 centre · I9 bottom-right. Outlined cells are taken (hover for who).' }),
  );

  // --- movement: DEFAULT (N cardinal steps) or a pattern of relative cells ---------------------------
  const R = PATTERN_RADIUS;
  const isPattern = isPatternMovement(d);
  const cells = new Set(patternCells(d).map((c) => `${c.x},${c.y}`));
  const reach = new Set(defaultReach(d.stats.movement).map((c) => `${c.x},${c.y}`));
  const patternOptions = [`DEFAULT — ${d.stats.movement} steps`, 'CUSTOM PATTERN', ...MOVE_PRESETS.map((p) => p.label)];
  const label = movementLabel(d);
  const selectedOption = !isPattern ? 0 : Math.max(1, MOVE_PRESETS.findIndex((p) => p.label.startsWith(label + ' ')) + 2);
  const moveGrid = boardGrid(2 * R + 1, 2 * R + 1, (gx, gy) => {
    const x = gx - R;
    const y = gy - R;
    const code = cellCode({ x: gx, y: gy });
    if (x === 0 && y === 0) return { text: 'M', cls: `me ${(d.player ?? 'P1').toLowerCase()}`, title: `${code}: the monster (reference point)`, disabled: true };
    const rel = `${x >= 0 ? '+' : ''}${x}, ${y >= 0 ? '+' : ''}${y}`;
    if (!isPattern) return { cls: reach.has(`${x},${y}`) ? 'reach' : '', text: reach.has(`${x},${y}`) ? '·' : '', title: `${code} (${rel})`, disabled: true };
    const on = cells.has(`${x},${y}`);
    return { cls: on ? 'mv' : '', text: on ? '■' : '', title: `${code} (${rel})`, onClick: () => edit((m) => toggleMovementCell(m, x, y), true) };
  });
  const movement = group(
    'MOVEMENT',
    row(
      'Pattern',
      selectBox(patternOptions, selectedOption, (i) =>
        edit((m) => {
          if (i === 0) setDefaultMovement(m);
          // CUSTOM starts from what the monster can do now; presets fill their pattern.
          else if (i === 1) setPatternMovement(m, isPatternMovement(m) ? patternCells(m) : defaultReach(m.stats.movement));
          else setPatternMovement(m, MOVE_PRESETS[i - 2].cells());
        }, true),
      ),
    ),
    !isPattern
      ? h(
          'div',
          {},
          row(
            'Steps',
            h('input', { type: 'number', min: '1', max: '20', value: String(d.stats.movement), on: { input: (e: Event) => edit((m) => (m.stats.movement = Math.max(1, Math.min(20, Math.round(Number((e.target as HTMLInputElement).value) || 1))))) } }),
            'steps per move, up/down/left/right (a path around obstacles)',
          ),
          h('div', { class: 'hint dim', text: `DEFAULT: ${d.stats.movement} steps in all cardinal directions. Preview on an empty board:` }),
        )
      : h('div', { class: 'hint dim', text: `${cells.size} destination${cells.size === 1 ? '' : 's'}. Click cells to toggle movement destinations. Straight and diagonal lines need a clear path; other cells are jumps.` }),
    moveGrid,
    isPattern && cells.size === 0 ? h('div', { class: 'note', text: 'No destinations: this monster cannot move on the board.' }) : null,
    isPattern ? h('button', { type: 'button', class: 'btn', text: 'CLEAR PATTERN', on: { click: () => edit((m) => setPatternMovement(m, []), true) } }) : null,
  );

  // --- start modifiers ------------------------------------------------------------------------
  const base = rules.creatureBase;
  const modRows = MODIFIER_KEYS.map((k) =>
    row(
      k[0].toUpperCase() + k.slice(1),
      slider({
        min: -10,
        max: 10,
        numberMin: -99,
        numberMax: 99,
        value: modifier(d, k),
        meaning: (v) => (k === 'dash' ? `${signed(v)} → +${Math.max(0, base.dash + v) * rules.combat.dash.distancePerPoint} cells` : `${signed(v)} → ${Math.max(0, base[k] + v)}`),
        onInput: (v) => edit((m) => setModifier(m, k, v)),
      }),
    ),
  );
  const baseIsZero = base.power === 0 && base.speed === 0 && base.shield === 0 && base.block === 0 && base.dash === 0;
  const modifiers = group(
    'START MODIFIERS',
    h('div', {
      class: 'hint dim',
      text: baseIsZero
        ? `Everything starts at 0: the dice placed in battle give the values (a 6 on POWER = Power 6; a die on DASH = ${rules.combat.dash.distancePerPoint} cell of dash per pip). A modifier adds to that.`
        : `Added to the ruleset base (Power ${base.power}, Speed ${base.speed}, Shield ${base.shield}, Block ${base.block}) before dice.`,
    }),
    ...modRows,
  );

  // --- Special --------------------------------------------------------------------------------
  const count = rules.dice.count;
  const cats = slotCategories(d);
  const { slots, legacy } = slotConditions(d, count);
  const slotEls = h(
    'div',
    { class: 'slots' },
    ...slots.map((c, i) =>
      h(
        'div',
        {},
        h('label', { text: `SLOT ${i + 1} · ${(cats[i] ?? '-').toUpperCase()}` }),
        selectBox(
          SLOT_OPTIONS.map((o) => o.label),
          Math.max(0, slotOptionIndex(c)),
          (idx) => edit((m) => setSlotCondition(m, i, SLOT_OPTIONS[idx].value as SlotCondition | null, count), true),
        ),
      ),
    ),
  );
  const sp = d.special;
  const special = group(
    'SPECIAL',
    legacy ? h('div', { class: 'note', text: `Uses an older trigger (${describeRequirement(sp!.requirement)}). Setting a slot replaces it.` }) : null,
    slotEls,
    h('div', { class: 'hint dim', text: 'Slot N checks the die placed in the monster\'s Nth dice slot. None = not used. All used slots must match; with no slot set the Special never triggers.' }),
    sp
      ? h(
          'div',
          {},
          row('Name', textInput(sp.name, (v) => edit((m) => m.special && (m.special.name = v)))),
          sp.effect.type === 'multi'
            ? row('Effect', h('span', { class: 'dim', text: 'combined effect (edit as JSON)' }))
            : row(
                'Effect',
                h(
                  'div',
                  { class: 'slider' },
                  selectBox(EFFECT_LABELS, Math.max(0, EFFECTS.indexOf(sp.effect.type)), (i) =>
                    edit((m) => m.special && m.special.effect.type !== 'multi' && (m.special.effect = { type: EFFECTS[i], value: m.special.effect.value })),
                  ),
                  h('input', {
                    type: 'number',
                    min: '-99',
                    max: '99',
                    value: String(sp.effect.value),
                    on: { input: (e: Event) => edit((m) => m.special && m.special.effect.type !== 'multi' && (m.special.effect = { ...m.special.effect, value: Math.round(Number((e.target as HTMLInputElement).value) || 0) })) },
                  }),
                ),
              ),
          row(
            'Activation',
            selectBox(['Auto (when READY)', 'Manual (Left Trigger)'], sp.activation === 'manual' ? 1 : 0, (i) => edit((m) => m.special && (m.special.activation = i ? 'manual' : 'auto'))),
          ),
        )
      : null,
  );

  // --- Attack: the monster's own melee/ranged weapon ------------------------------------------
  const pus = lib.powerups();
  const equipped = d.powerupId ? pus.find((p) => p.id === d.powerupId) : undefined;
  const attackEdit = (fn: (w: NonNullable<CreatureDef['attack']>) => void, layout = false) =>
    edit((m) => {
      m.attack = { ...(m.attack ?? {}) };
      fn(m.attack);
    }, layout);
  const autoFire = h('input', { type: 'checkbox', checked: d.attack?.autoFire === true, on: { change: (e: Event) => attackEdit((a) => (a.autoFire = (e.target as HTMLInputElement).checked)) } });
  const attack = group(
    'ATTACK',
    row('Type', weaponTypeSelector(d.attack?.type, (t) => attackEdit((a) => setWeaponType(a, t), true)), 'choose first, then its settings'),
    d.attack?.type
      ? null
      : h('div', { class: 'note', text: `Classic attack (not configured): cooldown from the Speed stat, reach ${(rules.combat.attackRange / rules.combat.cellUnits).toFixed(1)} cells, no knockback. Choose MELEE or RANGED to configure it.` }),
    weaponSettingsGroup(d.attack ?? {}, rules, (fn) => attackEdit((a) => fn(a))),
    row('Auto Fire', autoFire, 'keep attacking while Right Trigger is held'),
    equipped ? h('div', { class: 'note', text: `Powerup "${equipped.name}" is equipped and replaces this attack in combat.` }) : null,
  );

  // --- Powerup ---------------------------------------------------------------------------------
  const powerup = group(
    'POWERUP',
    row(
      'Powerup',
      selectBox(['None (use own attack)', ...pus.map((p) => `${p.name} · ${p.type}`)], d.powerupId ? pus.findIndex((p) => p.id === d.powerupId) + 1 : 0, (i) =>
        edit((m) => (m.powerupId = i === 0 ? null : pus[i - 1].id), true),
      ),
      'stored as the Powerup id, never a copy; replaces the own attack',
    ),
  );

  // --- behaviour / advanced --------------------------------------------------------------------
  const dashNum = (key: 'distance' | 'cooldown' | 'damage', step: number) =>
    h('input', {
      type: 'number',
      step: String(step),
      min: '0',
      placeholder: `default ${rules.combat.dash[key]}`,
      value: d.dash?.[key] === undefined ? '' : String(d.dash[key]),
      on: {
        input: (e: Event) =>
          edit((m) => {
            const raw = (e.target as HTMLInputElement).value;
            const next = { ...(m.dash ?? {}) };
            if (raw === '') delete next[key];
            else next[key] = Number(raw);
            if (Object.keys(next).length) m.dash = next;
            else delete m.dash;
          }),
      },
    });
  const behaviour = group(
    'BEHAVIOUR',
    h(
      'details',
      {},
      h('summary', { text: 'Advanced dash (overrides the ruleset; empty = default)' }),
      row('Base dash cells', dashNum('distance', 0.5)),
      row('Dash cooldown s', dashNum('cooldown', 0.5)),
      row('Dash damage', dashNum('damage', 1)),
      row('Hit on dash', h('input', { type: 'checkbox', checked: d.dash?.dealsDamage === true, on: { change: (e: Event) => edit((m) => (m.dash = { ...(m.dash ?? {}), dealsDamage: (e.target as HTMLInputElement).checked })) } })),
    ),
  );

  return h('div', {}, identity, health, player, position, movement, modifiers, attack, powerup, special, behaviour);
}

export function monsterPreview(ed: ItemEditor<'monster'>): HTMLElement {
  const d = ed.draft;
  const rules = ed.lib.ruleset;
  const canvas = h('canvas', { width: 110, height: 110 });
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    // Placeholder art is generated from the monster id (no art files yet).
    drawCreature(ctx, d.id || '?', d.player ?? 'P1', 55, 55, 9);
  }
  const stats = baseBattleStats(d, rules);
  const pu = d.powerupId ? ed.lib.get('powerup', d.powerupId)?.item : undefined;
  const dashPts = stats.dash;
  const tr = (k: string, v: string) => h('tr', {}, h('td', { class: 'k', text: k }), h('td', { text: v }));
  const mod = (k: 'power' | 'speed' | 'shield' | 'block') => `${stats[k]} (${signed(modifier(d, k))})`;
  const origin = ed.originalId === null ? 'NEW' : ed.origin() === 'base' ? 'BASE' : ed.origin() === 'modified' ? 'MODIFIED BASE' : 'CUSTOM';
  return h(
    'div',
    {},
    canvas,
    h('div', { class: 'name', text: d.name || '?' }),
    h('div', { class: 'sub', text: `${origin}${ed.dirty ? ' · UNSAVED' : ''}` }),
    h(
      'table',
      {},
      tr('Player', d.player ?? '-'),
      tr('Position', d.position ? d.position.toUpperCase() : d.id && ed.lib.board.placements.some((p) => p.creature === d.id) ? 'board lineup' : 'not placed'),
      tr('HP', String(d.stats.maxHp)),
      tr('Movement', movementLabel(d)),
      tr('Power', mod('power')),
      tr('Speed', mod('speed')),
      tr('Shield', mod('shield')),
      tr('Block', mod('block')),
      tr('Dash', `die × ${rules.combat.dash.distancePerPoint} cells${dashPts ? ` +${resolveDash(d, rules.combat, dashPts).distance}` : ''} (${signed(modifier(d, 'dash'))})`),
      tr('Attack', weaponSummary(d.attack, rules)),
      tr('Powerup', pu ? `${pu.name} (${pu.type}) - replaces attack` : 'none'),
      tr('Auto Fire', d.attack?.autoFire ? 'yes' : 'no'),
      tr('Special', d.special ? `${d.special.name} · ${d.special.activation === 'manual' ? 'LT' : 'auto'}` : 'none'),
      tr('Trigger', d.special ? describeRequirement(d.special.requirement) : '-'),
    ),
  );
}
