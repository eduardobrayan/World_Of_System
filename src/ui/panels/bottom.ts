/** Barra inferior: bandeja de eventos y titular de noticias. */
import type { App } from '../app';
import { h } from '../dom';
import { fillTicker, liveState, tickerNews } from '../live';
import { bottomExtras } from './bottomExtras';

export function renderBottom(app: App): HTMLElement[] {
  const ticker = h('div', { class: 'ticker', title: 'Abrir el registro de noticias', onclick: () => app.setTab('mundo') });
  fillTicker(ticker, tickerNews(app), !!liveState(app).current);
  return [
    ...bottomExtras(app),
    ticker,
    h('button', { class: 'btn sm ghost', onclick: () => app.setTab('mundo') }, '📰 Noticias'),
  ];
}
