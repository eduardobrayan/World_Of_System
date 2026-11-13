/**
 * Seguridad interior: cuerpos policiales, criminalidad, corrupción por tipos y narcotráfico.
 * Todo se calibra en el arranque (valores base) y los efectos se aplican como desviaciones
 * respecto a ese punto de partida, de modo que el mundo inicial es estable.
 */
import type { Country, CorruptionType, Dict, World } from './types';
import { CORRUPTION_TYPES } from './types';
import { DATA, ideologyOf, regimeOf } from './data';
import { addShock, atWar, modSum } from './vars';
import { regionalSum } from './economy';
import { addModifier } from './effects';
import { approach, clamp, gdppc, news, rngOf } from './util';
import narcoJson from '../data/narco.json';

export const CORRUPTION_INFO: Record<CorruptionType, { name: string; weight: number; desc: string; icon: string }> = {
  politica: { name: 'Política', weight: 0.25, icon: '🏛', desc: 'Sobornos a cargos electos, financiación ilegal de partidos y tráfico de influencias.' },
  administrativa: { name: 'Administrativa', weight: 0.2, icon: '📑', desc: 'Mordidas en trámites, licencias y contratos públicos: reduce la recaudación y encarece los servicios.' },
  judicial: { name: 'Judicial', weight: 0.15, icon: '⚖', desc: 'Jueces y fiscales comprados: impunidad, inseguridad jurídica y cárteles intocables.' },
  policial: { name: 'Policial', weight: 0.15, icon: '🚓', desc: 'Agentes a sueldo del crimen organizado: hunde la eficacia policial.' },
  empresarial: { name: 'Empresarial', weight: 0.15, icon: '💼', desc: 'Cárteles empresariales, blanqueo y captura de reguladores: frena la inversión.' },
  electoral: { name: 'Electoral', weight: 0.1, icon: '🗳', desc: 'Compra de votos, censos inflados y manipulación del recuento: resta legitimidad.' },
};

type NarcoRaw = { production: number; transit: number; cartels: number; consumption: number };
const NARCO = narcoJson as unknown as Dict<NarcoRaw | string>;

/** Eficacia policial absoluta (sin normalizar). */
function rawEffectiveness(c: Country): number {
  const p = c.police;
  return Math.sqrt(Math.max(10, p.size) / 300) * (0.6 + p.training / 250) * (0.55 + p.integrity / 220);
}

