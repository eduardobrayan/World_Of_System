/** Utilidades mínimas de DOM (sin framework). */
type Child = Node | string | number | null | undefined | false | Child[];
type Props = Record<string, unknown> & { class?: string; style?: string };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props?: Props | null, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
      else if (k === 'class') el.className = String(v);
      else if (k === 'style') el.setAttribute('style', String(v));
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: Node, children: Child[]) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
}

export function clear(el: Element) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

export function mount(el: Element, ...children: Child[]) {
  clear(el);
  append(el, children);
}

export function toast(text: string, kind: 'info' | 'good' | 'bad' = 'info', ms = 4200) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = h('div', { class: 'toast-wrap' });
    document.body.appendChild(wrap);
  }
  const t = h('div', { class: `toast ${kind === 'info' ? '' : kind}` }, text);
  wrap.appendChild(t);
  setTimeout(() => t.remove(), ms);
}

export function modal(opts: { title: string; kicker?: string; body: Child; footer?: Child; wide?: boolean; onClose?: () => void; closable?: boolean }): () => void {
  const close = () => { back.remove(); opts.onClose?.(); };
  const back = h('div', { class: 'modal-back', onclick: (e: Event) => { if (e.target === back && opts.closable !== false) close(); } },
    h('div', { class: `modal ${opts.wide ? 'wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
      h('header', null, opts.kicker ? h('div', { class: 'kicker' }, opts.kicker) : null, h('h2', null, opts.title)),
      h('div', { class: 'body' }, opts.body),
      opts.footer !== undefined ? h('footer', null, opts.footer) : h('footer', null, h('button', { class: 'btn', onclick: close }, 'Cerrar'))));
  document.body.appendChild(back);
  return close;
}
