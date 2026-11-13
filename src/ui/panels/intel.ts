/** Pestaña de Inteligencia: capacidades, redes, operaciones en curso y precisión de la información. */
import type { App } from '../app';
import type { Country } from '../../sim/types';
import { h } from '../dom';
import { section, plainStat, bar } from '../components';
import { ACTION_BY_ID, actionsIn } from '../../sim/actions';
import { openAction } from '../actionui';
import { OP_NAMES, counterLevel, intelLevel } from '../../sim/intel';
import { intelAccuracy } from '../../sim/perception';
import { flagEl } from '../flags';

export function renderIntel(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const w = app.world;
  const out: HTMLElement[] = [h('h2', null, '🕵 Inteligencia')];
  out.push(section('Capacidades',
    plainStat('Servicios de inteligencia', intelLevel(c).toFixed(0), 'Capacidad de tus espías: mejora el éxito de las operaciones y la precisión de tu información.'),
    plainStat('Contrainteligencia', counterLevel(c).toFixed(0), 'Dificulta las operaciones extranjeras en tu país y las descubre más a menudo.'),
    h('div', { class: 'row wrap', style: 'margin-top:6px' }, actionsIn('inteligencia_propia').map((d) => h('button', { class: 'btn sm', onclick: () => openAction(app, d, {}) }, d.name)))));
  out.push(section(`Operaciones en curso (${c.intel.ops.length}/4)`, c.intel.ops.length ? h('div', { class: 'list' }, c.intel.ops.map((o) => h('div', { class: 'item small' },
    h('b', null, `${OP_NAMES[o.op]} → ${w.countries[o.target]?.name}`),
    h('div', { class: 'muted' }, `${o.remaining} meses · éxito ${(o.success * 100).toFixed(0)} % · riesgo de exposición ${(o.discovery * 100).toFixed(0)} %`)))) : h('div', { class: 'muted small' }, 'Ninguna. Selecciona un país en el mapa para lanzar una operación.')));
  const others = w.order.map((id) => w.countries[id]).filter((x) => x.alive && x.id !== c.id)
    .sort((a, b) => (c.intel.networks[b.id] ?? 0) - (c.intel.networks[a.id] ?? 0) || b.eco.gdp - a.eco.gdp).slice(0, 20);
  out.push(section('Redes y precisión de la información',
    h('div', { class: 'small muted', style: 'margin-bottom:6px' }, 'La precisión depende de tu red en el país, tu capacidad, su transparencia y vuestras alianzas.'),
    h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'País'), h('th', { class: 'n' }, 'Red'), h('th', null, 'Precisión'))),
      h('tbody', null, others.map((o) => {
        const acc = intelAccuracy(w, c.id, o.id);
        return h('tr', { class: 'click', onclick: () => app.onSelect(o.id) }, h('td', null, flagEl(o, 16, 11), ' ', o.short),
          h('td', { class: 'n' }, (c.intel.networks[o.id] ?? 0).toFixed(0)),
          h('td', null, h('div', { style: 'width:100px' }, bar(acc * 100, 100, acc > 0.85 ? '#0ca30c' : acc > 0.6 ? '#fab219' : '#d03b3b'))));
      })))));
  const exposed = [...w.news].reverse().filter((n) => n.type === 'inteligencia' && n.countries.includes(c.id)).slice(0, 8);
  out.push(section('Informes recientes', exposed.length ? h('div', { class: 'list' }, exposed.map((n) => h('div', { class: 'item small' }, n.text))) : h('div', { class: 'muted small' }, 'Sin informes.')));
  return out;
}

export function intelButtons(app: App, t: Country): HTMLElement {
  return h('div', null, h('h4', null, 'Operaciones encubiertas'),
    h('div', { class: 'row wrap' }, actionsIn('inteligencia').map((d) => h('button', { class: `btn sm ${d.id === 'op_golpe' ? 'danger' : ''}`, onclick: () => openAction(app, ACTION_BY_ID[d.id], { target: t }) }, d.name))));
}
