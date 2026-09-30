// Bundles every JSON file under content/packs/ into the build at compile time,
// so the game ships with its content and needs no server or network.

const modules = import.meta.glob('../../../content/packs/**/*.json', { eager: true, import: 'default' });

/** Returns pack id -> (pack-relative path -> parsed JSON). */
export function bundledPackFiles(): Record<string, Record<string, unknown>> {
  const packs: Record<string, Record<string, unknown>> = {};
  for (const [path, data] of Object.entries(modules)) {
    const m = /content\/packs\/([^/]+)\/(.+)$/.exec(path);
    if (!m) continue;
    const [, packId, rel] = m;
    (packs[packId] ??= {})[rel] = data;
  }
  return packs;
}
