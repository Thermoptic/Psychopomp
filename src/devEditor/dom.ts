// Tiny DOM helpers for the developer editor (no framework).

type Child = Node | string | null | false | undefined;
type Props = { class?: string; text?: string; title?: string; on?: Record<string, (e: Event) => void> } & Record<string, unknown>;

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'text') el.textContent = String(v);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c !== null && c !== false && c !== undefined) el.append(c);
  return el;
}

export function row(label: string, control: Node, hint?: string): HTMLElement {
  return h('div', { class: 'row' }, h('label', { text: label }), control, hint ? h('div', { class: 'hint', text: hint }) : null);
}

export function group(title: string, ...children: Child[]): HTMLElement {
  return h('div', { class: 'group' }, h('h3', { text: title }), ...children);
}

export function textInput(value: string, onInput: (v: string) => void, opts: { sanitize?: (v: string) => string; placeholder?: string } = {}): HTMLInputElement {
  const input = h('input', { type: 'text', value, placeholder: opts.placeholder ?? '' });
  input.addEventListener('input', () => {
    if (opts.sanitize) {
      const clean = opts.sanitize(input.value);
      if (clean !== input.value) input.value = clean;
    }
    onInput(input.value);
  });
  return input;
}

/** Slider + number box + live meaning text, kept in sync. */
export function slider(opts: {
  min: number;
  max: number;
  value: number;
  step?: number;
  numberMin?: number;
  numberMax?: number;
  meaning?: (v: number) => string;
  onInput: (v: number) => void;
}): HTMLElement {
  const range = h('input', { type: 'range', min: String(opts.min), max: String(opts.max), step: String(opts.step ?? 1), value: String(opts.value) });
  const num = h('input', {
    type: 'number',
    min: String(opts.numberMin ?? opts.min),
    max: String(opts.numberMax ?? opts.max),
    step: String(opts.step ?? 1),
    value: String(opts.value),
  });
  const meaning = h('span', { class: 'meaning', text: opts.meaning ? opts.meaning(opts.value) : '' });
  const set = (v: number, from: 'range' | 'num') => {
    if (!Number.isFinite(v)) return;
    if (from !== 'range') range.value = String(v);
    if (from !== 'num') num.value = String(v);
    if (opts.meaning) meaning.textContent = opts.meaning(v);
    opts.onInput(v);
  };
  range.addEventListener('input', () => set(Number(range.value), 'range'));
  num.addEventListener('input', () => num.value !== '' && set(Number(num.value), 'num'));
  return h('div', { class: 'slider' }, range, num, meaning);
}

export function selectBox(options: string[], selected: number, onChange: (index: number) => void): HTMLSelectElement {
  const sel = h('select', {}, ...options.map((o, i) => h('option', { value: String(i), text: o, selected: i === selected })));
  sel.addEventListener('change', () => onChange(Number(sel.value)));
  return sel;
}

export function segmented<T extends string>(options: Array<{ value: T; label: string; cls?: string }>, value: T, onChange: (v: T) => void): HTMLElement {
  return h(
    'div',
    { class: 'seg' },
    ...options.map((o) => h('button', { type: 'button', class: `${o.value === value ? 'on' : ''} ${o.cls ?? ''}`, text: o.label, on: { click: () => onChange(o.value) } })),
  );
}

/** One cell of a board grid: how it looks and what a click does. */
export interface GridCell {
  text?: string;
  cls?: string;
  title?: string;
  disabled?: boolean;
  onClick?: () => void;
}

/**
 * A board-style grid with column numbers (1..) and row letters (A..), shared by
 * the Position picker and the Movement pattern editor. The caller decides each
 * cell's look and click behaviour.
 */
export function boardGrid(width: number, height: number, cell: (x: number, y: number) => GridCell): HTMLElement {
  const grid = h('div', { class: 'grid9' });
  grid.style.gridTemplateColumns = `18px repeat(${width}, 28px)`;
  grid.append(h('span', { class: 'hdr' }), ...Array.from({ length: width }, (_, x) => h('span', { class: 'hdr', text: String(x + 1) })));
  for (let y = 0; y < height; y++) {
    grid.append(h('span', { class: 'hdr', text: String.fromCharCode(65 + y) }));
    for (let x = 0; x < width; x++) {
      const c = cell(x, y);
      grid.append(
        h('button', {
          type: 'button',
          class: `${(x + y) % 2 ? 'b' : 'a'} ${c.cls ?? ''}`,
          text: c.text ?? '',
          title: c.title ?? '',
          disabled: !!c.disabled,
          on: c.onClick ? { click: c.onClick } : undefined,
        }),
      );
    }
  }
  return grid;
}

export function downloadText(filename: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = h('a', { href: url, download: filename });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function pickTextFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = h('input', { type: 'file', accept: '.json,application/json' });
    input.style.display = 'none';
    input.addEventListener('change', async () => {
      const f = input.files?.[0];
      input.remove();
      resolve(f ? await f.text() : null);
    });
    document.body.append(input);
    input.click();
  });
}
