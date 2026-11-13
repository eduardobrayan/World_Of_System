/** Secciones adicionales del resumen final. */
import type { App } from './app';
import type { Snapshot } from '../sim/types';
import { h } from './dom';

export function endExtras(app: App): HTMLElement[] {
  const w = app.world;
  const p = app.player;
  if (!p) return [];
  const first = p.history[0], last = p.history[p.history.length - 1];
  if (!first || !last) return [];
  const years = Math.max(1 / 12, (last.t - first.t) / 12);
  const cagr = (Math.pow(last.gdp / first.gdp, 1 / years) - 1) * 100;
  return [h('div', { class: 'card', style: 'margin-top:10px' },
    h('div', { class: 'grid2 small' },
      h('div', null, `Meses de gobierno: ${last.t - first.t}`), h('div', null, `Crecimiento medio: ${cagr.toFixed(2)} %/año`),
      h('div', null, `Deuda: ${first.debt.toFixed(0)} % → ${last.debt.toFixed(0)} %`), h('div', null, `Aprobación: ${first.approval.toFixed(0)} → ${last.approval.toFixed(0)}`),
      h('div', null, `Población: ${first.pop.toFixed(1)} → ${last.pop.toFixed(1)} M`), h('div', null, `Guerras en el mundo: ${w.wars.length}`),
      ...securityLines(w, first, last)))];
}

/** Seguridad y sociedad (F7): presión social, corrupción, cárteles y brotes provocados. */
function securityLines(w: App['world'], first: Snapshot, last: Snapshot): HTMLElement[] {
  const arrow = (a: number | undefined, b: number | undefined) => (typeof a === 'number' && typeof b === 'number' ? `${a.toFixed(0)} → ${b.toFixed(0)}` : '—');
  const released = w.timeline.filter((e) => e.text.startsWith('Liberas «')).length;
  const leaks = w.timeline.filter((e) => e.text.startsWith('Fuga de laboratorio')).length;
  return [
    h('div', null, `Presión social: ${arrow(first.pressure, last.pressure)}`), h('div', null, `Corrupción: ${arrow(first.corruption, last.corruption)}`),
    h('div', null, `Poder de los cárteles: ${arrow(first.cartels, last.cartels)}`), h('div', null, `Criminalidad: ${arrow(first.crime, last.crime)}`),
    released || leaks ? h('div', { style: 'grid-column:1/-1' }, `☣ Brotes provocados: ${released} liberado(s), ${leaks} fuga(s) de laboratorio`) : null,
  ].filter((x): x is HTMLDivElement => !!x);
}
