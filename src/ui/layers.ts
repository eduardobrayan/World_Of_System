/** Capas del mapa global y del mapa local (colores y leyendas). */
import type { Country, Region, World } from '../sim/types';
import { DATA, ideologyOf } from '../sim/data';
import { gdppc } from '../sim/util';
import { allied, relOp, atWar } from '../sim/vars';
import { h } from './dom';
import { SERIES } from './charts';
import { perceived } from './perceive';

export interface LayerCtx { world: World; player: Country | null }

export interface MapLayer {
  id: string;
  name: string;
  color: (c: Country, ctx: LayerCtx) => string;
  legend: (ctx: LayerCtx) => HTMLElement;
  needsPlayer?: boolean;
}

// ---- Rampas (modo oscuro: los valores bajos se funden con el fondo, los altos se iluminan) ----
const BLUE = ['#104281', '#184f95', '#1c5cab', '#256abf', '#2a78d6', '#3987e5', '#5598e7', '#6da7ec', '#86b6ef', '#9ec5f4', '#b7d3f6', '#cde2fb'];
const ORANGE = ['#4a2414', '#63301a', '#7d3c1f', '#984822', '#b35224', '#d95926', '#e2733f', '#ea8c5c', '#f0a57c', '#f5bf9f'];
const NEG = ['#383835', '#5a3735', '#7d3a38', '#a1403d', '#c44d4a', '#e66767'];
const POS = ['#383835', '#2f4560', '#285a8c', '#2a6fb8', '#3987e5', '#6da7ec'];

