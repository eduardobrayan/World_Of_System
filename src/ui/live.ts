/**
 * Sensación de tiempo real sobre la simulación mensual:
 *  - Noticias en directo: las del mes recién calculado entran una a una en el teletipo a lo largo del mes.
 *  - Cifras que interpolan: los indicadores de la barra superior se animan del valor anterior al nuevo.
 * Todo es presentación: no toca el estado de la simulación (que sigue siendo determinista).
 */
import type { App } from './app';
import type { NewsItem } from '../sim/types';
import { SPEEDS } from './app';
import { dateLabel } from '../sim/util';

interface Tween { el: HTMLElement; from: number; to: number; fmt: (v: number) => string; start: number; dur: number }

interface LiveState { last: NewsItem | null; queue: NewsItem[]; current: NewsItem | null; nextAt: number; tweens: Tween[]; vals: Record<string, { turn: number; v: number }> }

export function liveState(app: App): LiveState {
  return (app.ui.live as LiveState | undefined) ?? (app.ui.live = { last: app.world.news[app.world.news.length - 1] ?? null, queue: [], current: null, nextAt: 0, tweens: [], vals: {} } as LiveState) as LiveState;
}

/**
 * Noticias publicadas después de `last` (por referencia: el registro se recorta a 600 entradas, así
 * que su longitud deja de crecer y no sirve como marca).
 */
export function newsSince(list: NewsItem[], last: NewsItem | null): NewsItem[] {
  if (!last) return list.slice();
  const i = list.lastIndexOf(last);
  return i < 0 ? [] : list.slice(i + 1);
}

/** Noticia que debe verse ahora en el teletipo (la última revelada en directo, o la más relevante). */
export function tickerNews(app: App): NewsItem | undefined {
  const st = liveState(app);
  if (st.current) return st.current;
  const w = app.world, pid = w.player?.country;
  return [...w.news].reverse().find((n) => !pid || n.countries.includes(pid) || n.importance >= 2) ?? w.news[w.news.length - 1];
}

export function fillTicker(el: HTMLElement, n: NewsItem | undefined, live = false) {
  el.innerHTML = '';
  if (!n) { el.textContent = 'Sin noticias todavía.'; return; }
  if (live) el.appendChild(Object.assign(document.createElement('span'), { className: 'live-dot', textContent: 'EN DIRECTO' }));
  el.appendChild(Object.assign(document.createElement('b'), { textContent: `${dateLabel(n.turn)} · ` }));
  el.appendChild(document.createTextNode(n.text));
}

/** Registra la animación de un número de la barra superior si cambió desde el mes anterior. */
export function tweenNumber(app: App, key: string, el: HTMLElement, value: number, fmt: (v: number) => string) {
  const st = liveState(app);
  const turn = app.world.turn;
  const prev = st.vals[key];
  st.vals[key] = prev && prev.turn === turn ? prev : { turn, v: value };
  if (!prev || prev.turn === turn || !Number.isFinite(prev.v) || prev.v === value) return;
  st.tweens = st.tweens.filter((t) => t.el.isConnected);
  st.tweens.push({ el, from: prev.v, to: value, fmt, start: performance.now(), dur: 900 });
  el.textContent = fmt(prev.v);
}

export function liveTick(app: App, now: number) {
  const st = liveState(app);
  // Cifras
  if (st.tweens.length) {
    st.tweens = st.tweens.filter((t) => {
      if (!t.el.isConnected) return false;
      const k = Math.min(1, (now - t.start) / t.dur);
      const e = 1 - Math.pow(1 - k, 3);
      t.el.textContent = t.fmt(t.from + (t.to - t.from) * e);
      return k < 1;
    });
  }
  // Noticias del mes en directo
  const w = app.world, pid = w.player?.country;
  const fresh0 = newsSince(w.news, st.last);
  st.last = w.news[w.news.length - 1] ?? null;
  if (fresh0.length) {
    const fresh = fresh0.filter((n) => n.importance >= 1 || (pid && n.countries.includes(pid)));
    // Las del mes nuevo sustituyen a las que no dio tiempo a mostrar (el directo nunca va con retraso)
    const mine = (n: NewsItem) => (pid && n.countries.includes(pid) ? 1 : 0);
    st.queue = fresh.sort((a, b) => mine(b) - mine(a) || b.importance - a.importance).slice(0, 6);
    st.nextAt = 0;
  }
  if (st.queue.length && now >= st.nextAt && (app.speed > 0 || !st.current)) {
    st.current = st.queue.shift()!;
    const monthMs = SPEEDS[app.speed] || SPEEDS[1];
    st.nextAt = now + Math.max(900, (monthMs * 0.85) / (st.queue.length + 1));
    const el = document.querySelector<HTMLElement>('.bottom .ticker');
    if (el) {
      fillTicker(el, st.current, true);
      el.classList.remove('live-in');
      void el.offsetWidth; // reinicia la animación de entrada
      el.classList.add('live-in');
    }
  }
}