/** Estado inicial de policía, corrupción y narcotráfico (se llama al calibrar). */
export function initSecurity(world: World, c: Country) {
  const b = c.base, pc = gdppc(c);
  const ideo = ideologyOf(c.pol.ideology), reg = regimeOf(c.pol.regime);
  // Narcotráfico
  const raw = NARCO[c.id];
  const n = typeof raw === 'object' ? raw : {
    production: clamp(4 + c.pol.corruption * 0.08, 2, 25),
    transit: clamp(8 + c.pol.corruption * 0.25, 5, 40),
    cartels: clamp(c.pol.corruption * 0.35 - Math.log10(pc / 1000) * 6, 3, 50),
    consumption: clamp(10 + Math.log10(Math.max(500, pc) / 500) * 18, 5, 70),
  };
  c.narco = { production: n.production, transit: n.transit, cartels: n.cartels, consumption: n.consumption, violence: clamp(n.cartels * 0.55, 1, 90) };
  // Policía
  const sec = c.eco.budget.security;
  c.police = {
    size: clamp(110 + sec * 160, 80, 900),
    training: clamp(25 + Math.log10(Math.max(400, pc) / 500) * 22 + (c.soc.education - 50) * 0.3, 10, 95),
    militarization: clamp(25 + ideo.auth * 30 + (reg.competitive ? 0 : 20) + n.cartels * 0.15, 5, 95),
    integrity: 50, crime: 30, effectiveness: 1,
  };
  // Corrupción por tipos (media ponderada = corrupción general)
  const off: Record<CorruptionType, number> = {
    politica: 2,
    administrativa: -Math.log10(Math.max(500, pc) / 5000) * 6,
    judicial: (50 - c.pol.pressFreedom) * 0.15,
    // Los cárteles corrompen a la policía, pero sin dejarla en cero (México arranca ≈ 20 de integridad)
    policial: n.cartels * 0.1 - 2,
    empresarial: 0,
    electoral: reg.competitive ? -10 : 12,
  };
  let avg = 0;
  for (const k of CORRUPTION_TYPES) avg += CORRUPTION_INFO[k].weight * off[k];
  c.corr = {} as Record<CorruptionType, number>;
  for (const k of CORRUPTION_TYPES) {
    c.corr[k] = clamp(c.pol.corruption + off[k] - avg, 0, 100);
    b[`corr_${k}`] = c.corr[k];
  }
  c.pol.corruption = overallCorruption(c);
  b.corruption = c.pol.corruption;
  c.police.integrity = clamp(100 - c.corr.policial, 0, 100);
  c.police.crime = clamp(12 + n.cartels * 0.35 + (c.soc.gini - 33) * 0.7 + (c.eco.unemployment - 5) * 0.8 - Math.log10(Math.max(400, pc) / 1000) * 7, 3, 90);
  b.police_size = c.police.size;
  b.police_training = c.police.training;
  b.police_mil = c.police.militarization;
  b.police_eff = rawEffectiveness(c);
  b.crime = c.police.crime;
  b.budget_security = sec;
  for (const k of ['production', 'transit', 'cartels', 'consumption', 'violence'] as const) b[`narco_${k}`] = c.narco[k];
}

export function overallCorruption(c: Country): number {
  let v = 0;
  for (const k of CORRUPTION_TYPES) v += CORRUPTION_INFO[k].weight * c.corr[k];
  return v;
}

function narcoWeight(c: Country): number {
  return c.narco.consumption * c.soc.pop * Math.min(gdppc(c), 60000);
}

/** Demanda mundial de drogas (índice 1 = 2026) y tamaño del negocio. */
export function updateNarcoWorld(world: World) {
  let w = 0;
  for (const id of world.order) {
    const c = world.countries[id];
    if (c.alive) w += narcoWeight(c);
  }
  if (!world.global.narcoBase) world.global.narcoBase = w;
  world.global.narcoDemand = w / world.global.narcoBase;
}

/** Ingresos anuales (miles de millones $) del narcotráfico en un país. */
export function narcoRevenue(world: World, c: Country): number {
  let tot = 0;
  for (const id of world.order) {
    const x = world.countries[id];
    if (x.alive) tot += x.narco.production + x.narco.transit * 0.6;
  }
  return tot > 0 ? (420 * (world.global.narcoDemand ?? 1) * (c.narco.production + c.narco.transit * 0.6)) / tot : 0;
}

