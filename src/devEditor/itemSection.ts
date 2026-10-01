// Generic editor section for one content kind: item list | form | preview,
// plus a toolbar (new, duplicate, save, revert, delete, export, import).
// New content kinds reuse this with their own form + preview.

import type { ContentKind } from '../content/library';
import { downloadText, h } from './dom';
import type { ItemEditor } from './model';

export interface ItemSectionSpec<K extends ContentKind> {
  editor: ItemEditor<K>;
  /** Builds the form. Call `refresh` after value edits, `rebuild` when the form layout must change. */
  form(refresh: () => void, rebuild: () => void): HTMLElement;
  preview(): HTMLElement;
  /** Shared import (any content kind) handled by the editor shell. */
  onImport(): void;
}

export interface MountedSection {
  rebuild(): void;
  say(text: string, cls?: string): void;
}

export function mountItemSection<K extends ContentKind>(root: HTMLElement, spec: ItemSectionSpec<K>): MountedSection {
  const ed = spec.editor;
  const listEl = h('div', { class: 'list' });
  const formEl = h('div', { class: 'form' });
  const previewEl = h('div');
  const errorsEl = h('div');
  const statusEl = h('span', { class: 'status' });
  let message: { text: string; cls: string } | null = null;

  const btn = (label: string, onClick: () => void, cls = '') => h('button', { type: 'button', class: `btn ${cls}`, text: label, on: { click: onClick } });
  const saveBtn = btn('SAVE', () => {
    const r = ed.save();
    say(r.ok ? 'Saved - used by new matches' : `Cannot save: ${r.errors[0]}`, r.ok ? 'ok' : 'dirty');
    rebuild();
  }, 'primary');
  const deleteBtn = btn('DELETE', () => {
    if (ed.originalId && !confirm(ed.origin() === 'modified' ? 'Restore the bundled version?' : `Delete "${ed.draft.name}"?`)) return;
    const r = ed.remove();
    say(r.ok ? (r.restored ? 'Bundled version restored' : 'Deleted') : r.error, r.ok ? 'ok' : 'dirty');
    rebuild();
  }, 'danger');

  const confirmDiscard = () => !ed.dirty || confirm('Discard unsaved changes?');
  const toolbar = h(
    'div',
    { class: 'toolbar' },
    btn('NEW', () => confirmDiscard() && (ed.newItem(), say('New item - edit and save'), rebuild())),
    btn('DUPLICATE', () => (ed.duplicate(), say('Copy created - save to keep it'), rebuild())),
    saveBtn,
    btn('REVERT', () => (ed.revert(), say('Reverted'), rebuild())),
    deleteBtn,
    btn('EXPORT', () => {
      const r = ed.exportText();
      if (r.ok) {
        downloadText(r.filename, r.text);
        say(`Exported ${r.filename}`, 'ok');
      } else say(`Cannot export: ${r.error}`, 'dirty');
      refresh();
    }),
    btn('IMPORT', () => confirmDiscard() && spec.onImport()),
    statusEl,
  );

  function say(text: string, cls = ''): void {
    message = { text, cls };
  }

  function renderList(): void {
    listEl.replaceChildren(
      ...ed.list().map((e) =>
        h(
          'button',
          {
            type: 'button',
            class: e.item.id === ed.originalId ? 'selected' : '',
            on: {
              click: () => {
                if (e.item.id === ed.originalId || !confirmDiscard()) return;
                ed.select(e.item.id);
                message = null;
                rebuild();
              },
            },
          },
          h('span', { text: e.item.name }),
          h('span', { class: `origin ${e.origin}`, text: e.origin === 'base' ? 'BASE' : e.origin === 'modified' ? 'MOD' : 'NEW' }),
        ),
      ),
      ...(ed.originalId === null ? [h('div', { class: 'note', text: `+ unsaved: ${ed.draft.name}` })] : []),
    );
  }

  function refresh(): void {
    renderList();
    previewEl.replaceChildren(spec.preview());
    const errors = ed.errors();
    errorsEl.replaceChildren(errors.length ? h('ul', { class: 'errors' }, ...errors.map((e) => h('li', { text: e }))) : h('div', { class: 'valid', text: 'VALID' }));
    saveBtn.disabled = errors.length > 0 || !ed.dirty;
    deleteBtn.disabled = ed.originalId !== null && ed.origin() === 'base';
    statusEl.className = `status ${message?.cls ?? (ed.dirty ? 'dirty' : '')}`;
    statusEl.textContent = message?.text ?? (ed.dirty ? 'UNSAVED CHANGES' : 'SAVED');
  }

  function rebuild(): void {
    formEl.replaceChildren(spec.form(() => ((message = null), refresh()), rebuild));
    refresh();
  }

  root.replaceChildren(
    h(
      'div',
      { class: 'item-editor' },
      toolbar,
      h('div', { class: 'panel' }, h('h2', { text: 'ITEMS' }), listEl),
      h('div', { class: 'panel' }, formEl),
      h('div', { class: 'panel preview' }, previewEl, errorsEl),
    ),
  );
  rebuild();
  return { rebuild, say: (t, c) => (say(t, c), refresh()) };
}
