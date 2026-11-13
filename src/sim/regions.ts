/** Sistema local: indicadores regionales, edificios y construcción. */
import type { Country, Region, World } from './types';
import { BUILDING_BY_ID, DATA } from './data';
import type { BuildingDef } from './data';
import { clamp, gdppc, news } from './util';

/** Efectos que escalan con el tamaño de la región (producción absoluta). */
const SCALED = new Set(['output', 'food', 'minerals', 'oil', 'gas', 'chips', 'research', 'exports']);

export function regionScale(c: Country, r: Region): number {
  return Math.sqrt(Math.max(0.05, c.soc.pop * r.popShare) / 10);
}

export function priceLevel(c: Country): number {
  return clamp(Math.pow(gdppc(c) / 30000, 0.5), 0.3, 1.6);
}

export function buildingCost(c: Country, r: Region, b: BuildingDef): number {
  const transport = (c.pol.ministers.find((m) => m.ministry === b.ministry)?.competence ?? 50) - 50;
  return b.cost * regionScale(c, r) * priceLevel(c) * (1 - transport * 0.004);
}

export function buildingMonths(c: Country, b: BuildingDef): number {
  const m = (c.pol.ministers.find((x) => x.ministry === b.ministry)?.competence ?? 50) - 50;
  return Math.max(3, Math.round(b.months * (1 - m * 0.005)));
}

/** ¿Se puede construir este edificio en esta región? Devuelve el motivo si no. */
export function canBuild(world: World, c: Country, r: Region, b: BuildingDef): string | null {
  if (r.owner !== c.id) return 'La región no es tuya';
  if (r.controller !== c.id) return 'La región está ocupada';
  if (b.coastal && !r.coastal) return 'Requiere costa';
  if (b.notTerrain?.includes(r.terrain)) return `No es posible en terreno ${r.terrain}`;
  if (b.spec && !b.spec.includes(r.spec)) return `Requiere especialización: ${b.spec.join(', ')}`;
  if (b.minTech && c.tech.level < b.minTech) return `Requiere nivel tecnológico ${b.minTech}`;
  if (b.requiresBuilding && (r.buildings[b.requiresBuilding] ?? 0) < 1) return `Requiere ${BUILDING_BY_ID[b.requiresBuilding]?.name ?? b.requiresBuilding} en la región`;
  if (r.queue.length >= 3) return 'Máximo 3 obras simultáneas por región';
  const extra = (r.buildings[b.id] ?? 0) - (r.baseBuildings[b.id] ?? 0) + r.queue.filter((q) => q.building === b.id).length;
  if (extra >= 6) return 'Rendimientos decrecientes: ya hay demasiados en esta región';
  return null;
}

export function startConstruction(world: World, c: Country, r: Region, b: BuildingDef) {
  const months = buildingMonths(c, b);
  r.queue.push({ building: b.id, remaining: months, total: months });
}

/** Recalcula los efectos (fx) de los edificios añadidos respecto al stock inicial. */
export function recomputeFx(c: Country, r: Region) {
  const fx: Record<string, number> = {};
  const scale = regionScale(c, r);
  for (const [id, n] of Object.entries(r.buildings)) {
    const extra = n - (r.baseBuildings[id] ?? 0);
    if (extra === 0) continue;
    const b = BUILDING_BY_ID[id];
    if (!b) continue;
    // Rendimientos decrecientes: cada edificio adicional rinde un 15 % menos
    const eff = extra > 0 ? (1 - Math.pow(0.85, extra)) / 0.15 : extra;
    for (const [k, v] of Object.entries(b.effects)) fx[k] = (fx[k] ?? 0) + v * eff * (SCALED.has(k) ? scale : 1);
  }
  r.fx = fx;
}

