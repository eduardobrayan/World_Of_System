/** Barra inferior: bandeja de eventos y titular de noticias. */
import type { App } from '../app';
import { h } from '../dom';
import { dateLabel } from '../../sim/util';
import { bottomExtras } from './bottomExtras';

export function renderBottom(app: App): HTMLElement[] {
  const w = app.world;
  const pid = w.player?.country;
  const relevant = [...w.news].reverse().find((n) => !pid || n.countries.includes(pid) || n.importance >= 2) ?? w.news[w.news.length - 1];
  return [
    ...bottomExtras(app),
    h('div', { class: 'ticker', title: 'Abrir el registro de noticias', onclick: () => app.setTab('mundo') },
      relevant ? [h('b', null, `${dateLabel(relevant.turn)} · `), relevant.text] : 'Sin noticias todavía.'),
    h('button', { class: 'btn sm ghost', onclick: () => app.setTab('mundo') }, '📰 Noticias'),
  ];
}
