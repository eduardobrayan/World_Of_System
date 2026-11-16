/** Tooltips explicativos: qué es cada variable y qué la está modificando ahora mismo. */
import type { Contribution, Country, World } from '../sim/types';
import { h } from './dom';
import { IND, explainOf } from './info';

let tipEl: HTMLElement | null = null;
let hideTimer: number | undefined;
let lastTouch = 0; // los toques generan «mouseenter» de compatibilidad: no deben abrir la ayuda flotante

function el(): HTMLElement {
  if (!tipEl) {
    tipEl = h('div', { class: 'tip', role: 'tooltip' });
    document.body.appendChild(tipEl);
    // Un toque en cualquier otro sitio (o un cambio de pantalla) cierra la ayuda abierta
    document.addEventListener('pointerdown', (e) => { lastTouch = e.pointerType === 'touch' ? Date.now() : 0; hideTip(); }, true);
    document.addEventListener('scroll', hideTip, true);
  }
  return tipEl;
}

function place(x: number, y: number) {
  const t = el();
  const r = t.getBoundingClientRect();
  let left = x + 14, top = y + 16;
  if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
  if (top + r.height > window.innerHeight - 8) top = y - r.height - 12;
  t.style.left = `${Math.max(6, left)}px`;
  t.style.top = `${Math.max(6, top)}px`;
}

export function showTip(content: HTMLElement | string, x: number, y: number) {
  const t = el();
  t.innerHTML = '';
  if (typeof content === 'string') t.textContent = content;
  else t.appendChild(content);
  t.style.display = 'block';
  place(x, y);
}

/** Si el elemento que abrió la ayuda desaparece (la pantalla se redibuja), la ayuda se cierra. */
let watchTimer: number | undefined;
function watch(target: HTMLElement) {
  clearInterval(watchTimer);
  watchTimer = window.setInterval(() => { if (!target.isConnected || tipEl?.style.display === 'none') { clearInterval(watchTimer); if (!target.isConnected) hideTip(); } }, 300);
}

export function hideTip() {
  if (tipEl) tipEl.style.display = 'none';
}

export function tip(target: HTMLElement, content: () => HTMLElement | string) {
  el();
  target.addEventListener('mouseenter', (e) => { if (Date.now() - lastTouch > 800) { showTip(content(), e.clientX, e.clientY); watch(target); } });
  target.addEventListener('click', () => { if (Date.now() - lastTouch > 800) hideTip(); });
  target.addEventListener('mousemove', (e) => place(e.clientX, e.clientY));
  target.addEventListener('mouseleave', hideTip);
  target.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch' || target.tagName === 'BUTTON') return; // un botón táctil actúa, no explica
    showTip(content(), e.clientX, e.clientY);
    clearTimeout(hideTimer);
    hideTimer = window.setTimeout(hideTip, 3500);
  });
  return target;
}

export function contributions(parts: Contribution[], unit = '', max = 9): HTMLElement {
  const sorted = [...parts].filter((p) => Math.abs(p.value) > 0.005).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, max);
  return h('div', { class: 'why' },
    h('div', { class: 'small muted' }, 'Qué lo está modificando ahora:'),
    sorted.length ? sorted.map((p) => h('div', { class: 'r' }, h('span', null, p.label), h('span', { class: p.value >= 0 ? 'good' : 'bad' }, `${p.value >= 0 ? '+' : ''}${p.value.toFixed(2)}${unit}`)))
      : h('div', { class: 'small muted' }, 'Sin factores destacados.'));
}

/** Tooltip estándar de un indicador para un país. */
export function indicatorTip(key: string, getC: () => Country | null, getW: () => World | null, display?: (c: Country) => string): () => HTMLElement {
  return () => {
    const ind = IND[key];
    const c = getC(), w = getW();
    if (!ind || !c || !w) return h('div', null, key);
    const parts = explainOf(ind, c, w);
    return h('div', null,
      h('div', { class: 't' }, `${ind.name} · ${c.short}`),
      h('div', { class: 'val' }, display ? display(c) : ind.fmt(ind.get(c, w))),
      h('div', { class: 'desc' }, ind.desc),
      parts.length ? contributions(parts) : null);
  };
}
