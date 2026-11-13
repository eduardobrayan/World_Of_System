/** Panel derecho: país seleccionado (información percibida) o región seleccionada en el mapa local. */
import type { App } from '../app';
import type { Country, Region } from '../../sim/types';
import { h } from '../dom';
import { flagEl } from '../flags';
import { DATA, ideologyOf, regimeOf, BUILDING_BY_ID } from '../../sim/data';
import { kpi, plainStat, section, bar } from '../components';
import { accuracyOf } from '../perceive';
import { fmtMoney } from '../../sim/util';
import { buildingCost, buildingMonths, canBuild, orderBuilding } from '../../sim/regions';
import { toast } from '../dom';
import { tip } from '../tooltip';
import { rightExtras } from './rightExtras';

export function renderRight(app: App): HTMLElement[] {
  const w = app.world;
  const id = app.selected ?? app.player?.id ?? null;
  const header = h('div', { class: 'row between', style: 'padding:8px 12px;border-bottom:1px solid var(--line)' },
    h('span', { class: 'small muted' }, app.selectedRegion ? 'Región seleccionada' : 'País seleccionado'),
    h('button', { class: 'btn sm ghost', title: 'Ocultar panel', onclick: () => { app.toggleRight(); app.root.classList.remove('show-right'); } }, '✕'));
  if (!id) return [header, h('div', { class: 'panel-body muted' }, 'Haz clic en un país del mapa para ver su información.')];
  const c = w.countries[id];
  if (app.selectedRegion) {
    const owner = Object.values(w.countries).find((x) => x.regions.some((r) => r.id === app.selectedRegion));
    const r = owner?.regions.find((x) => x.id === app.selectedRegion);
    if (owner && r) return [header, h('div', { class: 'panel-body' }, regionPanel(app, owner, r))];
  }
  return [header, h('div', { class: 'panel-body' }, countryPanel(app, c))];
}

function countryPanel(app: App, c: Country): HTMLElement[] {
  const w = app.world;
  const isMe = app.player?.id === c.id;
  const reg = regimeOf(c.pol.regime);
  const ideo = ideologyOf(c.pol.ideology);
  const acc = accuracyOf(w, app.player, c);
  const out: HTMLElement[] = [];
  out.push(h('div', { class: 'row', style: 'margin-bottom:6px' }, flagEl(c, 36, 24),
    h('div', { class: 'grow' }, h('h2', { style: 'margin:0' }, c.name),
      h('div', { class: 'small ink2' }, c.isBlock ? `Bloque regional · capital de referencia: ${c.capital}` : `${c.pol.leaderTitle} · ${c.pol.govParty || 'Gobierno'} · ${c.capital}`))));
  out.push(h('div', { class: 'row wrap', style: 'margin-bottom:8px' },
    h('span', { class: 'tag' }, reg.name), h('span', { class: 'tag', style: `border-color:${ideo.color}` }, ideo.name),
    isMe ? h('span', { class: 'tag blue' }, 'Tu país') : null,
    c.isBlock ? h('span', { class: 'tag' }, `${c.regions.length} países`) : null,
    c.mil.nukes > 0 ? h('span', { class: 'tag red', title: 'Potencia nuclear' }, '☢ nuclear') : null));
  if (!isMe && app.player) {
    const accEl = h('div', { class: 'small', style: 'margin-bottom:8px' },
      h('div', { class: 'row between' }, h('span', { class: 'ink2' }, 'Precisión de la información'), h('b', null, `${Math.round(acc * 100)} %`)),
      bar(acc * 100, 100, acc > 0.85 ? '#0ca30c' : acc > 0.6 ? '#fab219' : '#d03b3b'));
    tip(accEl, () => 'Los datos de otros países se muestran con ruido según tu red de espionaje, tu capacidad de inteligencia, la transparencia del país (libertad de prensa) y tus alianzas. "≈" indica un valor aproximado.');
    out.push(accEl);
  }
  out.push(h('div', { class: 'kpis' },
    kpi(app, 'gdp', c), kpi(app, 'growth', c), kpi(app, 'inflation', c),
    kpi(app, 'unemployment', c), kpi(app, 'stability', c), kpi(app, 'approval', c)));
  out.push(h('div', { class: 'row wrap', style: 'margin-bottom:10px' },
    h('button', { class: 'btn sm', onclick: () => app.onOpenLocal(c.id) }, '🗺 Ver territorio'),
    h('button', { class: 'btn sm', onclick: () => app.map.focus(c.id) }, '🎯 Centrar')));
  out.push(...rightExtras(app, c));
  out.push(section('Datos generales',
    plainStat('Población', `${c.soc.pop.toFixed(c.soc.pop < 10 ? 2 : 1)} M`),
    kpiRow(app, c, 'gdppc'), kpiRow(app, c, 'debt'), kpiRow(app, c, 'power'),
    plainStat('Recursos', resourcesText(c)),
    plainStat('Organismos', Object.values(w.orgs).filter((o) => o.type !== 'universal' && o.members.includes(c.id)).map((o) => o.short).join(', ') || '—')));
  return out;
}

