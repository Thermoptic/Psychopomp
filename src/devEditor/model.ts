// Developer editor logic (no DOM): a generic draft editor per content kind plus
// helpers that edit monster/powerup data. Everything edits the game's own
// definitions (CreatureDef / PowerupDef) through the ContentLibrary, so what
// is saved here is exactly what the game core plays with.

import type { ContentKind, ContentLibrary, Entry } from '../content/library';
import { DEFAULT_CATEGORIES } from '../core/types';
import { defaultSpecial } from '../content/library';
import { MOVE_PRESETS, PATTERN_RADIUS, isPatternMovement, patternCells } from '../core/board/movementPresets';
import { powerupMapping as M, type Cell, type CreatureDef, type PowerupDef, type PowerupDuration, type Ruleset, type SlotCondition, type WeaponSettings } from '../core';

type ItemOf<K extends ContentKind> = K extends 'monster' ? CreatureDef : PowerupDef;

/** Draft editing for one content kind: select, new, duplicate, edit, save, revert, delete, export, import. */
export class ItemEditor<K extends ContentKind> {
  draft: ItemOf<K>;
  /** Id the draft was loaded/saved under; null = new and never saved. */
  originalId: string | null = null;
  dirty = false;

  constructor(
    readonly lib: ContentLibrary,
    readonly kind: K,
  ) {
    const first = lib.entries(kind)[0];
    this.draft = first ? structuredClone(first.item) : this.blank();
    this.originalId = first ? first.item.id : null;
  }

  private blank(): ItemOf<K> {
    return (this.kind === 'monster' ? this.lib.newMonster() : this.lib.newPowerup()) as ItemOf<K>;
  }

  list(): Entry<ItemOf<K>>[] {
    return this.lib.entries(this.kind);
  }

  origin() {
    return this.originalId ? this.lib.get(this.kind, this.originalId)?.origin ?? null : null;
  }

  errors(): string[] {
    return this.lib.validate(this.kind, this.draft, this.originalId);
  }

  select(id: string): boolean {
    const e = this.lib.get(this.kind, id);
    if (!e) return false;
    this.draft = structuredClone(e.item);
    this.originalId = id;
    this.dirty = false;
    return true;
  }

  newItem(): void {
    this.draft = this.blank();
    this.originalId = null;
    this.dirty = true;
  }

  duplicate(): void {
    const ids = new Set(this.list().map((e) => e.item.id));
    let id = `${this.draft.id}_copy`;
    for (let n = 2; ids.has(id); n++) id = `${this.draft.id}_copy${n}`;
    const copy = structuredClone(this.draft) as ItemOf<K> & { position?: string };
    copy.id = id;
    copy.name = `${this.draft.name} Copy`;
    if (this.kind === 'monster') delete copy.position; // a copy cannot share the same board cell
    this.draft = copy;
    this.originalId = null;
    this.dirty = true;
  }

  /** Applies an edit to a copy of the draft. */
  update(edit: (draft: ItemOf<K>) => void): void {
    const next = structuredClone(this.draft);
    edit(next);
    if (JSON.stringify(next) !== JSON.stringify(this.draft)) {
      this.draft = next;
      this.dirty = true;
    }
  }

  save(): { ok: true } | { ok: false; errors: string[] } {
    const r = this.lib.saveItem(this.kind, this.draft, this.originalId);
    if (!r.ok) return r;
    this.draft = structuredClone(r.item);
    this.originalId = r.item.id;
    this.dirty = false;
    return { ok: true };
  }

  revert(): void {
    if (this.originalId && this.select(this.originalId)) return;
    this.newItem();
    this.dirty = false;
  }

  /** Deletes a custom item or restores a modified base item. */
  remove(): { ok: true; restored: boolean } | { ok: false; error: string } {
    if (!this.originalId) {
      this.revert();
      return { ok: true, restored: false };
    }
    const id = this.originalId;
    const r = this.lib.removeItem(this.kind, id);
    if (!r.ok) return r;
    const first = this.list()[0];
    if (first) this.select(first.item.id);
    else this.newItem();
    return { ok: true, restored: false };
  }

