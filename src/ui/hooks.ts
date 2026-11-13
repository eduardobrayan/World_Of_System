/** Ganchos antes y después de cada turno (eventos pendientes, avisos, autoguardado, fin de partida). */
import type { App } from './app';
import { toast } from './dom';
import { afterTurnExtras, beforeTurnExtras } from './turnflow';

export function hookBeforeTurn(app: App): boolean {
  return beforeTurnExtras(app);
}

/** Muestra como aviso las noticias importantes que afectan al jugador desde la última comprobación. */
export function flushNewsToasts(app: App) {
  const w = app.world;
  const pid = w.player?.country;
  const seen = (app.ui.newsSeen as number | undefined) ?? w.news.length;
  for (let i = Math.min(seen, w.news.length); i < w.news.length; i++) {
    const n = w.news[i];
    if (n.importance >= 2 && pid && n.countries.includes(pid)) toast(n.text, n.type === 'derrota' || n.type === 'crisis' ? 'bad' : 'info');
  }
  app.ui.newsSeen = w.news.length;
}

export function hookAfterTurn(app: App) {
  flushNewsToasts(app);
  afterTurnExtras(app);
}
