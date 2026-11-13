/** Elementos adicionales de la barra inferior. */
import type { App } from '../app';
import { h } from '../dom';

export function bottomExtras(app: App): HTMLElement[] {
  const w = app.world;
  const wars = w.wars.filter((x) => x.ceasefire <= 0).length;
  return wars ? [h('span', { class: 'tag red', title: 'Conflictos armados activos', style: 'cursor:pointer', onclick: () => { app.layer = 'conflictos'; app.refresh(); } }, `⚔ ${wars}`)] : [];
}
