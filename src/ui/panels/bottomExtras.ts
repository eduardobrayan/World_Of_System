/** Elementos de la píldora de noticias: asuntos pendientes (pulsan) y guerras activas. */
import type { App } from '../app';
import { h } from '../dom';
import { openPendingEvent } from '../events';

export function bottomExtras(app: App): HTMLElement[] {
  const w = app.world;
  const pid = w.player?.country;
  const out: HTMLElement[] = [];
  const pending = w.pendingEvents.filter((e) => e.country === pid);
  if (pending.length) {
    const first = pending[0];
    out.push(h('div', { class: 'events-tray' }, h('button', { class: 'event-chip', title: 'Asunto por decidir', onclick: () => openPendingEvent(app, first.uid) },
      '📨', `${pending.length > 1 ? `${pending.length} asuntos` : String(first.vars.title ?? 'Asunto por decidir')}`)));
  }
  const wars = w.wars.filter((x) => x.ceasefire <= 0).length;
  if (wars) out.push(h('button', { class: 'war-chip', title: 'Guerras en el mundo: ver en el mapa', onclick: () => { app.layer = 'conflictos'; app.refresh(); } }, `⚔️ ${wars}`));
  return out;
}
