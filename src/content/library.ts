// The content library: bundled base content + content saved by the developer
// editor (/editor), merged into the one set of definitions the game uses.
// Saved items override base items with the same id; new ids are added.
// Pure — storage is injected by the platform.
//
// Content kinds share one generic store; adding a kind later (dice, upgrades,
// abilities, …) means adding a collection + its validator here and a section
// in the editor — the save format already keeps collections by name.

import { cellCode, cellInBoard, parseCell } from '../core/board/cells';
import { DEFAULT_CATEGORIES, type CreatureDef, type MeleeSettings, type Placement, type PowerupDef, type RangedSettings, type Ruleset } from '../core/types';
import type { ContentPack } from './loader';
import {
  emptySave,
  parseContentFile,
  parseSave,
  serializeMonster,
  serializePowerup,
  serializeSave,
  type ContentKind,
  type ParsedItem,
  type SaveData,
} from './saveFormat';
import { validateCreature, validatePowerup } from './validate';

export type { ContentKind };

/** Where the platform keeps the save text (browser storage, a file, memory in tests). */
export interface SaveStorage {
  read(): string | null;
  write(text: string): void;
}

export function memoryStorage(initial: string | null = null): SaveStorage & { text: string | null } {
  const s = {
    text: initial,
    read: () => s.text,
    write: (t: string) => {
      s.text = t;
    },
  };
  return s;
}

export type ItemOrigin = 'base' | 'modified' | 'custom';
type ItemOf<K extends ContentKind> = K extends 'monster' ? CreatureDef : PowerupDef;

export interface Entry<T> {
  item: T;
  origin: ItemOrigin;
}

export type SaveResult<T> = { ok: true; item: T } | { ok: false; errors: string[] };

const ID_RE = /^[a-z0-9_]+$/;
const COLLECTION = { monster: 'monsters', powerup: 'powerups' } as const;

/**
 * Default Special for new monsters: five unused slot conditions. They only gate
 * the monster's Powerup (see powerupIsGated); the effect is empty, so meeting
 * them changes no stats.
 */
export function defaultSpecial(slotCount: number): NonNullable<CreatureDef['special']> {
  return {
    name: 'Special',
    description: '',
    requirement: { type: 'slots', slots: new Array(slotCount).fill(null) },
    effect: { type: 'multi', effects: [] },
    activation: 'auto',
  };
}

/** Starting values for melee and ranged settings (mid-low levels). */
export function defaultWeaponSettings(): { melee: MeleeSettings; ranged: RangedSettings } {
  return {
    melee: { speed: 2, knockback: 1, range: 3 },
    ranged: { speed: 5, range: 5, rateOfFire: 2, impactSize: 2, homing: 1, trajectory: 1, bounce: 0, size: 1, trail: 0 },
  };
}

export class ContentLibrary {
  private save: SaveData;
  /** Problems found while loading the save (shown in the editor). */
  readonly loadWarnings: string[] = [];

  constructor(
    private readonly base: ContentPack,
    private readonly storage: SaveStorage,
  ) {
    this.save = emptySave(base.contentVersion);
    const text = storage.read();
    if (text) {
      const r = parseSave(text, base.ruleset);
      if (r.ok) {
        this.save = r.value;
        this.loadWarnings.push(...r.warnings);
        if (r.migratedFrom !== null) this.persist(); // write back in the current version
      } else {
        this.loadWarnings.push(...r.errors.map((e) => `Local save ignored: ${e}`));
      }
    }
  }

  get ruleset(): Ruleset {
    return this.base.ruleset;
  }

  /** The board new matches use (for positions and lineup checks). */
  get board() {
    return this.base.boards[0];
  }

  get contentVersion(): number {
    return this.base.contentVersion;
  }

  // --- reading --------------------------------------------------------------------------

  private baseItems<K extends ContentKind>(kind: K): ItemOf<K>[] {
    return (kind === 'monster' ? this.base.creatures : this.base.powerups) as ItemOf<K>[];
  }

  /** Ids of bundled items deleted locally. */
  private deletedIds(kind: ContentKind): Set<string> {
    return new Set(this.save.deleted?.[COLLECTION[kind]] ?? []);
  }

