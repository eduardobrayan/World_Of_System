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

export function toast(text: string, kind: 'info' | 'good' | 'bad' = 'info', ms = 4200, icon?: string) {
  let wrap = document.querySelector('.toast-wrap');
  if (!wrap) {
    wrap = h('div', { class: 'toast-wrap', 'aria-live': 'polite' });
    document.body.appendChild(wrap);
  }
  // Si el texto ya empieza por un emoji, ese es el icono
  const m = /^(\p{Extended_Pictographic}\uFE0F?)\s*/u.exec(text);
  const ic = icon ?? (m ? m[1] : kind === 'good' ? '✅' : kind === 'bad' ? '⚠️' : '📰');
  const body = m && !icon ? text.slice(m[0].length) : text;
  const t = h('div', { class: `toast ${kind === 'info' ? '' : kind}`, role: 'status' }, h('span', { class: 't-ic' }, ic), h('span', null, body));
  wrap.appendChild(t);
  while (wrap.children.length > 3) wrap.firstElementChild?.remove();
  setTimeout(() => t.remove(), ms);
}

export interface ModalOpts {
  title: string; kicker?: string; body: Child; footer?: Child; wide?: boolean; onClose?: () => void; closable?: boolean;
  /** Icono grande junto al título (emoji). */
  icon?: string; bigIcon?: boolean; hotKicker?: boolean; cls?: string;
}

export function modal(opts: ModalOpts): () => void {
  let closed = false;
  const close = () => { if (closed) return; closed = true; back.remove(); document.removeEventListener('keydown', onKey); opts.onClose?.(); };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && opts.closable !== false && [...document.querySelectorAll('.modal-back')].pop() === back) close(); };
  document.addEventListener('keydown', onKey);
  const back = h('div', { class: 'modal-back', onclick: (e: Event) => { if (e.target === back && opts.closable !== false) close(); } },
    h('div', { class: `modal ${opts.wide ? 'wide' : ''} ${opts.cls ?? ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title },
      h('header', null,
        opts.icon ? h('span', { class: `m-ic ${opts.bigIcon ? 'huge' : ''}`, 'aria-hidden': 'true' }, opts.icon) : null,
        h('div', { class: 'm-tt' }, opts.kicker ? h('div', { class: `kicker ${opts.hotKicker ? 'hot' : ''}` }, opts.kicker) : null, h('h2', null, opts.title)),
        opts.closable !== false ? h('button', { class: 'close-x m-close', 'aria-label': 'Cerrar', title: 'Cerrar', onclick: () => close() }, '✕') : null),
      h('div', { class: 'body' }, opts.body),
      opts.footer !== undefined ? (opts.footer === null ? null : h('footer', null, opts.footer)) : h('footer', null, h('button', { class: 'btn', onclick: close }, 'Cerrar'))));
  document.body.appendChild(back);
  return close;
}
