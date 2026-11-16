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
import { ACTION_BY_ID, previewAction } from '../../sim/actions';
import { openAction } from '../actionui';
import { relOp, allied } from '../../sim/vars';
import { relationTarget } from '../../sim/diplomacy';

export function renderRight(app: App): HTMLElement[] {
  const w = app.world;
  const id = app.selected ?? app.player?.id ?? null;
  const header = h('div', { class: 'right-head' },
    h('button', { class: 'close-x', title: 'Cerrar', 'aria-label': 'Cerrar', onclick: () => { app.toggleRight(); app.root.classList.remove('show-right'); } }, '✕'));
  if (!id) return [header, h('div', { class: 'panel-body muted' }, 'Pulsa un país del mapa para verlo.')];
  const c = w.countries[id];
  if (app.selectedRegion) {
    const owner = Object.values(w.countries).find((x) => x.regions.some((r) => r.id === app.selectedRegion));
    const r = owner?.regions.find((x) => x.id === app.selectedRegion);
    if (owner && r) return [header, h('div', { class: 'panel-body' }, regionPanel(app, owner, r))];
  }
  return [header, h('div', { class: 'panel-body' }, countryPanel(app, c))];
}

/** Cara, texto y color de la relación (opinión de −100 a 100). */
function moodOf(op: number): [string, string, string] {
  if (op >= 40) return ['😄', 'Muy buena', 'var(--good)'];
  if (op >= 12) return ['🙂', 'Buena', 'var(--good)'];
  if (op >= -12) return ['😐', 'Normal', 'var(--warning)'];
  if (op >= -40) return ['😟', 'Mala', 'var(--serious)'];
  return ['😡', 'Hostil', 'var(--critical)'];
}

