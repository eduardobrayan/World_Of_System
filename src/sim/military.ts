/** Fuerzas armadas: poder, mantenimiento, preparación, producción y movilización. */
import type { Country, UnitType, WeaponDesign, World } from './types';
import { UNIT_TYPES } from './types';
import { UNIT_BY_ID } from './data';
import { addShock, modSum } from './vars';
import { approach, clamp } from './util';
import { regionalSum } from './economy';

export const MOBILIZATION = [
  { name: 'En paz', land: 1.0, cost: 0, growth: 0, unemp: 0, groups: 0 },
  { name: 'Alerta', land: 1.15, cost: 0.5, growth: -0.3, unemp: -0.4, groups: -1 },
  { name: 'Movilización parcial', land: 1.4, cost: 1.5, growth: -1.0, unemp: -1.2, groups: -4 },
  { name: 'Movilización total', land: 1.8, cost: 4.0, growth: -3.0, unemp: -3.0, groups: -10 },
];

const DOCTRINE: Record<string, { land: number; air: number; sea: number; defense: number; logistics: number; name: string }> = {
  defensa_territorial: { name: 'Defensa territorial', land: 1.0, air: 1.0, sea: 1.0, defense: 1.12, logistics: 0.9 },
  expedicionaria: { name: 'Expedicionaria', land: 1.0, air: 1.05, sea: 1.1, defense: 1.0, logistics: 1.3 },
  defensa_activa: { name: 'Defensa activa', land: 1.05, air: 1.05, sea: 1.05, defense: 1.05, logistics: 1.0 },
  asimetrica: { name: 'Guerra asimétrica', land: 0.95, air: 0.9, sea: 1.0, defense: 1.25, logistics: 0.85 },
  masa: { name: 'Guerra de masas', land: 1.1, air: 0.95, sea: 0.95, defense: 1.05, logistics: 0.95 },
  disuasion_nuclear: { name: 'Disuasión nuclear', land: 1.0, air: 1.0, sea: 1.0, defense: 1.1, logistics: 0.9 },
};

export function doctrineOf(c: Country) {
  return DOCTRINE[c.mil.doctrine] ?? DOCTRINE.defensa_territorial;
}

export function rawUpkeep(c: Country): number {
  let s = 0;
  for (const k of UNIT_TYPES) s += c.mil.units[k] * UNIT_BY_ID[k].upkeep;
  return s;
}

export function unitCost(c: Country, k: UnitType): number {
  return designCostMul(c, k) * UNIT_BY_ID[k].cost * (c.base.milCostScale ?? 1) * (1 - ((c.pol.ministers.find((m) => m.ministry === 'defense')?.competence ?? 50) - 50) * 0.003);
}

/** Bonificación activa para un tipo de unidad (la mejor de los programas terminados). */
export function designBonus(c: Country, k: UnitType): number {
  let best = 0;
  for (const d of c.mil.designs ?? []) if (d.done && d.unit === k) best = Math.max(best, d.quality * (d.embargo ? 0.5 : 1));
  return best;
}

export function designCostMul(c: Country, k: UnitType): number {
  let best: WeaponDesign | null = null;
  for (const d of c.mil.designs ?? []) if (d.done && d.unit === k && (!best || d.quality > best.quality)) best = d;
  return best ? best.costMul : 1;
}

export function computePower(c: Country) {
  const m = c.mil;
  const techF = 0.4 + (m.tech / 100) * 0.8;
  const readF = 0.5 + m.readiness / 200;
  const morF = 0.7 + m.morale / 333;
  const d = doctrineOf(c);
  let land = 0, air = 0, sea = 0, landUnits = 0;
  for (const k of UNIT_TYPES) {
    const u = UNIT_BY_ID[k];
    const v = m.units[k] * u.power * (1 + designBonus(c, k));
    if (u.domain === 'land') { land += v; landUnits += m.units[k]; }
    else if (u.domain === 'air') air += v;
    else sea += v;
  }
  land *= 1 + Math.min(0.12, (m.units.recon / Math.max(1, landUnits)) * 0.6);
  air *= 1 + Math.min(0.2, m.units.awacs / Math.max(1, m.units.fighters));
  const common = techF * readF * morF * (1 + modSum(c, 'militaryPower'));
  m.landPower = land * common * d.land * MOBILIZATION[m.mobilization].land;
  m.airPower = air * common * d.air;
  m.navalPower = sea * common * d.sea;
  m.power = m.landPower + m.airPower * 0.9 + m.navalPower * 0.6;
  m.personnel = 0;
  for (const k of UNIT_TYPES) m.personnel += m.units[k] * UNIT_BY_ID[k].personnel;
  m.personnel *= 1 + m.mobilization * 0.35;
}