  /** Bundled items deleted locally (offered for RESTORE in the editor). */
  deletedBase<K extends ContentKind>(kind: K): ItemOf<K>[] {
    const del = this.deletedIds(kind);
    return this.baseItems(kind).filter((b) => del.has(b.id));
  }

  /** Brings a deleted bundled item back (its bundled version). */
  restoreItem(kind: ContentKind, id: string): void {
    const list = [...this.deletedIds(kind)].filter((x) => x !== id);
    this.save = { ...this.save, deleted: { ...this.save.deleted, [COLLECTION[kind]]: list } };
    this.persist();
  }

  private savedItems<K extends ContentKind>(kind: K): ItemOf<K>[] {
    return this.save[COLLECTION[kind]] as ItemOf<K>[];
  }

  /** All items of a kind as the game sees them (base order first, then custom). */
  entries<K extends ContentKind>(kind: K): Entry<ItemOf<K>>[] {
    const saved = new Map(this.savedItems(kind).map((m) => [m.id, m]));
    const del = this.deletedIds(kind);
    const base = this.baseItems(kind).filter((b) => !del.has(b.id));
    const out: Entry<ItemOf<K>>[] = base.map((b) => (saved.has(b.id) ? { item: saved.get(b.id)!, origin: 'modified' as const } : { item: b, origin: 'base' as const }));
    const baseIds = new Set(this.baseItems(kind).map((b) => b.id));
    for (const m of this.savedItems(kind)) if (!baseIds.has(m.id)) out.push({ item: m, origin: 'custom' });
    return out;
  }

  get<K extends ContentKind>(kind: K, id: string): Entry<ItemOf<K>> | undefined {
    return this.entries(kind).find((e) => e.item.id === id);
  }

  creatures(): CreatureDef[] {
    return this.entries('monster').map((e) => e.item);
  }

  powerups(): PowerupDef[] {
    return this.entries('powerup').map((e) => e.item);
  }

  /**
   * The content pack with saved content merged in — what a new match uses.
   * The board carries the full lineup (see lineup()), so monsters' own
   * positions are already in it and are left out of the creatures.
   */
  pack(): ContentPack {
    const [board, ...rest] = this.base.boards;
    const creatures = this.creatures().map((c) => {
      const copy = { ...c };
      delete copy.position;
      return copy;
    });
    return { ...this.base, boards: [{ ...board, placements: this.lineup() }, ...rest], creatures, powerups: this.powerups() };
  }

  // --- board lineup --------------------------------------------------------------------

  /**
   * Every creature on the board at the start of a match: the lineup edited in
   * the developer editor, or (until it is edited) the bundled board's lineup
   * plus each monster's own player + position. Pieces of monsters that no
   * longer exist, or outside the board, are left out.
   */
  lineup(): Placement[] {
    const ids = new Set(this.creatures().map((c) => c.id));
    const inBoard = (p: Placement) => cellInBoard(p, this.board);
    if (this.save.lineup) return this.save.lineup.filter((p) => ids.has(p.creature) && inBoard(p)).map((p) => ({ ...p }));
    const list: Placement[] = this.board.placements.map((p) => ({ ...p }));
    const used = new Set(list.map((p) => `${p.x},${p.y}`));
    for (const m of this.creatures()) {
      const c = m.player && m.position ? parseCell(m.position) : null;
      if (!c || !cellInBoard(c, this.board) || used.has(`${c.x},${c.y}`)) continue;
      used.add(`${c.x},${c.y}`);
      list.push({ creature: m.id, owner: m.player!, x: c.x, y: c.y });
    }
    return list.filter((p) => ids.has(p.creature));
  }

  /** True once the lineup has been edited (saved locally). */
  lineupIsCustom(): boolean {
    return !!this.save.lineup;
  }

  /** Saves an edited lineup (the whole board). */
  setLineup(list: Placement[]): void {
    this.save = { ...this.save, lineup: list.map((p) => ({ creature: p.creature, owner: p.owner, x: p.x, y: p.y })) };
    this.persist();
  }