/** Actualización mensual de policía, criminalidad, corrupción y narcotráfico. */
export function updateSecurity(world: World, c: Country) {
  const b = c.base, e = c.eco, p = c.police, n = c.narco;
  const D = world.global.narcoDemand ?? 1;

  // --- Policía ---
  const secRatio = Math.max(0.1, e.budget.security / Math.max(0.05, b.budget_security));
  p.size = clamp(approach(p.size, b.police_size * Math.pow(secRatio, 0.8) + modSum(c, 'police.size'), 1 / 18), 20, 1500);
  p.training = clamp(approach(p.training, b.police_training + modSum(c, 'police.training') + (secRatio - 1) * 6, 1 / 30), 0, 100);
  p.militarization = clamp(approach(p.militarization, b.police_mil + modSum(c, 'police.militarization'), 1 / 12), 0, 100);
  p.integrity = clamp(100 - c.corr.policial, 0, 100);
  p.effectiveness = rawEffectiveness(c) / Math.max(0.01, b.police_eff);

  // --- Corrupción por tipos ---
  const interior = (c.pol.ministers.find((m) => m.ministry === 'interior')?.competence ?? 50) - 50;
  const shared = modSum(c, 'corruption') + regionalSum(c, 'corruption') - interior * 0.04;
  const cart = n.cartels - b.narco_cartels;
  const drivers: Record<CorruptionType, number> = {
    politica: cart * 0.15,
    administrativa: -(e.budget.administration - (b.budget_administration ?? e.budget.administration)) * 2,
    judicial: cart * 0.2 - (c.pol.pressFreedom - b.pressFreedom) * 0.1,
    policial: cart * 0.35 - (p.training - b.police_training) * 0.1 - (secRatio - 1) * 4,
    empresarial: cart * 0.1,
    electoral: c.pol.electionManip * 0.3 + cart * 0.1,
  };
  for (const k of CORRUPTION_TYPES) {
    const t = b[`corr_${k}`] + shared + drivers[k] + modSum(c, `corr.${k}`);
    c.corr[k] = clamp(approach(c.corr[k], t, 1 / 30), 0, 100);
  }
  c.pol.corruption = overallCorruption(c);
  const dAdm = c.corr.administrativa - b.corr_administrativa;
  const dEmp = c.corr.empresarial - b.corr_empresarial;
  const dEle = c.corr.electoral - b.corr_electoral;
  const dJud = c.corr.judicial - b.corr_judicial;
  addShock(c, 'taxEfficiency', 'Corrupción administrativa', -dAdm * 0.0015);
  addShock(c, 'investment', 'Corrupción empresarial', -dEmp * 0.03);
  addShock(c, 'legitimacy', 'Corrupción electoral', -dEle * 0.15);
  addShock(c, 'investment', 'Inseguridad jurídica', -dJud * 0.015);

  // --- Narcotráfico ---
  const effGain = clamp((p.effectiveness - 1) * 22, -20, 15);
  const cartT = b.narco_cartels + (c.pol.corruption - b.corruption) * 0.4 + (e.unemployment - b.unemployment) * 0.6
    + (D - 1) * 18 - effGain + dJud * 0.2 + modSum(c, 'narco.cartels') - (atWar(world, c.id) ? 0 : 0);
  n.cartels = clamp(approach(n.cartels, cartT, 1 / 24), 0, 100);
  const dc = n.cartels - b.narco_cartels;
  n.production = clamp(approach(n.production, b.narco_production + dc * 0.25 + (D - 1) * 10 + modSum(c, 'narco.production'), 1 / 24), 0, 100);
  n.transit = clamp(approach(n.transit, b.narco_transit + dc * 0.3 + (D - 1) * 10 + modSum(c, 'narco.transit'), 1 / 18), 0, 100);
  n.consumption = clamp(approach(n.consumption, b.narco_consumption + (e.unemployment - b.unemployment) * 0.4 + modSum(c, 'narco.consumption'), 1 / 36), 0, 100);
  n.violence = clamp(approach(n.violence, b.narco_violence + dc * 0.8 + modSum(c, 'narco.violence'), 1 / 6), 0, 100);
  const dv = n.violence - b.narco_violence;
  if (Math.abs(dv) > 0.05) {
    addShock(c, 'stability', 'Violencia del narcotráfico', -dv * 0.08);
    addShock(c, 'growth', 'Violencia del narcotráfico', -dv * 0.015);
    addShock(c, 'death', 'Violencia del narcotráfico', dv * 0.01);
    addShock(c, 'group.business', 'Violencia del narcotráfico', -dv * 0.08);
  }
  const dcons = n.consumption - b.narco_consumption;
  if (Math.abs(dcons) > 0.05) addShock(c, 'health', 'Consumo de drogas', -dcons * 0.05);

  // --- Criminalidad ---
  const crimeT = b.crime * clamp(1 - (p.effectiveness - 1) * 0.7, 0.45, 1.6) + dv * 0.4 + (e.unemployment - b.unemployment) * 1.0
    + (c.soc.gini - b.gini) * 0.5 + (atWar(world, c.id) ? 4 : 0) + modSum(c, 'crime');
  p.crime = clamp(approach(p.crime, crimeT, 1 / 6), 0, 100);
  const dcr = p.crime - b.crime;
  if (Math.abs(dcr) > 0.05) {
    addShock(c, 'satisfaction', 'Criminalidad', -dcr * 0.3);
    addShock(c, 'growth', 'Criminalidad', -dcr * 0.012);
    addShock(c, 'migration', 'Criminalidad', -dcr * 0.04);
  }
  // Policía militarizada: reprime mejor, pero erosiona la confianza
  const dm = p.militarization - b.police_mil;
  if (Math.abs(dm) > 0.05) addShock(c, 'trust', 'Militarización policial', -dm * 0.05);
  if (c.pol.repression > 0) addShock(c, 'protest', 'Eficacia policial antidisturbios', -c.pol.repression * (p.militarization / 100 * 0.3 + (p.size / b.police_size - 1) * 0.2));

  scandals(world, c);
}

