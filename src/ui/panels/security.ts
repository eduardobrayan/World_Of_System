/** Pestaña de Seguridad interior: cuerpos policiales, criminalidad, corrupción por tipos y narcotráfico. */
import type { App } from '../app';
import type { ActionDef } from '../../sim/types';
import { h } from '../dom';
import { section, stat, plainStat, histChart, refBar } from '../components';
import { ACTION_BY_ID, previewAction } from '../../sim/actions';
import { openAction } from '../actionui';
import { corruptionBreakdown, narcoRevenue, NARCO_NAMES } from '../../sim/security';
import { contributions, tip } from '../tooltip';
import { modParts } from '../../sim/vars';
import { flagEl } from '../flags';

function actBtns(app: App, ids: string[]): HTMLElement {
  return h('div', { class: 'row wrap', style: 'margin-top:8px' }, ids.map((id) => ACTION_BY_ID[id]).filter(Boolean).map((d: ActionDef) => {
    const c = app.player!;
    const pv = previewAction(app.world, d, { actor: c });
    const done = !!(d.params?.law && c.pol.flags[d.id]);
    return h('button', { class: `btn sm ${done ? 'on' : ''}`, title: pv.ok ? d.desc : pv.unmet.join(' · '), disabled: done, onclick: () => openAction(app, d, {}) },
      `${done ? '✓ ' : ''}${d.name}${pv.ap ? ` ⚡${pv.ap}` : ''}`);
  }));
}

export function renderSecurity(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const w = app.world, p = c.police, n = c.narco, b = c.base;
  const out: HTMLElement[] = [h('h2', null, '🚓 Seguridad interior')];

  out.push(section('Cuerpos policiales',
    h('div', { class: 'grid2' },
      stat(app, 'policeSize', c), stat(app, 'policeEff', c),
      plainStat('Formación', p.training.toFixed(0), 'Academias, investigación criminal y policía científica (0–100).'),
      plainStat('Militarización', p.militarization.toFixed(0), 'Armamento y tácticas militares: reprime mejor las protestas pero erosiona la confianza ciudadana.'),
      plainStat('Integridad', p.integrity.toFixed(0), 'Agentes honrados (100 − corrupción policial). Una policía corrupta es poco eficaz.'),
      stat(app, 'crime', c)),
    h('div', { class: 'small muted', style: 'margin-top:4px' }, `Presupuesto de seguridad interior: ${c.eco.budget.security.toFixed(2)} % del PIB (ajústalo en Economía). Criminalidad habitual: ${b.crime.toFixed(0)}.`),
    actBtns(app, ['reclutar_policias', 'formacion_policial', 'depuracion_policial', 'policia_comunitaria', 'militarizar_policia'])));

  const types = corruptionBreakdown(c);
  out.push(section(`Corrupción: ${c.pol.corruption.toFixed(0)} / 100`,
    h('div', { class: 'small ink2', style: 'margin-bottom:6px' }, 'Seis tipos con efectos distintos. La marca indica el nivel de 2026; pasa el ratón para ver qué la mueve.'),
    ...types.map((t) => {
      const row = h('div', { class: 'need-row' }, h('span', null, t.icon), h('span', null, t.name),
        refBar(t.value, t.base, t.value > 60 ? '#d03b3b' : t.value < 30 ? '#0ca30c' : '#fab219'), h('span', { class: 'n' }, t.value.toFixed(0)));
      tip(row, () => h('div', null, h('div', { class: 't' }, `Corrupción ${t.name.toLowerCase()}`), h('p', { class: 'small' }, t.desc), contributions(modParts(c, `corr.${t.type}`))));
      return row;
    }),
    histChart(c, ['corruption'], ['Corrupción'], (v) => v.toFixed(0), 90),
    actBtns(app, ['ley_anticorrupcion', 'fiscalia_anticorrupcion', 'reforma_judicial', 'administracion_digital', 'autoridad_electoral', 'lucha_blanqueo', 'campana_anticorrupcion', 'clientelismo'])));

  const rev = narcoRevenue(w, c);
  out.push(section('Narcotráfico',
    h('div', { class: 'small ink2', style: 'margin-bottom:6px' }, `Negocio estimado en tu país: ${rev.toFixed(1)} mil millones $ al año (${((rev / c.eco.gdp) * 100).toFixed(1)} % del PIB). Demanda mundial: ×${(w.global.narcoDemand ?? 1).toFixed(2)} respecto a 2026.`),
    ...(['cartels', 'violence', 'production', 'transit', 'consumption'] as const).map((k) => {
      const row = h('div', { class: 'need-row' }, h('span', null, { cartels: '💀', violence: '🔫', production: '🌿', transit: '🚤', consumption: '💊' }[k]), h('span', null, NARCO_NAMES[k]),
        refBar(n[k], b[`narco_${k}`], n[k] > 60 ? '#d03b3b' : undefined), h('span', { class: 'n' }, n[k].toFixed(0)));
      tip(row, () => h('div', null, h('div', { class: 't' }, NARCO_NAMES[k]), contributions(modParts(c, `narco.${k}`))));
      return row;
    }),
    histChart(c, ['cartels', 'crime'], ['Cárteles', 'Criminalidad'], (v) => v.toFixed(0), 100),
    actBtns(app, ['ofensiva_antinarco', 'sustitucion_cultivos', 'tratamiento_adicciones', 'legalizar_cannabis', 'negociar_carteles']),
    h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Cooperación antidroga con otro país: selecciónalo en el mapa (pestaña Diplomacia del panel derecho). Financiar cárteles de un rival: operaciones encubiertas.')));

  const hot = w.order.map((id) => w.countries[id]).filter((x) => x.alive).sort((a, b2) => b2.narco.cartels + b2.narco.transit - (a.narco.cartels + a.narco.transit)).slice(0, 8);
  out.push(section('Rutas y focos mundiales',
    h('table', { class: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'País'), h('th', { class: 'n' }, 'Cárteles'), h('th', { class: 'n' }, 'Tránsito'), h('th', { class: 'n' }, 'Producción'))),
      h('tbody', null, hot.map((x) => h('tr', { class: 'click', onclick: () => app.onSelect(x.id) }, h('td', null, flagEl(x, 16, 11), ' ', x.short),
        h('td', { class: 'n' }, x.narco.cartels.toFixed(0)), h('td', { class: 'n' }, x.narco.transit.toFixed(0)), h('td', { class: 'n' }, x.narco.production.toFixed(0))))))));
  return out;
}