function kpiRow(app: App, c: Country, key: string): HTMLElement {
  const el = kpi(app, key, c);
  el.style.marginBottom = '6px';
  return el;
}

function resourcesText(c: Country): string {
  const out: string[] = [];
  const names: Record<string, string> = { oil: 'petróleo', gas: 'gas', minerals: 'minerales', food: 'alimentos', chips: 'chips' };
  for (const k of ['oil', 'gas', 'minerals', 'food', 'chips'] as const) {
    const r = c.res[k];
    if (r.prod > r.cons * 1.15 && r.prod > 0.05) out.push(`exporta ${names[k]}`);
    else if (r.cons > r.prod * 1.5 && r.cons > 0.05) out.push(`importa ${names[k]}`);
  }
  return out.join(', ') || 'equilibrado';
}

function regionPanel(app: App, c: Country, r: Region): HTMLElement[] {
  const w = app.world;
  const isMine = app.player?.id === r.owner;
  const out: HTMLElement[] = [];
  out.push(h('div', { class: 'row', style: 'margin-bottom:4px' }, flagEl(c, 24, 16), h('h2', { style: 'margin:0' }, r.name)));
  out.push(h('div', { class: 'small ink2', style: 'margin-bottom:8px' }, `${r.capital ? '★ Capital · ' : ''}${r.city} · ${c.name} · terreno ${r.terrain} · ${r.coastal ? 'costera' : 'interior'} · especialización: ${r.spec}`));
  if (r.controller !== r.owner) out.push(h('div', { class: 'tag red', style: 'margin-bottom:8px' }, `Ocupada por ${w.countries[r.controller]?.name ?? r.controller}`));
  const ind = (k: string, v: string, tipText: string) => plainStat(k, v, tipText);
  out.push(section('Indicadores regionales',
    ind('Población', `${r.pop.toFixed(2)} M`, 'Habitantes de la región.'),
    ind('Desempleo', `${r.unemployment.toFixed(1)} %`, 'Paro regional: el nacional ajustado por desarrollo y empleo creado por fábricas, obras e industria.'),
    ind('Producción', fmtMoney(r.production), 'Parte del PIB nacional generada en la región.'),
    ind('Infraestructuras', r.infra.toFixed(0), 'Carreteras, ferrocarril, puertos y aeropuertos. Suman al índice nacional y al crecimiento potencial.'),
    ind('Calidad de vida', r.quality.toFixed(0), 'Sanidad, educación, infraestructuras, seguridad y renta. Afecta a la satisfacción nacional.'),
    ind('Seguridad', r.security.toFixed(0), 'Orden público. Sube con policía y bases; baja con protestas, desigualdad y guerra.'),
    ind('Educación', r.education.toFixed(0), 'Índice educativo regional. Las universidades lo elevan.'),
    ind('Sanidad', r.health.toFixed(0), 'Índice sanitario regional. Los hospitales lo elevan.'),
    ind('Ingresos fiscales', fmtMoney(r.taxes), 'Recaudación atribuible a la región.'),
    ind('Desarrollo', r.development.toFixed(0), 'Media de infraestructuras, educación, sanidad y calidad de vida.'),
    r.damage > 1 ? ind('Daños', r.damage.toFixed(0), 'Daños por guerra o desastres; se reparan poco a poco.') : null));
  const blds = Object.entries(r.buildings).filter(([, n]) => n > 0);
  out.push(section('Infraestructuras existentes',
    blds.length ? h('div', { class: 'row wrap' }, blds.map(([id, n]) => {
      const b = BUILDING_BY_ID[id];
      const extra = n - (r.baseBuildings[id] ?? 0);
      return h('span', { class: `tag ${extra > 0 ? 'blue' : ''}`, title: b?.desc ?? id }, `${b?.icon ?? ''} ${b?.name ?? id} ×${n}${extra > 0 ? ` (+${extra})` : ''}`);
    })) : h('div', { class: 'muted small' }, 'Sin infraestructuras destacadas.'),
    r.queue.length ? h('div', { style: 'margin-top:8px' }, h('h4', null, 'En construcción'),
      r.queue.map((q) => h('div', { class: 'stat' }, h('span', null, `${BUILDING_BY_ID[q.building]?.icon ?? '🏗'} ${BUILDING_BY_ID[q.building]?.name ?? q.building}`),
        h('span', { class: 'v' }, `${q.remaining} meses`)))) : null));
  if (isMine) {
    const list = DATA.buildings.map((b) => {
      const why = canBuild(w, c, r, b);
      const cost = buildingCost(c, r, b);
      const months = buildingMonths(c, b);
      const btn = h('button', { class: 'btn sm', disabled: !!why, onclick: () => {
        const res = orderBuilding(w, c, r.id, b.id);
        toast(res.text, res.ok ? 'good' : 'bad');
        app.refresh();
      } }, 'Construir');
      const row = h('div', { class: 'item' },
        h('div', { class: 'row between' }, h('b', null, `${b.icon} ${b.name}`), btn),
        h('div', { class: 'small ink2' }, `${fmtMoney(cost)} · ${months} meses · mantenimiento ${fmtMoney(b.upkeep * cost / Math.max(0.01, b.cost))}/año`),
        h('div', { class: 'small muted' }, why ?? effectsText(b.effects)));
      tip(row, () => h('div', null, h('div', { class: 't' }, b.name), h('div', { class: 'desc' }, b.desc),
        h('div', { class: 'small' }, `Efectos: ${effectsText(b.effects)}`),
        h('div', { class: 'small muted' }, 'El coste se paga a lo largo de la obra y suma al déficit. Cada edificio adicional en la misma región rinde un 15 % menos.')));
      return row;
    });
    out.push(section('Construir', h('div', { class: 'list' }, list)));
  }
  return out;
}

const FX_NAMES: Record<string, string> = {
  infra: 'infraestructuras', education: 'educación', health: 'sanidad', security: 'seguridad', quality: 'calidad de vida', jobs: 'empleo',
  output: 'producción', food: 'alimentos', minerals: 'minerales', oil: 'petróleo', gas: 'gas', chips: 'chips', research: 'investigación',
  exports: 'exportaciones', renewables: 'energía limpia', corruption: 'corrupción', taxEfficiency: 'recaudación', gini: 'desigualdad',
  readiness: 'preparación militar', logistics: 'logística',
};

export function effectsText(fx: Record<string, number>): string {
  return Object.entries(fx).map(([k, v]) => `${v > 0 ? '+' : ''}${v} ${FX_NAMES[k] ?? k}`).join(', ');
}
