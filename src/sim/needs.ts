/**
 * Necesidades civiles: alimentación, vivienda, energía, sanidad, educación, seguridad, empleo,
 * servicios básicos y pensiones. Cada una se cubre en un 0–100 %. La población se acostumbra al
 * nivel de 2026: la presión social nace de los retrocesos respecto a ese nivel y se alivia
 * (menos) con las mejoras. La presión alimenta protestas, emigración e insatisfacción.
 */
import type { Contribution, Country, Dict, World } from './types';
import { addShock, atWar, modSum, occupiedShare } from './vars';
import { clamp, approach, gdppc } from './util';
import { outbreakShare } from './bio';

export const NEEDS: { id: string; name: string; icon: string; weight: number; desc: string }[] = [
  { id: 'alimentacion', name: 'Alimentación', icon: '🍞', weight: 1.6, desc: 'Acceso a alimentos asequibles. Sube con la renta y baja con el precio mundial de los alimentos, la dependencia de importaciones, la inflación, la guerra y las plagas.' },
  { id: 'vivienda', name: 'Vivienda', icon: '🏠', weight: 1.0, desc: 'Vivienda digna y asequible. Mejora con gasto social y la ley de vivienda; empeora con tipos de interés altos, refugiados y destrucción.' },
  { id: 'energia', name: 'Energía', icon: '⚡', weight: 1.0, desc: 'Suministro eléctrico y combustible asequible. Depende de la dependencia energética, los precios del petróleo y el gas, las renovables y los daños.' },
  { id: 'sanidad', name: 'Sanidad', icon: '🏥', weight: 1.1, desc: 'Cobertura sanitaria; cae durante epidemias.' },
  { id: 'educacion', name: 'Educación', icon: '🎓', weight: 0.6, desc: 'Escolarización y calidad educativa.' },
  { id: 'seguridad', name: 'Seguridad', icon: '🛡', weight: 1.1, desc: 'Seguridad ciudadana: 100 − criminalidad, peor en guerra.' },
  { id: 'empleo', name: 'Empleo', icon: '🔧', weight: 1.3, desc: 'Trabajo disponible: cae con el desempleo.' },
  { id: 'servicios', name: 'Agua y servicios', icon: '🚰', weight: 0.7, desc: 'Agua, transporte y trámites: infraestructuras y corrupción administrativa.' },
  { id: 'pensiones', name: 'Pensiones', icon: '👵', weight: 0.8, desc: 'Suficiencia de las pensiones según el gasto y el envejecimiento.' },
];

/** Cobertura actual de cada necesidad (0..100), con sus causas. */
export function needLevels(world: World, c: Country): { values: Dict<number>; parts: Dict<Contribution[]> } {
  const e = c.eco, s = c.soc, pc = Math.max(300, gdppc(c));
  const lg = Math.log10(pc / 400);
  const fp = world.market.price.food / world.market.base.food;
  const op = world.market.price.oil / world.market.base.oil;
  const gp = world.market.price.gas / world.market.base.gas;
  const dep = (k: 'food' | 'oil' | 'gas') => { const r = c.res[k]; return r.cons > 0 ? Math.max(0, (r.cons - r.prod) / r.cons) : 0; };
  const dmg = c.regions.length ? c.regions.reduce((a, r) => a + r.damage * r.popShare, 0) : 0;
  const war = atWar(world, c.id);
  const occ = occupiedShare(c);
  const poorF = 1 - Math.min(1, pc / 40000);
  const values: Dict<number> = {}, parts: Dict<Contribution[]> = {};
  const add = (id: string, items: [string, number][]) => {
    const arr: Contribution[] = [];
    let v = 0;
    for (const [label, x] of items) { v += x; if (Math.abs(x) > 0.05) arr.push({ label, value: x }); }
    for (const m of [modSum(c, `need.${id}`)]) if (m) { v += m; arr.push({ label: 'Medidas y efectos', value: m }); }
    values[id] = clamp(v, 0, 100);
    parts[id] = arr;
  };
  add('alimentacion', [['Renta', 38 + lg * 22], ['Precio de los alimentos', -(fp - 1) * 30 * (0.3 + poorF)], ['Dependencia de importaciones', -dep('food') * 12 * Math.max(0, fp - 0.8)],
    ['Inflación', -clamp(e.inflation - 6, 0, 80) * 0.25], ['Guerra y ocupación', (war ? -4 : 0) - occ * 40], ['Plagas', -outbreakShare(world, c, 'cultivos') * 60 - outbreakShare(world, c, 'ganado') * 30],
    ['Subsidios', e.budget.subsidies * 1.5]]);
  add('vivienda', [['Renta', 28 + lg * 20], ['Gasto social', e.budget.social * 1.2], ['Tipos de interés', -clamp(e.policyRate - 3, -3, 40) * 0.6],
    ['Ley de vivienda', (c.pol.flags.ley_vivienda ? 8 : 0)], ['Refugiados', -clamp((s.refugees / s.pop) * 400, 0, 25)], ['Destrucción', -dmg * 0.6]]);
  add('energia', [['Renta', 32 + lg * 20], ['Precio del petróleo', -dep('oil') * (op - 1) * 22], ['Precio del gas', -dep('gas') * (gp - 1) * 18],
    ['Renovables', c.tech.renewables * 0.1], ['Daños en la red', -dmg * 0.7], ['Subsidios', e.budget.subsidies * 1.5]]);
  add('sanidad', [['Sistema sanitario', s.health], ['Epidemias', -outbreakShare(world, c, 'humano') * 80 - (world.global.pandemic?.infected[c.id] ?? 0) * 60]]);
  add('educacion', [['Sistema educativo', s.education]]);
  add('seguridad', [['Criminalidad', 100 - c.police.crime], ['Guerra', war ? -10 - occ * 30 : 0]]);
  add('empleo', [['Desempleo', 100 - e.unemployment * 3]]);
  add('servicios', [['Infraestructuras', e.infra * 0.75], ['Corrupción administrativa', -(c.corr.administrativa - 30) * 0.3], ['Daños', -dmg * 0.6], ['Base', 22]]);
  const need = Math.max(1, (s.medianAge - 18) * 0.42);
  add('pensiones', [['Gasto en pensiones', clamp((e.budget.pensions / need) * 75, 0, 100)], ['Inflación', -clamp(e.inflation - 5, 0, 60) * 0.3]]);
  return { values, parts };
}