/** Avance mensual del sistema local de un país. */
export function updateRegions(world: World, c: Country) {
  const e = c.eco, s = c.soc;
  let devSum = 0;
  for (const r of c.regions) if (r.owner === c.id) devSum += r.popShare * r.dev;
  let upkeep = 0;
  for (const r of c.regions) {
    // Construcción
    for (const q of r.queue) {
      const b = BUILDING_BY_ID[q.building];
      if (!b) continue;
      if (r.controller !== r.owner) continue; // obras paralizadas en territorio ocupado
      const cost = buildingCost(c, r, b);
      e.extraSpending += (cost / q.total) * 12;
      q.remaining -= 1;
      if (q.remaining <= 0) completeBuilding(world, c, r, b);
    }
    r.queue = r.queue.filter((q) => q.remaining > 0);
    for (const [id, n] of Object.entries(r.buildings)) {
      const extra = n - (r.baseBuildings[id] ?? 0);
      if (extra > 0) upkeep += extra * (BUILDING_BY_ID[id]?.upkeep ?? 0) * regionScale(c, r) * priceLevel(c);
    }
    r.damage = Math.max(0, r.damage - 0.6);

    // Indicadores regionales
    const fx = r.fx;
    r.pop = s.pop * r.popShare;
    r.unemployment = clamp(e.unemployment * Math.pow(2 - clamp(r.dev, 0.5, 1.5), 0.9) - (fx.jobs ?? 0) * 1.5 + r.damage * 0.1, 0.5, 70);
    r.production = (e.gdp * r.popShare * r.dev) / Math.max(0.01, devSum) * (1 - r.damage / 150) * (r.controller === c.id ? 1 : 0.4);
    r.infra = clamp(e.infra * (0.8 + 0.2 * r.dev) + (fx.infra ?? 0) - r.damage * 0.5, 0, 100);
    r.education = clamp(s.education * (0.9 + 0.1 * r.dev) + (fx.education ?? 0), 0, 100);
    r.health = clamp(s.health * (0.9 + 0.1 * r.dev) + (fx.health ?? 0) - r.damage * 0.2, 0, 100);
    r.security = clamp(72 - s.protest * 0.3 - (s.gini - 30) * 0.4 + (e.budget.security - (c.base.budget_security ?? 1.5)) * 6
      + (fx.security ?? 0) - r.damage * 0.6 - (r.controller !== r.owner ? 40 : 0), 0, 100);
    r.quality = clamp(r.health * 0.3 + r.education * 0.2 + r.infra * 0.2 + r.security * 0.15 + Math.min(100, gdppc(c) / 700) * 0.15
      + (fx.quality ?? 0) - r.damage * 0.4, 0, 100);
    r.taxes = (e.revenue * r.production) / Math.max(1, e.gdp);
    r.development = clamp((r.infra + r.education + r.health + r.quality) / 4, 0, 100);
  }
  e.extraSpending += upkeep;
}

function completeBuilding(world: World, c: Country, r: Region, b: BuildingDef) {
  r.buildings[b.id] = (r.buildings[b.id] ?? 0) + 1;
  const before = { ...r.fx };
  recomputeFx(c, r);
  const d = (k: string) => (r.fx[k] ?? 0) - (before[k] ?? 0);
  // Efectos productivos de nivel: suben la capacidad nacional
  for (const k of ['food', 'minerals', 'oil', 'gas', 'chips'] as const) {
    const inc = d(k);
    if (inc) {
      c.res[k].prod += inc;
      c.res[k].baseProd += inc;
    }
  }
  if (d('output')) c.eco.gdp += d('output');
  if (d('renewables')) c.tech.renewables = clamp(c.tech.renewables + d('renewables') * r.popShare, 0, 99);
  if (d('readiness')) c.mil.readiness = clamp(c.mil.readiness + d('readiness'), 0, 100);
  if (d('logistics')) c.mil.logistics = clamp(c.mil.logistics + d('logistics'), 0, 100);
  if (world.player?.country === c.id) news(world, `${b.icon} Terminada la obra «${b.name}» en ${r.name}.`, 'obra', [c.id], 1);
}

/** Stock inicial de edificios (solo informativo; los efectos cuentan desde el cambio). */
export function initialBuildings(c: Country, r: Region): Record<string, number> {
  const scale = regionScale(c, r);
  const pc = gdppc(c);
  const devF = clamp(Math.log10(Math.max(500, pc) / 500) / 2, 0.1, 1.3) * r.dev;
  const n = (x: number) => Math.max(0, Math.round(x * scale * devF));
  const out: Record<string, number> = {
    carreteras: n(4), ferrocarril: n(1.5), hospital: n(3 * c.soc.health / 80), universidad: n(2 * c.soc.education / 80),
    centro_administrativo: n(1.5), comisaria: n(2), fabrica: n(r.spec === 'industria' ? 4 : 1.5), granja: n(r.spec === 'agricultura' ? 4 : 1),
    aeropuerto: n(0.8), vivienda_social: n(1), base_militar: n(0.6),
  };
  if (r.coastal) out.puerto = Math.max(1, n(1));
  if (r.spec === 'mineria') out.mina = Math.max(1, n(2));
  if (r.spec === 'energia') { out.yacimiento = Math.max(1, n(2)); out.central_termica = n(1); }
  if (r.spec === 'tecnologia') out.polo_tecnologico = Math.max(1, n(1.5));
  if (r.spec === 'turismo') out.turismo = Math.max(1, n(2));
  out.parque_renovable = n(c.tech.renewables / 40);
  for (const k of Object.keys(out)) if (out[k] === 0) delete out[k];
  return out;
}

export const BUILDINGS = DATA.buildings;

/** Orden de construcción (jugador o IA). El coste se paga mes a mes durante la obra. */
export function orderBuilding(world: World, c: Country, regionId: string, buildingId: string): { ok: boolean; text: string } {
  const r = c.regions.find((x) => x.id === regionId);
  const b = BUILDING_BY_ID[buildingId];
  if (!r || !b) return { ok: false, text: 'Región o edificio desconocido.' };
  const why = canBuild(world, c, r, b);
  if (why) return { ok: false, text: why };
  startConstruction(world, c, r, b);
  if (world.player?.country === c.id) {
    news(world, `${b.icon} Iniciada la obra «${b.name}» en ${r.name} (${buildingMonths(c, b)} meses).`, 'obra', [c.id], 1);
  }
  return { ok: true, text: `Obra iniciada: ${b.name} en ${r.name}.` };
}
