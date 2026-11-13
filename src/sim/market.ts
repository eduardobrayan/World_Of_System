/** Mercado mundial de materias primas y matriz de comercio por gravedad. */
import type { Commodity, Country, Dict, Id, World } from './types';
import { COMMODITIES } from './types';
import { COMMODITY_BY_ID, DATA } from './data';
import { clamp, haversine } from './util';
import { neighborsLand, neighborsSea, sanctionLevelOn } from './vars';

const INCOME_ELASTICITY: Record<Commodity, number> = { oil: 0.45, gas: 0.55, minerals: 0.9, food: 0.35, chips: 1.2 };
const CAPACITY_TREND: Record<Commodity, number> = { oil: 0.2, gas: 0.9, minerals: 2.6, food: 1.3, chips: 3.8 };

export function centroidOf(id: Id): [number, number] {
  return DATA.adjacency[id]?.centroid ?? [0, 0];
}

/** Valor anual (miles de millones) de una cantidad de materia prima al precio actual. */
export function commodityValue(world: World, k: Commodity, qty: number): number {
  return qty * world.market.price[k] * COMMODITY_BY_ID[k].valueFactor;
}

export function netExportValue(world: World, c: Country, k: Commodity): number {
  const r = c.res[k];
  return commodityValue(world, k, r.prod - r.cons);
}

// ---------- Comercio ----------

function baseWeight(world: World, a: Country, b: Country): number {
  const d = haversine(centroidOf(a.id), centroidOf(b.id));
  let w = (Math.pow(a.eco.gdp, 0.8) * Math.pow(b.eco.gdp, 0.8)) / Math.pow(d + 600, 1.0);
  if (neighborsLand(a.id).includes(b.id)) w *= 1.8;
  else if (neighborsSea(a.id).includes(b.id)) w *= 1.25;
  for (const o of Object.values(world.orgs)) {
    if (o.tradeBonus > 0 && o.members.includes(a.id) && o.members.includes(b.id)) w *= 1 + o.tradeBonus;
  }
  if (world.treaties.some((t) => t.type === 'trade' && t.parties.includes(a.id) && t.parties.includes(b.id))) w *= 1.4;
  const op = world.rel[a.id]?.[b.id]?.op ?? 0;
  w *= Math.exp((op / 100) * 0.45);
  return w;
}

/** Barrera comercial efectiva entre a y b (−0.5 = impulso, 1 = cerrado). */
export function tradeBarrier(world: World, a: Id, b: Id): number {
  let open = 1;
  for (const s of world.sanctions) {
    if ((s.by === a && s.target === b) || (s.by === b && s.target === a)) {
      open *= 1 - [0, 0.3, 0.6, 0.95][clamp(s.level, 0, 3)];
    }
  }
  const tAB = world.tariffs[a]?.[b] ?? 0;
  const tBA = world.tariffs[b]?.[a] ?? 0;
  open *= 1 - clamp((tAB + tBA) / 200, 0, 0.7);
  for (const w of world.wars) {
    if (w.ceasefire > 0) continue;
    const sideA = w.attackers.includes(a) ? 1 : w.defenders.includes(a) ? 2 : 0;
    const sideB = w.attackers.includes(b) ? 1 : w.defenders.includes(b) ? 2 : 0;
    if (sideA && sideB && sideA !== sideB) open = 0;
    if (w.blockade.includes(b) && !neighborsLand(a).includes(b)) open *= 0.35;
    if (w.blockade.includes(a) && !neighborsLand(b).includes(a)) open *= 0.35;
  }
  const op = Math.min(world.rel[a]?.[b]?.op ?? 0, world.rel[b]?.[a]?.op ?? 0);
  if (op < -60) open *= 0.9;
  let bonus = 0;
  for (const t of world.treaties) {
    if (t.start > 0 && (t.type === 'trade') && t.parties.includes(a) && t.parties.includes(b)) bonus += 0.25;
  }
  const ca = world.countries[a], cb = world.countries[b];
  if (ca && cb) {
    // Variación del arancel general respecto al inicial
    const da = (ca.eco.taxes.tariff - (ca.base.tariff ?? ca.eco.taxes.tariff)) / 100;
    const db = (cb.eco.taxes.tariff - (cb.base.tariff ?? cb.eco.taxes.tariff)) / 100;
    open *= 1 - clamp((da + db) * 0.6, -0.3, 0.6);
  }
  if (world.global.pandemic) open *= 1 - 0.08 * world.global.pandemic.severity;
  return clamp(1 - open - bonus, -0.5, 1);
}