  /** Back to the bundled board's lineup. */
  resetLineup(): void {
    const next: SaveData = { ...this.save };
    delete next.lineup;
    this.save = next;
    this.persist();
  }

  isBase(kind: ContentKind, id: string): boolean {
    return this.baseItems(kind).some((b) => b.id === id);
  }

  /** Monsters that use a Powerup (a Powerup is referenced, never copied). */
  monstersUsing(powerupId: string): CreatureDef[] {
    return this.creatures().filter((m) => m.powerupId === powerupId);
  }

  // --- validation --------------------------------------------------------------------------

  private commonChecks(kind: ContentKind, item: { id?: string; name?: string }, originalId: string | null): string[] {
    const errors: string[] = [];
    const id = item.id ?? '';
    if (!ID_RE.test(id)) errors.push('ID: use a-z, 0-9 and _ only (not empty)');
    if (!item.name || !String(item.name).trim()) errors.push('NAME: must not be empty');
    if (this.entries(kind).some((e) => e.item.id === id && e.item.id !== originalId)) errors.push(`ID: "${id}" is already used`);
    if (this.deletedIds(kind).has(id)) errors.push(`ID: "${id}" belongs to a deleted bundled item (restore it or pick another id)`);
    return errors;
  }

  validateMonster(def: CreatureDef, originalId: string | null): string[] {
    const errors = this.commonChecks('monster', def, originalId);
    const v = validateCreature(def, this.ruleset, { powerupIds: new Set(this.powerups().map((p) => p.id)), board: this.board });
    errors.push(...v.errors.map((e) => e.replace(/^creature "[^"]*"[.:]?\s*/, '')));
    // Position must be free: not used by the board lineup or another placed monster.
    const cell = def.position ? parseCell(def.position) : null;
    if (cell && def.player && cellInBoard(cell, this.board) && !this.save.lineup) {
      if (this.board.placements.some((p) => p.x === cell.x && p.y === cell.y)) errors.push(`POSITION: ${cellCode(cell)} is taken by the board lineup`);
      const other = this.creatures().find((m) => m.id !== originalId && m.id !== def.id && m.player && m.position && parseCell(m.position)?.x === cell.x && parseCell(m.position)?.y === cell.y);
      if (other) errors.push(`POSITION: ${cellCode(cell)} is taken by ${other.name}`);
    }
    return [...new Set(errors)];
  }

  validatePowerup(def: PowerupDef, originalId: string | null): string[] {
    const errors = this.commonChecks('powerup', def, originalId);
    errors.push(...validatePowerup(def).errors.map((e) => e.replace(/^powerup "[^"]*"[.:]?\s*/, '')));
    // Renaming a Powerup's id would break monsters that reference it.
    if (originalId && def.id !== originalId && this.monstersUsing(originalId).length) {
      errors.push(`ID: used by ${this.monstersUsing(originalId).map((m) => m.name).join(', ')} - keep the id`);
    }
    return [...new Set(errors)];
  }

  validate<K extends ContentKind>(kind: K, item: ItemOf<K>, originalId: string | null): string[] {
    return kind === 'monster' ? this.validateMonster(item as CreatureDef, originalId) : this.validatePowerup(item as PowerupDef, originalId);
  }

  // --- writing -------------------------------------------------------------------------------

  /**
   * Saves an item. `originalId` is the id it was loaded under (null = new).
   * Renaming a custom item replaces it; renaming a base item saves a new one.
   */
  saveItem<K extends ContentKind>(kind: K, item: ItemOf<K>, originalId: string | null): SaveResult<ItemOf<K>> {
    const errors = this.validate(kind, item, originalId);
    if (errors.length) return { ok: false, errors };
    const clean = structuredClone(item);
    if (kind === 'monster' && this.save.lineup) {
      // With an edited lineup the board is the single source of placements:
      // a renamed monster keeps its pieces, an imported position joins the board.
      const m = clean as CreatureDef;
      let lineup = this.save.lineup;
      if (originalId && originalId !== m.id && !this.isBase('monster', originalId)) lineup = lineup.map((p) => (p.creature === originalId ? { ...p, creature: m.id } : p));
      const c = m.player && m.position ? parseCell(m.position) : null;
      if (c && cellInBoard(c, this.board) && !lineup.some((p) => p.x === c.x && p.y === c.y)) lineup = [...lineup, { creature: m.id, owner: m.player!, x: c.x, y: c.y }];
      delete m.position;
      this.save = { ...this.save, lineup };
    }
    let list = this.savedItems(kind).filter((m) => m.id !== clean.id);
    if (originalId && originalId !== clean.id && !this.isBase(kind, originalId)) list = list.filter((m) => m.id !== originalId);
    list.push(clean);
    this.save = { ...this.save, [COLLECTION[kind]]: list };
    this.persist();
    return { ok: true, item: clean };
  }

  /**
   * Deletes an item: a custom one is removed, a bundled one (modified or not)
   * is hidden locally and can be brought back with restoreItem(). A deleted
   * monster leaves the board too.
   */
  removeItem(kind: ContentKind, id: string): { ok: true } | { ok: false; error: string } {
    if (!this.get(kind, id)) return { ok: false, error: 'No such item' };
    if (kind === 'powerup') {
      const users = this.monstersUsing(id);
      if (users.length) return { ok: false, error: `Used by ${users.map((m) => m.name).join(', ')}` };
    }
    this.save = { ...this.save, [COLLECTION[kind]]: this.savedItems(kind).filter((m) => m.id !== id) };
    if (this.isBase(kind, id)) {
      const del = [...this.deletedIds(kind), id];
      this.save = { ...this.save, deleted: { ...this.save.deleted, [COLLECTION[kind]]: del } };
    }
    if (kind === 'monster' && this.save.lineup) this.save = { ...this.save, lineup: this.save.lineup.filter((p) => p.creature !== id) };
    this.persist();
    return { ok: true };
  }

  serialize<K extends ContentKind>(kind: K, item: ItemOf<K>): string {
    return kind === 'monster' ? serializeMonster(item as CreatureDef, this.contentVersion) : serializePowerup(item as PowerupDef, this.contentVersion);
  }

  /** Parses an exported file (any kind/version) without saving it. */
  importFile(text: string): { ok: true; value: ParsedItem; migratedFrom: number | null } | { ok: false; errors: string[] } {
    const r = parseContentFile(text, this.ruleset);
    return r.ok ? { ok: true, value: r.value, migratedFrom: r.migratedFrom } : r;
  }

  // --- new items (defaults from the existing model) -----------------------------------------------

  private freeId(kind: ContentKind, prefix: string): number {
    const ids = new Set(this.entries(kind).map((e) => e.item.id));
    let n = 1;
    while (ids.has(`${prefix}_${n}`)) n++;
    return n;
  }

  newMonster(): CreatureDef {
    const n = this.freeId('monster', 'monster');
    const template = this.base.creatures[0];
    const count = this.ruleset.dice.count;
    // Spread the ruleset's dice over the default categories (one each for 5 dice).
    const slots: Record<string, number> = Object.fromEntries(DEFAULT_CATEGORIES.map((c) => [c, 0]));
    for (let i = 0; i < count; i++) slots[DEFAULT_CATEGORIES[i % DEFAULT_CATEGORIES.length]]++;
    return {
      id: `monster_${n}`,
      name: `Monster ${n}`,
      description: '',
      art: {},
      stats: { maxHp: template?.stats.maxHp ?? 20, movement: template?.stats.movement ?? 3 },
      // No start bonus or penalty by default.
      modifiers: { speed: 0, power: 0, shield: 0, dash: 0, block: 0 },
      player: 'P1',
      attack: { type: 'melee', autoFire: false, ...defaultWeaponSettings() },
      movement: { type: 'default' },
      powerupId: null,
      dice: { slots },
      special: defaultSpecial(count),
    };
  }

  newPowerup(type: PowerupDef['type'] = 'melee'): PowerupDef {
    const n = this.freeId('powerup', 'powerup');
    return { id: `powerup_${n}`, name: `Powerup ${n}`, type, duration: 'permanent', ...defaultWeaponSettings() };
  }

  private persist(): void {
    this.storage.write(serializeSave(this.save));
  }
}