function hexToRgb(hx: string): [number, number, number] {
  const n = parseInt(hx.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rampColor(ramp: string[], t: number): string {
  t = Math.max(0, Math.min(1, t));
  const x = t * (ramp.length - 1);
  const i = Math.min(ramp.length - 2, Math.floor(x));
  const f = x - i;
  const a = hexToRgb(ramp[i]), b = hexToRgb(ramp[i + 1]);
  const c = a.map((v, k) => Math.round(v + (b[k] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function divColor(t: number): string {
  t = Math.max(-1, Math.min(1, t));
  return t < 0 ? rampColor(NEG, -t) : rampColor(POS, t);
}

function rampLegend(title: string, ramp: string[], lo: string, hi: string, note?: string): HTMLElement {
  return h('div', null, h('div', { class: 'ink2' }, title),
    h('div', { class: 'ramp' }, ramp.map((c) => h('i', { style: `background:${c}` }))),
    h('div', { class: 'row between small muted' }, h('span', null, lo), h('span', null, hi)),
    note ? h('div', { class: 'small muted', style: 'margin-top:4px' }, note) : null);
}

function divLegend(title: string, lo: string, mid: string, hi: string): HTMLElement {
  const ramp = [...NEG.slice().reverse(), ...POS.slice(1)];
  return h('div', null, h('div', { class: 'ink2' }, title),
    h('div', { class: 'ramp' }, ramp.map((c) => h('i', { style: `background:${c}` }))),
    h('div', { class: 'row between small muted' }, h('span', null, lo), h('span', null, mid), h('span', null, hi)));
}

function swatches(title: string, items: [string, string][]): HTMLElement {
  return h('div', null, h('div', { class: 'ink2', style: 'margin-bottom:3px' }, title),
    items.map(([col, label]) => h('div', null, h('span', { class: 'sw', style: `background:${col}` }), label)));
}

const REGIME_GROUP: Record<string, number> = {
  democracia_parlamentaria: 0, democracia_presidencial: 0, democracia_imperfecta: 2, hibrido: 3,
  autoritario: 1, partido_unico: 1, teocracia: 1, monarquia_absoluta: 1, junta_militar: 1,
};
const REGIME_LABELS = ['Democracia plena', 'Autoritarismo', 'Democracia imperfecta', 'Régimen híbrido'];

/** Bloque geopolítico aproximado (para la capa de alianzas). */
export function blocOf(world: World, c: Country): number {
  const o = world.orgs;
  if (o.OTAN?.members.includes(c.id) || allied(world, c.id, 'USA')) return 0;
  if (o.OTSC?.members.includes(c.id) || (c.id !== 'RUS' && allied(world, c.id, 'RUS')) || c.id === 'RUS') return 1;
  if (c.id === 'CHN' || allied(world, c.id, 'CHN')) return 2;
  return 3;
}
const BLOC_LABELS = ['Bloque occidental (OTAN y aliados de EE. UU.)', 'Órbita rusa (OTSC y aliados)', 'Órbita china (aliados de China)', 'No alineados'];
const BLOC_COLORS = [SERIES[0], SERIES[1], SERIES[2], '#55534e'];

export const LAYERS: MapLayer[] = [
  {
    id: 'politico', name: 'Político',
    color: (c) => c.color,
    legend: () => h('div', { class: 'ink2' }, 'Colores nacionales. Los bloques regionales agrupan varios países.'),
  },
  {
    id: 'alianzas', name: 'Alianzas',
    color: (c, x) => BLOC_COLORS[blocOf(x.world, c)],
    legend: () => swatches('Alineamiento', BLOC_COLORS.map((col, i) => [col, BLOC_LABELS[i]] as [string, string])),
  },
  {
    id: 'relaciones', name: 'Relaciones', needsPlayer: true,
    color: (c, x) => (!x.player ? '#383835' : c.id === x.player.id ? '#f0efec' : divColor(relOp(x.world, c.id, x.player.id) / 100)),
    legend: () => divLegend('Opinión que tienen de tu país', 'Hostil (−100)', 'Neutral', 'Amistosa (+100)'),
  },
  {
    id: 'pib', name: 'Renta',
    color: (c, x) => rampColor(BLUE, Math.log10(Math.max(500, perceived(x, c, 'gdppc', gdppc(c))) / 500) / Math.log10(140)),
    legend: () => rampLegend('PIB per cápita', BLUE, '500 $', '70 000 $', 'Escala logarítmica.'),
  },
  {
    id: 'crecimiento', name: 'Crecimiento',
    color: (c, x) => divColor(perceived(x, c, 'growth', c.eco.growth) / 6),
    legend: () => divLegend('Crecimiento del PIB', '−6 %', '0 %', '+6 %'),
  },
  {
    id: 'inflacion', name: 'Inflación',
    color: (c, x) => rampColor(ORANGE, Math.log10(1 + Math.max(0, perceived(x, c, 'inflation', c.eco.inflation))) / Math.log10(101)),
    legend: () => rampLegend('Inflación anual', ORANGE, '0 %', '100 % o más', 'Escala logarítmica.'),
  },
  {
    id: 'estabilidad', name: 'Estabilidad',
    color: (c, x) => divColor((perceived(x, c, 'stability', c.pol.stability) - 50) / 40),
    legend: () => divLegend('Estabilidad política', 'Crítica (10)', '50', 'Sólida (90)'),
  },
  {
    id: 'corrupcion', name: 'Corrupción',
    color: (c, x) => rampColor(ORANGE, (perceived(x, c, 'corruption', c.pol.corruption) - 10) / 80),
    legend: () => rampLegend('Corrupción (media de seis tipos)', ORANGE, 'Baja (10)', 'Extrema (90)'),
  },
  {
    id: 'narco', name: 'Narcotráfico',
    color: (c, x) => {
      const idx = perceived(x, c, 'cartels', c.narco.cartels) + c.narco.transit * 0.5 + c.narco.production * 0.5;
      return rampColor(ORANGE, Math.sqrt(Math.max(0, idx - 15) / 140));
    },
    legend: () => rampLegend('Narcotráfico (cárteles, rutas y cultivos)', ORANGE, 'Marginal', 'Narcoestado', 'Escala de raíz cuadrada. Los países consumidores financian el negocio aunque aparezcan oscuros.'),
  },
  {
    id: 'brotes', name: 'Brotes',
    color: (c, x) => {
      let inf = x.world.global.pandemic?.infected[c.id] ?? 0;
      for (const o of x.world.global.outbreaks ?? []) if (o.detected || o.creator === x.player?.id) inf += o.infected[c.id] ?? 0;
      return inf > 0.0005 ? rampColor(ORANGE, 0.15 + Math.sqrt(inf / 0.4) * 0.85) : '#2a2f36';
    },
    legend: () => rampLegend('Población, cosechas o ganado afectados por epidemias y plagas', ORANGE, 'Leve', '40 % o más', 'Gris: sin brotes conocidos. Solo se ven los brotes detectados y los que hayas liberado tú.'),
  },
  {
    id: 'regimen', name: 'Régimen',
    color: (c) => [SERIES[0], SERIES[1], SERIES[2], SERIES[3]][REGIME_GROUP[c.pol.regime] ?? 3],
    legend: () => swatches('Tipo de régimen', REGIME_LABELS.map((l, i) => [SERIES[i], l] as [string, string])),
  },
  {
    id: 'ideologia', name: 'Ideología',
    color: (c) => ideologyOf(c.pol.ideology).color,
    legend: (x) => {
      const used = new Set(x.world.order.map((id) => x.world.countries[id].pol.ideology));
      return swatches('Ideología del gobierno', Object.entries(DATA.ideologies).filter(([k]) => used.has(k)).map(([, v]) => [v.color, v.name] as [string, string]));
    },
  },
  {
    id: 'conflictos', name: 'Conflictos',
    color: (c, x) => {
      const w = x.world.wars.find((w) => w.attackers.includes(c.id) || w.defenders.includes(c.id));
      if (!w) return '#2c2c2a';
      if (w.ceasefire > 0) return '#6a6a64';
      return w.attackers.includes(c.id) ? SERIES[1] : SERIES[0];
    },
    legend: (x) => h('div', null, swatches('Guerras activas', [[SERIES[1], 'Atacante'], [SERIES[0], 'Defensor'], ['#6a6a64', 'Alto el fuego'], ['#2c2c2a', 'En paz']]),
      h('div', { class: 'small muted', style: 'margin-top:4px' }, `${x.world.wars.length} conflicto(s). Las zonas rayadas están ocupadas.`)),
  },
];

export const LAYER_BY_ID: Record<string, MapLayer> = Object.fromEntries(LAYERS.map((l) => [l.id, l]));

// ---- Capas del mapa local ----
export interface LocalLayer { id: string; name: string; value: (r: Region, c: Country) => number; lo: number; hi: number; fmt: (v: number) => string; invert?: boolean }

export const LOCAL_LAYERS: LocalLayer[] = [
  { id: 'development', name: 'Desarrollo', value: (r) => r.development, lo: 20, hi: 90, fmt: (v) => v.toFixed(0) },
  { id: 'unemployment', name: 'Desempleo', value: (r) => r.unemployment, lo: 2, hi: 25, fmt: (v) => `${v.toFixed(1)} %`, invert: true },
  { id: 'production', name: 'Producción', value: (r) => r.production, lo: 0, hi: 1, fmt: (v) => `${v.toFixed(0)} mm $` },
  { id: 'infra', name: 'Infraestructuras', value: (r) => r.infra, lo: 15, hi: 95, fmt: (v) => v.toFixed(0) },
  { id: 'quality', name: 'Calidad de vida', value: (r) => r.quality, lo: 20, hi: 90, fmt: (v) => v.toFixed(0) },
  { id: 'security', name: 'Seguridad', value: (r) => r.security, lo: 10, hi: 95, fmt: (v) => v.toFixed(0) },
  { id: 'education', name: 'Educación', value: (r) => r.education, lo: 30, hi: 100, fmt: (v) => v.toFixed(0) },
  { id: 'health', name: 'Sanidad', value: (r) => r.health, lo: 30, hi: 100, fmt: (v) => v.toFixed(0) },
  { id: 'pop', name: 'Población', value: (r) => r.pop, lo: 0, hi: 1, fmt: (v) => `${v.toFixed(1)} M` },
];

export function localColor(layer: LocalLayer, r: Region, c: Country): string {
  let lo = layer.lo, hi = layer.hi;
  if (layer.id === 'production' || layer.id === 'pop') {
    const vals = c.regions.map((x) => layer.value(x, c));
    lo = 0;
    hi = Math.max(...vals, 1e-6);
  }
  let t = (layer.value(r, c) - lo) / (hi - lo);
  if (layer.invert) t = 1 - t;
  return rampColor(BLUE, t);
}

export function atWarColorHint(world: World, c: Country): boolean {
  return atWar(world, c.id);
}