/** Matriz base de comercio (miles de millones/año) normalizada a las exportaciones de cada país. */
export function initTrade(world: World) {
  const ids = world.order;
  const raw: Dict<Dict<number>> = {};
  for (const a of ids) {
    raw[a] = {};
    let tot = 0;
    for (const b of ids) {
      if (a === b) continue;
      const w = baseWeight(world, world.countries[a], world.countries[b]) * Math.max(0.05, 1 - tradeBarrier(world, a, b));
      raw[a][b] = w;
      tot += w;
    }
    const ca = world.countries[a];
    const exportsBn = (ca.eco.gdp * ca.eco.exports) / 100;
    for (const b of ids) {
      if (a === b) continue;
      const eff = Math.max(0.05, 1 - tradeBarrier(world, a, b));
      // Guardamos el comercio "potencial" sin barreras actuales
      raw[a][b] = ((raw[a][b] / tot) * exportsBn) / eff;
    }
  }
  world.trade = raw;
}

/** Acceso comercial de cada país (0..1+) según las barreras vigentes. */
export function updateTradeAccess(world: World) {
  for (const a of world.order) {
    const c = world.countries[a];
    if (!c.alive) continue;
    let tot = 0, eff = 0;
    for (const b of world.order) {
      if (a === b) continue;
      const v = (world.trade[a]?.[b] ?? 0) + (world.trade[b]?.[a] ?? 0);
      if (v <= 0) continue;
      tot += v;
      eff += v * (1 - tradeBarrier(world, a, b));
    }
    c.eco.tradeAccess = tot > 0 ? clamp(eff / tot, 0, 1.5) : 1;
  }
}

/** Socios comerciales principales (comercio efectivo actual). */
export function topPartners(world: World, a: Id, n = 6): { id: Id; value: number; share: number }[] {
  const out: { id: Id; value: number; share: number }[] = [];
  let tot = 0;
  for (const b of world.order) {
    if (a === b) continue;
    const v = ((world.trade[a]?.[b] ?? 0) + (world.trade[b]?.[a] ?? 0)) * Math.max(0, 1 - tradeBarrier(world, a, b));
    tot += v;
    out.push({ id: b, value: v, share: 0 });
  }
  for (const o of out) o.share = tot > 0 ? o.value / tot : 0;
  return out.sort((x, y) => y.value - x.value).slice(0, n);
}

// ---------- Mercado de materias primas ----------

function exportAccess(world: World, c: Country): number {
  // Un exportador muy sancionado no puede colocar todo su producto en el mercado.
  const s = sanctionLevelOn(world, c.id);
  return clamp(1 - 0.035 * s, 0.55, 1);
}

export function initMarket(world: World) {
  const m = world.market;
  for (const k of COMMODITIES) {
    const def = COMMODITY_BY_ID[k];
    m.price[k] = def.price;
    m.base[k] = def.price;
    m.ema[k] = def.price;
    m.shock[k] = 0;
    m.history[k] = [def.price];
    let S = 0, D = 0;
    for (const id of world.order) {
      const c = world.countries[id];
      S += c.res[k].prod * exportAccess(world, c) + c.res[k].prod * (1 - exportAccess(world, c)) * 0.6;
      D += c.res[k].cons;
    }
    // Calibración: el consumo mundial iguala a la oferta disponible al inicio
    const f = S / Math.max(1e-6, D);
    for (const id of world.order) {
      const c = world.countries[id];
      c.res[k].cons *= f;
      c.res[k].baseCons = c.res[k].cons;
      c.res[k].baseProd = c.res[k].prod;
      c.res[k].capacityGrowth = CAPACITY_TREND[k];
    }
    m.supply[k] = S;
    m.demand[k] = S;
    m.access[k] = 1;
  }
}

