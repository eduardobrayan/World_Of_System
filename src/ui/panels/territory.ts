/** Pestaña de Territorio: regiones, indicadores locales y obras en curso. */
import type { App } from '../app';
import { h } from '../dom';
import { section } from '../components';
import { BUILDING_BY_ID } from '../../sim/data';
import { fmtMoney } from '../../sim/util';

export function renderTerritory(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  const regions = c.regions.filter((r) => r.owner === c.id);
  const queue = regions.flatMap((r) => r.queue.map((q) => ({ r, q })));
  const out: HTMLElement[] = [h('h2', null, '🗺 Territorio'),
    h('p', { class: 'small ink2' }, 'Cada región tiene sus propios indicadores. Lo que construyas en ellas suma a las estadísticas nacionales (educación, sanidad, infraestructuras, empleo, producción, energía…).'),
    h('button', { class: 'btn primary', style: 'margin-bottom:10px', onclick: () => app.onOpenLocal(c.id) }, '🗺 Abrir mapa local')];
  out.push(section('Regiones', h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, h('th', null, 'Región'), h('th', { class: 'n' }, 'Pobl.'), h('th', { class: 'n' }, 'Paro'), h('th', { class: 'n' }, 'Infra.'), h('th', { class: 'n' }, 'Calidad'), h('th', { class: 'n' }, 'Desarr.'))),
    h('tbody', null, regions.map((r) => h('tr', { class: 'click', onclick: () => { app.onOpenLocal(c.id); app.onSelectRegion(r.id); } },
      h('td', null, `${r.capital ? '★ ' : ''}${r.name}`, r.controller !== r.owner ? h('span', { class: 'tag red', style: 'margin-left:4px' }, 'ocupada') : null),
      h('td', { class: 'n' }, r.pop.toFixed(1)), h('td', { class: 'n' }, `${r.unemployment.toFixed(1)}%`), h('td', { class: 'n' }, r.infra.toFixed(0)),
      h('td', { class: 'n' }, r.quality.toFixed(0)), h('td', { class: 'n' }, r.development.toFixed(0))))))));
  out.push(section(`Obras en curso (${queue.length})`, queue.length ? h('div', { class: 'list' }, queue.map(({ r, q }) => {
    const b = BUILDING_BY_ID[q.building];
    return h('div', { class: 'item small' }, h('div', { class: 'row between' }, h('b', null, `${b?.icon ?? ''} ${b?.name ?? q.building}`), h('span', { class: 'muted' }, `${q.remaining}/${q.total} meses`)),
      h('div', { class: 'muted' }, r.name));
  })) : h('div', { class: 'muted small' }, 'Ninguna. Abre el mapa local y elige una región para construir.')));
  const lost = c.regions.filter((r) => r.owner !== c.id);
  if (lost.length) out.push(section('Regiones perdidas', ...lost.map((r) => h('div', { class: 'small' }, `${r.name} (ahora de ${app.world.countries[r.owner]?.name ?? r.owner})`))));
  out.push(h('div', { class: 'small muted' }, `Gasto mensual en obras y mantenimiento extra: ${fmtMoney(c.eco.extraSpending / 12)}`));
  return out;
}
