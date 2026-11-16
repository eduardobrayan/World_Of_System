/** Píldora de noticias sobre el mapa: asuntos pendientes, guerras y el último titular. */
import type { App } from '../app';
import { h } from '../dom';
import { fillTicker, liveState, tickerNews } from '../live';
import { bottomExtras } from './bottomExtras';

export function renderBottom(app: App): HTMLElement[] {
  const ticker = h('div', { class: 'ticker', title: 'Ver todas las noticias', onclick: () => app.setTab('mundo') });
  fillTicker(ticker, tickerNews(app), !!liveState(app).current);
  return [
    ...bottomExtras(app),
    ticker,
    h('button', { class: 'news-btn', title: 'Todas las noticias', 'aria-label': 'Todas las noticias', onclick: () => app.setTab('mundo') }, '📰'),
  ];
}