export function updateMarket(world: World) {
  const m = world.market;
  const tension = world.global.tension;
  for (const k of COMMODITIES) {
    const def = COMMODITY_BY_ID[k];
    let S = 0, D = 0, Sfull = 0;
    for (const id of world.order) {
      const c = world.countries[id];
      if (!c.alive) continue;
      const r = c.res[k];
      // Respuesta de la producción al precio (inversión) y tendencia de capacidad
      const priceSignal = clamp(m.price[k] / m.base[k] - 1, -0.6, 1.5);
      const growthM = (r.capacityGrowth / 100 + def.supplyResponse * priceSignal + techProdBonus(c, k)) / 12;
      const occupied = c.regions.length ? c.regions.filter((x) => x.owner === c.id && x.controller !== c.id).reduce((a, x) => a + x.popShare, 0) : 0;
      r.prod = clamp(r.prod * (1 + growthM), r.baseProd * 0.15, Math.max(r.baseProd * 3, r.baseProd + 0.5));
      const effProd = r.prod * (1 - occupied * 0.7) * (1 + c.mods.reduce((a, md) => a + (md.mods[`prod.${k}`] ?? 0), 0));
      // Demanda: renta, precio y transición energética
      const inc = Math.pow(c.eco.gdp / Math.max(1, c.base.gdp), INCOME_ELASTICITY[k]);
      const popF = k === 'food' ? Math.pow(c.soc.pop / Math.max(0.01, c.base.pop), 0.8) / Math.pow(c.eco.gdp / Math.max(1, c.base.gdp), 0.1) : 1;
      const priceF = Math.pow(m.price[k] / m.base[k], -def.demandResponse);
      const transition = def.energy ? clamp(1 - ((c.tech.renewables - (c.base.renewables ?? c.tech.renewables)) / 100) * 0.55, 0.4, 1.3) : 1;
      r.cons = r.baseCons * inc * popF * priceF * transition;
      const acc = exportAccess(world, c);
      const surplus = Math.max(0, effProd - r.cons);
      S += effProd - surplus * (1 - acc) * 0.4;
      Sfull += effProd;
      D += r.cons;
    }
    m.supply[k] = S;
    m.demand[k] = D;
    m.access[k] = Sfull > 0 ? S / Sfull : 1;
    const imbalance = clamp((D - S) / Math.max(1e-6, S), -0.5, 0.5);
    const tensionPremium = k === 'oil' || k === 'gas' ? Math.max(0, tension - 30) / 250 : k === 'chips' ? Math.max(0, tension - 40) / 400 : 0;
    const anchor = m.base[k] * (1 + tensionPremium);
    let p = m.price[k] * Math.exp(def.elasticity * imbalance * 0.6) * Math.pow(anchor / m.price[k], 0.05) * (1 + m.shock[k]);
    p = clamp(p, m.base[k] * 0.3, m.base[k] * 5);
    m.price[k] = p;
    m.shock[k] *= 0.75;
    if (Math.abs(m.shock[k]) < 1e-4) m.shock[k] = 0;
    m.ema[k] = m.ema[k] + (p - m.ema[k]) / 18;
    m.history[k].push(Math.round(p * 100) / 100);
    if (m.history[k].length > 900) m.history[k].shift();
  }
}

function techProdBonus(c: Country, k: Commodity): number {
  let b = 0;
  for (const md of c.mods) b += md.mods[`capacity.${k}`] ?? 0;
  return b / 100;
}

/**
 * Proveedores de las importaciones netas de una materia prima para `importer`
 * (reparto por comercio bilateral y barreras actuales).
 */
export function suppliers(world: World, importer: Country, k: Commodity, withBarriers = true): { id: Id; share: number }[] {
  const need = importer.res[k].cons - importer.res[k].prod;
  if (need <= 0) return [];
  const out: { id: Id; share: number }[] = [];
  let tot = 0;
  for (const id of world.order) {
    if (id === importer.id) continue;
    const c = world.countries[id];
    const surplus = c.res[k].prod - c.res[k].cons;
    if (surplus <= 0) continue;
    const tradeLink = (world.trade[id]?.[importer.id] ?? 0) + (world.trade[importer.id]?.[id] ?? 0) + importer.eco.gdp * 0.0005;
    const bar = withBarriers ? Math.max(0, tradeBarrier(world, id, importer.id)) : 0;
    const w = surplus * Math.sqrt(tradeLink) * (1 - bar);
    if (w <= 0) continue;
    out.push({ id, share: w });
    tot += w;
  }
  for (const o of out) o.share /= tot || 1;
  return out.sort((a, b) => b.share - a.share);
}

/** Estrés de suministro (0..1): parte de las importaciones habituales que hoy está bloqueada. */
export function supplyStress(world: World, c: Country, k: Commodity): number {
  const need = c.res[k].cons - c.res[k].prod;
  if (need <= 0) return 0;
  const dep = need / Math.max(1e-6, c.res[k].cons);
  const base = suppliers(world, c, k, false);
  let blocked = 0;
  for (const s of base) blocked += s.share * Math.max(0, tradeBarrier(world, s.id, c.id));
  return clamp(blocked * dep, 0, 1);
}
