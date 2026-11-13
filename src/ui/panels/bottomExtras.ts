/** Elementos adicionales de la barra inferior: bandeja de eventos pendientes y guerras activas. */
import type { App } from '../app';
import { h } from '../dom';
import { openPendingEvent } from '../events';

export function bottomExtras(app: App): HTMLElement[] {
  const w = app.world;
  const pid = w.player?.country;
  const out: HTMLElement[] = [];
  const pending = w.pendingEvents.filter((e) => e.country === pid);
  if (pending.length) out.push(h('div', { class: 'events-tray' }, pending.map((pe) => h('span', { class: 'event-chip', onclick: () => openPendingEvent(app, pe.uid) }, '⚠', String(pe.vars.title ?? 'Evento')))));
  const wars = w.wars.filter((x) => x.ceasefire <= 0).length;
  if (wars) out.push(h('span', { class: 'tag red', title: 'Conflictos armados activos', style: 'cursor:pointer', onclick: () => { app.layer = 'conflictos'; app.refresh(); } }, `⚔ ${wars}`));
  return out;
}
