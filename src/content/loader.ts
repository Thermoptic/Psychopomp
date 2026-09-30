// Loads a content pack from already-read JSON data. Platform code decides how
// the files are read (Vite bundle, filesystem, browser storage…); this module
// is pure and portable.

import type { BoardDef, CreatureDef, Ruleset } from '../core/types';
import { validateBoard, validateCreature, validateRuleset } from './validate';

export interface ContentPack {
  id: string;
  name: string;
  contentVersion: number;
  ruleset: Ruleset;
  boards: BoardDef[];
  creatures: CreatureDef[];
}

export type LoadResult = { ok: true; pack: ContentPack } | { ok: false; errors: string[] };

/**
 * @param files map of pack-relative path (e.g. "monsters/glubber.json") to parsed JSON.
 *              Must contain "pack.json".
 */
export function loadContentPack(files: Record<string, unknown>): LoadResult {
  const errors: string[] = [];
  const manifest = files['pack.json'] as Record<string, unknown> | undefined;
  if (!manifest || typeof manifest !== 'object') return { ok: false, errors: ['pack.json is missing'] };

  const get = (path: unknown, what: string): unknown => {
    if (typeof path !== 'string' || !(path in files)) {
      errors.push(`${what}: file "${String(path)}" not found in pack`);
      return undefined;
    }
    return files[path];
  };

  const rulesetRaw = get(manifest.ruleset, 'ruleset');
  const rv = validateRuleset(rulesetRaw);
  if (!rv.ok) return { ok: false, errors: [...errors, ...rv.errors] };
  const ruleset = rulesetRaw as Ruleset;

  const creatures: CreatureDef[] = [];
  const ids = new Set<string>();
  for (const path of (manifest.creatures as unknown[]) ?? []) {
    const raw = get(path, 'creature');
    if (raw === undefined) continue;
    const v = validateCreature(raw, ruleset);
    if (!v.ok) {
      errors.push(...v.errors.map((e) => `${String(path)}: ${e}`));
      continue;
    }
    const def = raw as CreatureDef;
    if (ids.has(def.id)) errors.push(`${String(path)}: duplicate creature id "${def.id}"`);
    ids.add(def.id);
    creatures.push(def);
  }

  const boards: BoardDef[] = [];
  for (const path of (manifest.boards as unknown[]) ?? []) {
    const raw = get(path, 'board');
    if (raw === undefined) continue;
    const v = validateBoard(raw, ids);
    if (!v.ok) errors.push(...v.errors.map((e) => `${String(path)}: ${e}`));
    else boards.push(raw as BoardDef);
  }
  if (boards.length === 0) errors.push('pack has no valid board');

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    pack: {
      id: String(manifest.id),
      name: String(manifest.name ?? manifest.id),
      contentVersion: Number(manifest.contentVersion ?? 1),
      ruleset,
      boards,
      creatures,
    },
  };
}