/** Elige qué unidad reponer: la más mermada respecto a su dotación de referencia. */
function nextProcurement(c: Country): UnitType | null {
  let best: UnitType | null = null, bestScore = -Infinity;
  for (const k of UNIT_TYPES) {
    const base = c.mil.baseUnits[k];
    if (base <= 0) continue;
    const queued = c.mil.production.filter((p) => p.unit === k).reduce((a, p) => a + p.qty, 0);
    const score = (base * 1.05 - c.mil.units[k] - queued) / base;
    if (score > bestScore) { bestScore = score; best = k; }
  }
  return bestScore > 0 ? best : null;
}

export function updateMilitary(world: World, c: Country) {
  const m = c.mil;
  const e = c.eco;
  const defenseBn = (e.budget.defense * e.gdp) / 100;
  const upkeep = rawUpkeep(c) * (c.base.milCostScale ?? 1);
  m.upkeep = upkeep;
  const ratio = defenseBn / Math.max(0.1, upkeep);

  // Preparación según la cobertura presupuestaria
  const readyT = clamp(55 + (ratio - 1) * 40 + regionalSum(c, 'readiness') + modSum(c, 'readiness'), 10, 100);
  m.readiness = clamp(approach(m.readiness, readyT, 1 / 8), 0, 100);
  if (ratio < 0.85) {
    for (const k of UNIT_TYPES) m.units[k] *= 1 - (0.85 - ratio) * 0.01;
  }
  // Desgaste natural del material
  for (const k of UNIT_TYPES) m.units[k] *= 0.9993;

  // Producción: el excedente sobre el mantenimiento financia reposición automática
  const surplus = Math.max(0, defenseBn - upkeep);
  m.procurement = (m.procurement ?? 0) + (surplus * 0.45) / 12;
  let guard = 0;
  while (guard++ < 6) {
    const k = nextProcurement(c);
    if (!k) break;
    const cost = unitCost(c, k);
    if (m.procurement < cost) break;
    m.procurement -= cost;
    m.production.push({ unit: k, qty: 1, remaining: UNIT_BY_ID[k].build, cost: 0 });
  }
  m.procurement = Math.min(m.procurement, defenseBn * 0.5);
  for (const p of m.production) {
    p.remaining -= 1;
    if (p.cost > 0) e.extraSpending += (p.cost / UNIT_BY_ID[p.unit].build) * 12;
    if (p.remaining <= 0) m.units[p.unit] += p.qty;
  }
  m.production = m.production.filter((p) => p.remaining > 0);

  // Tecnología y moral
  const techT = c.base.milTech + (c.tech.level - c.base.techLevel) * 0.6 + modSum(c, 'milTech') + clamp((ratio - (c.base.milRatio ?? ratio)) * 8, -10, 10);
  m.tech = clamp(approach(m.tech, techT, 1 / 60), 5, 100);
  const moraleT = 60 + (c.groups.military.support - 50) * 0.25 + modSum(c, 'morale') - c.pol.warWeariness * 0.15;
  m.morale = clamp(approach(m.morale, moraleT, 0.08), 5, 100);
  m.logistics = clamp(approach(m.logistics, (c.base.logistics ?? 50) + regionalSum(c, 'logistics') + modSum(c, 'logistics'), 1 / 24), 5, 100);

  // Movilización: coste económico y social
  const mob = MOBILIZATION[m.mobilization];
  if (m.mobilization > 0) {
    e.extraSpending += (e.gdp * mob.cost) / 100;
    addShock(c, 'growth', mob.name, mob.growth);
    addShock(c, 'group.youth', mob.name, mob.groups * 1.5);
    addShock(c, 'group.workers', mob.name, mob.groups);
    addShock(c, 'group.military', mob.name, -mob.groups * 0.8);
  }
  computePower(c);
}
