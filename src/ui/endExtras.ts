/** Secciones adicionales del resumen final. */
import type { App } from './app';
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
      h('div', null, `Población: ${first.pop.toFixed(1)} → ${last.pop.toFixed(1)} M`), h('div', null, `Guerras en el mundo: ${w.wars.length}`)))];
}
