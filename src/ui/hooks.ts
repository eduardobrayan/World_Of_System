/** Ganchos antes y después de cada turno (eventos pendientes, avisos, autoguardado, fin de partida). */
import type { App } from './app';
import { toast } from './dom';
import { afterTurnExtras, beforeTurnExtras } from './turnflow';
import { newsSince } from './live';
import type { NewsItem } from '../sim/types';

export function hookBeforeTurn(app: App): boolean {
  return beforeTurnExtras(app);
}

/** Muestra como aviso las noticias importantes que afectan al jugador desde la última comprobación. */
export function flushNewsToasts(app: App) {
  const w = app.world;
  const pid = w.player?.country;
  const last = app.ui.newsLast as NewsItem | undefined;
  const fresh = last === undefined ? [] : newsSince(w.news, last);
  for (const n of fresh) {
    if (n.importance >= 2 && pid && n.countries.includes(pid)) toast(n.text, n.type === 'derrota' || n.type === 'crisis' ? 'bad' : 'info');
  }
  app.ui.newsLast = w.news[w.news.length - 1] ?? null;
}

export function hookAfterTurn(app: App) {
  flushNewsToasts(app);
  afterTurnExtras(app);
}