/** Presión social objetivo y su desglose. */
export function pressureTarget(c: Country, values: Dict<number>): { value: number; parts: Contribution[] } {
  const parts: Contribution[] = [];
  let v = 0;
  for (const n of NEEDS) {
    const d = (c.base[`need_${n.id}`] ?? values[n.id]) - values[n.id];
    const x = d > 0 ? d * n.weight * 0.9 : d * n.weight * 0.3;
    if (Math.abs(x) > 0.1) parts.push({ label: n.name, value: x });
    v += x;
  }
  return { value: clamp(v, 0, 100), parts };
}

export function initNeeds(world: World, c: Country) {
  const { values } = needLevels(world, c);
  c.soc.needs = values;
  for (const n of NEEDS) c.base[`need_${n.id}`] = values[n.id];
  c.soc.pressure = 0;
}

export function updateNeeds(world: World, c: Country) {
  const { values, parts } = needLevels(world, c);
  for (const n of NEEDS) c.soc.needs[n.id] = approach(c.soc.needs[n.id] ?? values[n.id], values[n.id], 0.35);
  const pt = pressureTarget(c, c.soc.needs);
  c.soc.pressure = clamp(approach(c.soc.pressure, pt.value, 0.25), 0, 100);
  c.explain.pressure = pt.parts;
  for (const n of NEEDS) c.explain[`need.${n.id}`] = parts[n.id];
  const pr = c.soc.pressure;
  if (pr > 0.2) {
    addShock(c, 'protest', 'Necesidades no cubiertas', pr * 0.55);
    addShock(c, 'satisfaction', 'Necesidades no cubiertas', -pr * 0.35);
    addShock(c, 'migration', 'Necesidades no cubiertas', -pr * 0.05);
    addShock(c, 'group.workers', 'Necesidades no cubiertas', -pr * 0.12);
    addShock(c, 'group.youth', 'Necesidades no cubiertas', -pr * 0.1);
    addShock(c, 'stability', 'Presión social', -pr * 0.06);
  }
  // Mejoras por encima de lo habitual: algo más de satisfacción
  let gain = 0;
  for (const n of NEEDS) gain += Math.max(0, c.soc.needs[n.id] - (c.base[`need_${n.id}`] ?? 0)) * n.weight;
  if (gain > 0.5) addShock(c, 'satisfaction', 'Necesidades mejor cubiertas', Math.min(8, gain * 0.08));
}

/** Necesidad peor cubierta respecto a lo habitual (para avisos). */
export function worstNeed(c: Country): { id: string; name: string; drop: number } | null {
  let best: { id: string; name: string; drop: number } | null = null;
  for (const n of NEEDS) {
    const drop = (c.base[`need_${n.id}`] ?? 0) - (c.soc.needs[n.id] ?? 0);
    if (drop > 3 && (!best || drop * n.weight > best.drop)) best = { id: n.id, name: n.name, drop };
  }
  return best;
}
