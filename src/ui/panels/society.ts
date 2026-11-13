/** Pestaña de Sociedad: demografía, indicadores sociales y grupos de apoyo con sus causas. */
import type { App } from '../app';
import { GROUPS } from '../../sim/types';
import { DATA, regimeOf } from '../../sim/data';
import { h } from '../dom';
import { section, stat, histChart, bar, refBar } from '../components';
import { NEEDS } from '../../sim/needs';
import { contributions, tip } from '../tooltip';

export function renderSociety(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const inf = regimeOf(c.pol.regime).influence;
  const out: HTMLElement[] = [h('h2', null, '👥 Sociedad')];
  out.push(section('Demografía', h('div', { class: 'grid2' }, stat(app, 'pop', c), stat(app, 'medianAge', c), stat(app, 'birth', c), stat(app, 'death', c), stat(app, 'migration', c)),
    histChart(c, ['pop'], ['Población (M)'], (v) => v.toFixed(1), 100)));
  out.push(section('Bienestar', h('div', { class: 'grid2' }, stat(app, 'education', c), stat(app, 'health', c), stat(app, 'gini', c), stat(app, 'satisfaction', c),
    stat(app, 'trust', c), stat(app, 'protest', c), stat(app, 'strikes', c), stat(app, 'pressFreedom', c))));
  out.push(section(`Necesidades civiles · presión social ${c.soc.pressure.toFixed(0)}`,
    h('div', { class: 'small ink2', style: 'margin-bottom:6px' }, 'Cobertura de cada necesidad (0–100). La marca es el nivel al que la población está acostumbrada: si se cae por debajo, crece la presión social (protestas, emigración, descontento). Pasa el ratón para ver las causas.'),
    ...NEEDS.map((nd) => {
      const v = c.soc.needs[nd.id] ?? 0, ref = c.base[`need_${nd.id}`] ?? v;
      const row = h('div', { class: 'need-row' }, h('span', null, nd.icon), h('span', null, nd.name),
        refBar(v, ref, v < ref - 5 ? '#d03b3b' : v > ref + 3 ? '#0ca30c' : undefined), h('span', { class: `n ${v < ref - 5 ? 'bad' : ''}` }, v.toFixed(0)));
      tip(row, () => h('div', null, h('div', { class: 't' }, `${nd.icon} ${nd.name}`), h('p', { class: 'small' }, nd.desc), contributions(c.explain[`need.${nd.id}`] ?? [])));
      return row;
    }),
    (() => { const el = h('div', { style: 'margin-top:6px' }, stat(app, 'pressure', c)); return el; })(),
    histChart(c, ['pressure', 'protest'], ['Presión social', 'Protestas'], (v) => v.toFixed(0), 100)));
  out.push(h('h3', { style: 'margin:12px 0 6px' }, 'Grupos sociales'));
  out.push(h('p', { class: 'small ink2' }, 'El peso demográfico decide la aprobación; la influencia (según el régimen) decide la base de poder y la estabilidad. Pasa el ratón para ver qué mueve a cada grupo.'));
  for (const g of GROUPS) {
    const gs = c.groups[g];
    const def = DATA.groups[g];
    const el = h('div', { class: 'card' },
      h('div', { class: 'row between' }, h('b', null, `${def.icon} ${def.name}`), h('span', { style: 'font-size:18px;font-weight:650' }, gs.support.toFixed(0))),
      bar(gs.support, 100, gs.support < 35 ? '#d03b3b' : gs.support > 60 ? '#0ca30c' : undefined),
      h('div', { class: 'row wrap small ink2', style: 'margin-top:4px;gap:12px' },
        h('span', null, `Peso demográfico ${(def.popWeight * 100).toFixed(0)} %`), h('span', null, `Influencia ×${inf[g].toFixed(1)}`), h('span', { class: gs.radical > 40 ? 'bad' : '' }, `Radicalización ${gs.radical.toFixed(0)}`)),
      h('div', { class: 'small muted' }, def.desc));
    tip(el, () => h('div', null, h('div', { class: 't' }, def.name), contributions(c.explain[`group.${g}`] ?? [])));
    out.push(el);
  }
  out.push(section('Protestas y aprobación', histChart(c, ['protest', 'approval'], ['Protestas', 'Aprobación'], (v) => v.toFixed(0), 120)));
  return out;
}