function countryPanel(app: App, c: Country): HTMLElement[] {
  const w = app.world;
  const me = app.player;
  const isMe = me?.id === c.id;
  const reg = regimeOf(c.pol.regime);
  const ideo = ideologyOf(c.pol.ideology);
  const acc = accuracyOf(w, me, c);
  const out: HTMLElement[] = [];
  out.push(h('div', { class: 'cp-head' }, flagEl(c, 64, 42),
    h('div', { class: 'grow' }, h('h2', null, c.name),
      h('div', { class: 'sub' }, c.isBlock ? `Bloque de ${c.regions.length} países` : `${reg.name}`),
      isMe ? h('span', { class: 'tag blue', style: 'margin-top:4px' }, '⭐ Tu país') : null)));
  if (!isMe && me) {
    const op = relOp(w, c.id, me.id);
    const [face, label, col] = moodOf(op);
    const war = w.wars.some((x) => x.ceasefire <= 0 && ((x.attackers.includes(c.id) && x.defenders.includes(me.id)) || (x.defenders.includes(c.id) && x.attackers.includes(me.id))));
    const mood = h('div', { class: 'mood' }, h('span', { class: 'face', 'aria-hidden': 'true' }, war ? '⚔️' : face),
      h('div', { class: 'm-tx' }, h('span', { class: 'm-k' }, 'Cómo nos llevamos'),
        h('span', { class: 'm-v', style: `color:${war ? 'var(--critical)' : col}` }, war ? 'En guerra' : label),
        bar((op + 100) / 2, 100, war ? 'var(--critical)' : col),
        h('span', { class: 'tags' },
          allied(w, c.id, me.id) ? h('span', { class: 'tag green' }, '🛡️ Aliados') : null,
          c.mil.nukes > 0 ? h('span', { class: 'tag red' }, '☢️ Nuclear') : null)));
    tip(mood, () => h('div', null, h('div', { class: 't' }, `Opinión de ${c.short} sobre ti: ${op.toFixed(0)}`),
      h('div', { class: 'desc' }, `Va hacia ${relationTarget(w, c, me).value.toFixed(0)}. Sube con comercio, ayuda y tratados; baja con sanciones, amenazas y espionaje descubierto.`)));
    out.push(mood);
    out.push(quickActions(app, c));
  }
  out.push(h('div', { class: 'cp-mini' }, kpi(app, 'gdp', c), kpi(app, 'growth', c), kpi(app, 'stability', c)));
  out.push(h('div', { class: 'cp-tools' },
    h('button', { class: 'btn sm', onclick: () => app.onOpenLocal(c.id) }, '🗺️ Territorio'),
    h('button', { class: 'btn sm', onclick: () => app.map.focus(c.id) }, '🎯 Centrar')));
  // Lo detallado, plegado (modo avanzado)
  const more: HTMLElement[] = [];
  more.push(h('div', { class: 'row wrap', style: 'margin-bottom:10px' },
    h('span', { class: 'tag' }, reg.name), h('span', { class: 'tag', style: `border-color:${ideo.color}` }, ideo.name),
    c.isBlock ? h('span', { class: 'tag' }, `capital de referencia: ${c.capital}`) : h('span', { class: 'tag' }, `${c.pol.leaderTitle} · ${c.pol.govParty || 'Gobierno'}`)));
  if (!isMe && me) {
    const accEl = h('div', { class: 'small', style: 'margin-bottom:10px' },
      h('div', { class: 'row between' }, h('span', { class: 'ink2' }, '🔍 Fiabilidad de estos datos'), h('b', null, `${Math.round(acc * 100)} %`)),
      bar(acc * 100, 100, acc > 0.85 ? 'var(--good)' : acc > 0.6 ? 'var(--warning)' : 'var(--critical)'));
    tip(accEl, () => 'Los datos de otros países llevan ruido según tu red de espionaje, tu inteligencia, la libertad de prensa del país y tus alianzas. «≈» indica un valor aproximado.');
    more.push(accEl);
  }
  more.push(h('div', { class: 'kpis' }, kpi(app, 'inflation', c), kpi(app, 'unemployment', c), kpi(app, 'approval', c)));
  more.push(...rightExtras(app, c));
  more.push(section('Datos generales',
    plainStat('Población', `${c.soc.pop.toFixed(c.soc.pop < 10 ? 2 : 1)} M`),
    kpiRow(app, c, 'gdppc'), kpiRow(app, c, 'debt'), kpiRow(app, c, 'power'), kpiRow(app, c, 'corruption'), kpiRow(app, c, 'cartels'),
    plainStat('Recursos', resourcesText(c)),
    plainStat('Organismos', Object.values(w.orgs).filter((o) => o.type !== 'universal' && o.members.includes(c.id)).map((o) => o.short).join(', ') || '—')));
  const adv = h('details', { class: 'adv', open: app.ui.rightAdvanced ? '' : undefined },
    h('summary', null, isMe ? '📋 Más datos' : '📋 Más datos y todas las acciones'), h('div', null, ...more));
  adv.addEventListener('toggle', () => { app.ui.rightAdvanced = (adv as HTMLDetailsElement).open; });
  out.push(adv);
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

/** Acciones grandes con icono sobre otro país (las listas completas siguen en «Más datos» y en Diplomacia). */
const QUICK: { id: string; icon: string; label: string; cls: string }[] = [
  { id: 'acuerdo_comercial', icon: '🤝', label: 'Comerciar', cls: 'good' },
  { id: 'alianza', icon: '🛡️', label: 'Aliarse', cls: 'good' },
  { id: 'ayuda_exterior', icon: '🎁', label: 'Ayudar', cls: 'good' },
  { id: 'sancionar', icon: '🚫', label: 'Sancionar', cls: 'bad' },
  { id: 'op_espionaje', icon: '🕵️', label: 'Espiar', cls: 'spy' },
  { id: 'declarar_guerra', icon: '⚔️', label: 'Atacar', cls: 'bad' },
];

function quickActions(app: App, c: Country): HTMLElement {
  const me = app.player!;
  return h('div', { class: 'quick-actions', role: 'group', 'aria-label': `Acciones sobre ${c.name}` }, QUICK.map((q) => {
    const def = ACTION_BY_ID[q.id];
    if (!def) return null;
    const pv = previewAction(app.world, def, { actor: me, target: c });
    const b = h('button', { class: `qa ${q.cls} ${pv.ok ? '' : 'locked'}`, 'aria-disabled': String(!pv.ok), onclick: () => openAction(app, def, { target: c }) },
      h('span', { class: 'ic' }, q.icon), h('span', null, q.label), h('span', { class: 'ap' }, pv.ok ? `⚡${pv.ap}` : '🔒'));
    tip(b, () => h('div', null, h('div', { class: 't' }, def.name), h('div', { class: 'small' }, pv.ok ? def.desc : pv.unmet.join(' · '))));
    return b;
  }));
}