  exportText(): { ok: true; filename: string; text: string } | { ok: false; error: string } {
    const errors = this.errors();
    if (errors.length) return { ok: false, error: errors[0] };
    return { ok: true, filename: `${this.draft.id}.psychopomp-${this.kind}.json`, text: this.lib.serialize(this.kind, this.draft) };
  }

  /** Loads a parsed item of this kind as an unsaved draft (saving replaces an item with the same id). */
  load(item: ItemOf<K>): void {
    this.draft = structuredClone(item);
    this.originalId = this.lib.get(this.kind, item.id) ? item.id : null;
    this.dirty = true;
  }
}

// --- monsters -----------------------------------------------------------------------

export const MODIFIER_KEYS = ['speed', 'power', 'shield', 'dash', 'block'] as const;
export type ModifierKey = (typeof MODIFIER_KEYS)[number];

/** Slot dropdown options, in display order. */
export const SLOT_OPTIONS: Array<{ label: string; value: SlotCondition | null }> = [
  { label: 'None', value: null },
  { label: 'ODD', value: 'odd' },
  { label: 'EVEN', value: 'even' },
  ...[1, 2, 3, 4, 5, 6].map((n) => ({ label: String(n), value: n })),
];

export function slotOptionIndex(c: SlotCondition | null): number {
  return SLOT_OPTIONS.findIndex((o) => o.value === c);
}

/** The creature's dice slots in layout order (slot i = Special trigger slot i). */
export function slotCategories(def: CreatureDef): string[] {
  const order = def.dice.order ?? [...DEFAULT_CATEGORIES];
  const cats = [...order.filter((c) => (def.dice.slots[c] ?? 0) > 0), ...Object.keys(def.dice.slots).filter((c) => !order.includes(c) && def.dice.slots[c] > 0)];
  return cats.flatMap((c) => new Array(def.dice.slots[c]).fill(c));
}

/**
 * Per-slot Special conditions of a monster. Older requirement types that only
 * look at one category slot (e.g. "SPECIAL: ALL ODD") are shown as that slot's
 * condition; anything more complex is reported as `legacy`.
 */
export function slotConditions(def: CreatureDef, count: number): { slots: Array<SlotCondition | null>; legacy: boolean } {
  const empty = new Array(count).fill(null) as Array<SlotCondition | null>;
  const req = def.special?.requirement;
  if (!req) return { slots: empty, legacy: false };
  if (req.type === 'slots') return { slots: [...req.slots, ...empty].slice(0, count), legacy: false };
  const cats = slotCategories(def);
  if ((req.type === 'allOdd' || req.type === 'allEven') && req.target && req.target !== 'all') {
    const idx = cats.map((c, i) => (c === req.target ? i : -1)).filter((i) => i >= 0);
    idx.forEach((i) => (empty[i] = req.type === 'allOdd' ? 'odd' : 'even'));
    return { slots: empty, legacy: false };
  }
  return { slots: empty, legacy: true };
}

/** Sets one slot condition (null = None). Creates a Special if the monster has none. */
export function setSlotCondition(def: CreatureDef, index: number, cond: SlotCondition | null, count: number): void {
  const { slots } = slotConditions(def, count);
  slots[index] = cond;
  if (!def.special) def.special = defaultSpecial(count);
  def.special.requirement = { type: 'slots', slots };
}

export function setModifier(def: CreatureDef, key: ModifierKey, value: number): void {
  def.modifiers = { ...(def.modifiers ?? {}), [key]: Math.max(-99, Math.min(99, Math.round(value))) };
}

export function modifier(def: CreatureDef, key: ModifierKey): number {
  return def.modifiers?.[key] ?? 0;
}

// --- movement ---------------------------------------------------------------------------
//
// Pattern presets and helpers live in core/board/movementPresets.ts (shared with
// the game's rendering); re-exported here for the editor.

export { MOVE_PRESETS, PATTERN_RADIUS, isPatternMovement, patternCells } from '../core/board/movementPresets';

const cellKey = (c: Cell) => `${c.x},${c.y}`;
const sameCells = (a: Cell[], b: Cell[]) => a.length === b.length && new Set(a.map(cellKey)).size === new Set([...a, ...b].map(cellKey)).size;