const SCANDALS: Record<CorruptionType, string[]> = {
  politica: ['Destapada una trama de comisiones ilegales que salpica a varios ministros', 'La fiscalía investiga la financiación ilegal del partido en el Gobierno'],
  administrativa: ['Una red de funcionarios cobraba sobornos por licencias de obra', 'Los contratos públicos de emergencia se adjudicaron a empresas fantasma'],
  judicial: ['Grabaciones revelan a jueces negociando sentencias', 'Un fiscal archivó causas a cambio de pagos de un cártel'],
  policial: ['Comisarios a sueldo del narcotráfico desmantelados por asuntos internos', 'Agentes vendían información de operativos a bandas criminales'],
  empresarial: ['Un cártel de constructoras pactaba precios en la obra pública', 'Destapada una red de blanqueo en un gran banco'],
  electoral: ['Denuncias de compra masiva de votos en las últimas elecciones', 'Miles de fallecidos seguían inscritos en el censo electoral'],
};

/** Escándalos: más probables con más corrupción y más libertad de prensa (que los destapa). */
function scandals(world: World, c: Country) {
  if (world.forecast) return;
  const isPlayer = world.player?.country === c.id;
  if (!isPlayer && c.isBlock) return;
  const rng = rngOf(world);
  for (const k of CORRUPTION_TYPES) {
    const prob = 0.0025 * (c.corr[k] / 50) * (0.3 + c.pol.pressFreedom / 70) * CORRUPTION_INFO[k].weight * 6;
    if (rng.next() >= prob) continue;
    const text = rng.pick(SCANDALS[k]);
    addModifier(world, c, { id: `escandalo_${k}`, name: `Escándalo de corrupción ${CORRUPTION_INFO[k].name.toLowerCase()}`, duration: 6, mods: { trust: -4, stability: -2, 'group.all': -2, legitimacy: -2 } }, 'escandalo');
    c.corr[k] = clamp(c.corr[k] - 3, 0, 100); // al destaparse, la trama se desarticula en parte
    news(world, `${CORRUPTION_INFO[k].icon} ${c.name}: ${text.toLowerCase()}.`, 'politica', [c.id], isPlayer ? 3 : 0);
    break;
  }
  world.rng = rng.state;
}

/** Lista legible de los factores de corrupción (para la interfaz). */
export function corruptionBreakdown(c: Country): { type: CorruptionType; name: string; value: number; base: number; desc: string; icon: string }[] {
  return CORRUPTION_TYPES.map((k) => ({ type: k, name: CORRUPTION_INFO[k].name, value: c.corr[k], base: c.base[`corr_${k}`], desc: CORRUPTION_INFO[k].desc, icon: CORRUPTION_INFO[k].icon }));
}

export const NARCO_NAMES: Dict<string> = { production: 'Producción', transit: 'Tránsito', cartels: 'Poder de los cárteles', violence: 'Violencia', consumption: 'Consumo' };
void DATA;
