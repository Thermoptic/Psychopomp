// Psychopomp developer editor (/editor). An internal content tool — not part of
// the player UI. It edits the same content the game uses (ContentLibrary +
// browser storage shared with the game on the same origin).

import './editor.css';
import { ContentLibrary } from '../content/library';
import { loadContentPack } from '../content/loader';
import { bundledPackFiles } from '../platform/web/bundledContent';
import { browserStorage } from '../platform/web/storage';
import { h, pickTextFile } from './dom';
import { mountItemSection, type MountedSection } from './itemSection';
import { ItemEditor } from './model';
import { monsterForm, monsterPreview } from './monsterSection';
import { powerupForm, powerupPreview } from './powerupSection';

const app = document.getElementById('editor-app')!;
const loaded = loadContentPack(bundledPackFiles().base ?? {});
if (!loaded.ok) {
  app.replaceChildren(h('pre', { class: 'panel errors', text: loaded.errors.join('\n') }));
  throw new Error('Content pack invalid');
}
const lib = new ContentLibrary(loaded.pack, browserStorage());
const editors = { monster: new ItemEditor(lib, 'monster'), powerup: new ItemEditor(lib, 'powerup') };

/**
 * Editor sections. Future content types (dice, upgrades, abilities, arena,
 * ruleset, …) are added here; `soon` ones are listed but not built yet.
 */
interface SectionDef {
  id: string;
  label: string;
  soon?: boolean;
  mount?: (root: HTMLElement) => MountedSection;
}

const SECTIONS: SectionDef[] = [
  {
    id: 'monsters',
    label: 'MONSTERS',
    mount: (root) =>
      mountItemSection(root, {
        editor: editors.monster,
        form: (refresh, rebuild) => monsterForm(editors.monster, refresh, rebuild),
        preview: () => monsterPreview(editors.monster),
        onImport: () => void importContent(),
      }),
  },
  {
    id: 'powerups',
    label: 'POWERUPS',
    mount: (root) =>
      mountItemSection(root, {
        editor: editors.powerup,
        form: (refresh, rebuild) => powerupForm(editors.powerup, refresh, rebuild),
        preview: () => powerupPreview(editors.powerup),
        onImport: () => void importContent(),
      }),
  },
  { id: 'dice', label: 'DICE', soon: true },
  { id: 'upgrades', label: 'UPGRADES', soon: true },
  { id: 'settings', label: 'SETTINGS', soon: true },
];

const main = h('main');
const nav = h('nav', { class: 'sections' });
let current: MountedSection | null = null;

function show(id: string): void {
  const s = SECTIONS.find((x) => x.id === id && !x.soon) ?? SECTIONS[0];
  if (location.hash !== `#${s.id}`) history.replaceState(null, '', `#${s.id}`);
  nav.replaceChildren(
    ...SECTIONS.map((x) =>
      h('button', { type: 'button', class: x.id === s.id ? 'active' : '', disabled: !!x.soon, on: { click: () => show(x.id) } }, x.label, x.soon ? h('span', { class: 'soon', text: 'LATER' }) : null),
    ),
  );
  current = s.mount!(main);
}

/** Import any exported content file; it opens (unsaved) in the matching section. */
async function importContent(): Promise<void> {
  const text = await pickTextFile();
  if (text === null) return;
  const r = lib.importFile(text);
  if (!r.ok) {
    current?.say(`Import failed: ${r.errors[0]}`, 'dirty');
    return;
  }
  const migrated = r.migratedFrom !== null ? ` (migrated from v${r.migratedFrom})` : '';
  if (r.value.kind === 'monster') {
    editors.monster.load(r.value.item);
    show('monsters');
  } else {
    editors.powerup.load(r.value.item);
    show('powerups');
  }
  current?.say(`Imported "${r.value.item.name}"${migrated} - save to keep it`, 'ok');
}

app.replaceChildren(
  h(
    'header',
    { class: 'top' },
    h('span', { class: 'logo', text: 'PSYCHOPOMP' }),
    h('span', { class: 'tag', text: 'DEVELOPER EDITOR' }),
    h('span', { class: 'spacer' }),
    h('span', { class: 'dim', text: 'Saved content is stored in this browser and used by new matches.' }),
    h('a', { href: '../', text: 'Open game ↗' }),
  ),
  h('div', { class: 'layout' }, nav, main),
);
if (lib.loadWarnings.length) console.warn(lib.loadWarnings);
show(location.hash.slice(1) || 'monsters');
// Address-bar links like /editor/#powerups switch section too.
window.addEventListener('hashchange', () => show(location.hash.slice(1)));