/** The cells DEFAULT movement reaches on an empty board: N cardinal steps (for the preview). */
export function defaultReach(steps: number): Cell[] {
  const out: Cell[] = [];
  for (let y = -PATTERN_RADIUS; y <= PATTERN_RADIUS; y++)
    for (let x = -PATTERN_RADIUS; x <= PATTERN_RADIUS; x++) if ((x || y) && Math.abs(x) + Math.abs(y) <= steps) out.push({ x, y });
  return out;
}

/** "DEFAULT — 3 steps", a preset name, or "CUSTOM — n cells". */
export function movementLabel(def: CreatureDef): string {
  if (!isPatternMovement(def)) return `DEFAULT — ${def.stats.movement} steps`;
  const cells = patternCells(def);
  const preset = MOVE_PRESETS.find((p) => sameCells(p.cells(), cells));
  return preset ? preset.label.split(' — ')[0] : `CUSTOM — ${cells.length} cells`;
}

export function setDefaultMovement(def: CreatureDef): void {
  def.movement = { type: 'default' };
}

export function setPatternMovement(def: CreatureDef, cells: Cell[]): void {
  def.movement = { type: 'pattern', cells: cells.filter((c) => c.x || c.y).map((c) => ({ x: c.x, y: c.y })) };
}

/** Toggles one relative cell. The monster's own cell (0,0) can never be a destination. */
export function toggleMovementCell(def: CreatureDef, x: number, y: number): boolean {
  if (x === 0 && y === 0) return false;
  const cells = patternCells(def);
  const has = cells.some((c) => c.x === x && c.y === y);
  setPatternMovement(def, has ? cells.filter((c) => !(c.x === x && c.y === y)) : [...cells, { x, y }]);
  return true;
}

// --- powerups ------------------------------------------------------------------------

export const MELEE_FIELDS = [
  { key: 'speed', label: 'Speed', hint: 'time between attacks' },
  { key: 'knockback', label: 'Knockback', hint: 'push on hit' },
  { key: 'range', label: 'Range', hint: 'reach' },
] as const;

export const RANGED_FIELDS = [
  { key: 'speed', label: 'Speed', hint: 'projectile speed' },
  { key: 'range', label: 'Range', hint: 'travel distance' },
  { key: 'rateOfFire', label: 'Rate of Fire', hint: 'time between shots' },
  { key: 'impactSize', label: 'Impact Size', hint: 'shockwave radius' },
  { key: 'homing', label: 'Homing', hint: 'steering towards the opponent' },
  { key: 'trajectory', label: 'Trajectory', hint: 'Magnus curve when moving while firing' },
  { key: 'bounce', label: 'Bounce', hint: 'wall bounces (0 = the shot vanishes at a wall)' },
  { key: 'size', label: 'Size', hint: 'projectile size on screen' },
  { key: 'trail', label: 'Trail', hint: 'fading trail (0 = none, 10 = very long)' },
] as const;

export type MeleeKey = (typeof MELEE_FIELDS)[number]['key'];
export type RangedKey = (typeof RANGED_FIELDS)[number]['key'];

export function fieldMax(_key: string): number {
  return 10;
}

/** Value of a level a weapon does not set (older content): the field's lowest level. */
export function fieldDefault(key: string): number {
  return fieldMin(key);
}

/** Lowest level of a field: 0 for Bounce and Trail (none), 1 otherwise. */
export function fieldMin(key: string): number {
  return key === 'bounce' || key === 'trail' ? 0 : 1;
}

/** Sets one melee/ranged level on any weapon settings (a monster's attack or a Powerup). */
export function setWeaponLevel(w: Omit<WeaponSettings, 'type'>, group: 'melee' | 'ranged', key: string, value: number): void {
  const v = Math.max(fieldMin(key), Math.min(fieldMax(key), Math.round(value)));
  const block = (w[group] ?? {}) as Record<string, number>;
  (w as unknown as Record<string, unknown>)[group] = { ...block, [key]: v };
}

export const setPowerupLevel = (def: PowerupDef, group: 'melee' | 'ranged', key: string, value: number) => setWeaponLevel(def, group, key, value);

const cells = (units: number, rules: Ruleset) => (units / rules.combat.cellUnits).toFixed(units % rules.combat.cellUnits === 0 ? 0 : 1);
const secs = (ticks: number, rules: Ruleset) => `${(ticks / rules.combat.tickRate).toFixed(1)} s`;

/** What a level means in game terms (shown next to each slider). */
export function levelMeaning(group: 'melee' | 'ranged', key: string, level: number, rules: Ruleset): string {
  const c = rules.combat;
  if (group === 'melee') {
    if (key === 'speed') return secs(M.meleeCooldownTicks(level, c), rules);
    if (key === 'knockback') return `${level * 5} px`;
    if (key === 'range') return `${cells(M.meleeRange(level), rules)} cells`;
  } else {
    if (key === 'speed') return `${M.projectileSpeed(level)} u/tick`;
    if (key === 'range') return `${cells(M.projectileRange(level, c), rules)} cells`;
    if (key === 'rateOfFire') return secs(M.rateOfFireTicks(level, c), rules);
    if (key === 'impactSize') return `r ${cells(M.impactRadius(level), rules)} cells`;
    if (key === 'homing') return `${M.homingPercent(level)} %/tick`;
    if (key === 'trajectory') return `${((M.trajectoryCurve(level) / 65536) * (180 / Math.PI)).toFixed(2)}°/tick`;
    if (key === 'bounce') return level <= 0 ? 'none - vanishes at walls' : `${M.bounceCount(level)}×`;
    if (key === 'size') return `size ${level}`;
    if (key === 'trail') return level <= 0 ? 'none' : `${(M.trailTicks(level) / c.tickRate).toFixed(2)} s long`;
  }
  return String(level);
}

// --- Powerup duration and type ---------------------------------------------------------------

export const POWERUP_TEXT = {
  permanent: 'Permanent: This ability remains active for the entire match, from the beginning of the match until the match ends.',
  limited: 'Limited: Activate this ability with the Powerup button. It remains active for the selected time, then expires and cannot be activated again during this round.',
  charge:
    'Charge: Hold the attack button to charge your attack. Movement becomes extremely slow while charging. When ready, the monster flashes rapidly red and blue. Release the attack button to execute the configured attack.',
} as const;

export const DEFAULT_TIME_LIMIT = 10;
export const DEFAULT_CHARGE_TIME = 3;

/** Charge on (with the default charge time) or off (a normal attack). */
export function setPowerupCharge(p: PowerupDef, on: boolean): void {
  if (on) p.chargeTime ??= DEFAULT_CHARGE_TIME;
  else delete p.chargeTime;
}

/** Permanent (no time limit stored) or Limited (with a time limit). */
export function setPowerupDuration(p: PowerupDef, duration: PowerupDuration): void {
  p.duration = duration;
  if (duration === 'limited') p.timeLimit ??= DEFAULT_TIME_LIMIT;
  else delete p.timeLimit;
}

export function setPowerupTimeLimit(p: PowerupDef, seconds: number): void {
  p.timeLimit = Math.max(M.TIME_LIMIT_MIN, Math.min(M.TIME_LIMIT_MAX, Math.round(seconds)));
}

/** Power override: 1-10, or 0 = use the monster's own Power (nothing stored). */
export function setPowerupPower(p: PowerupDef, level: number): void {
  const v = Math.max(0, Math.min(M.POWER_MAX, Math.round(level)));
  if (v === 0) delete p.power;
  else p.power = v;
}

export function setPowerupChargeTime(p: PowerupDef, seconds: number): void {
  p.chargeTime = Math.max(M.CHARGE_TIME_MIN, Math.min(M.CHARGE_TIME_MAX, Math.round(seconds)));
}

/** "Ranged · Charge 3s · Limited 10s" style label. */
export function powerupLabel(p: PowerupDef): string {
  const type = p.type === 'ranged' ? 'Ranged' : 'Melee';
  const charge = p.chargeTime !== undefined ? ` · Charge ${p.chargeTime}s` : '';
  const duration = p.duration === 'limited' ? `Limited ${p.timeLimit ?? DEFAULT_TIME_LIMIT}s` : 'Permanent';
  return `${type}${charge} · ${duration}`;
}
