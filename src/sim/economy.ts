/** Macroeconomía: crecimiento, inflación, desempleo, presupuesto, deuda, moneda y reservas. */
import type { Contribution, Country, World } from './types';
import { BUDGET_ITEMS, COMMODITIES } from './types';
import { modParts, modSum, sanctionLevelOn } from './vars';
import { approach, clamp, gdppc } from './util';
import { commodityValue, supplyStress } from './market';
import { regimeOf } from './data';

const NEUTRAL_REAL = 1.0;
const INFL_WEIGHT: Record<string, number> = { oil: 0.035, gas: 0.02, minerals: 0.005, food: 0.07, chips: 0.005 };

function part(arr: Contribution[], label: string, value: number) {
  if (Math.abs(value) > 1e-4) arr.push({ label, value });
  return value;
}

export function debtRatio(c: Country): number {
  return (c.eco.debt / Math.max(1, c.eco.gdp)) * 100;
}

export function realRate(c: Country): number {
  return clamp(c.eco.policyRate - c.eco.inflationExpect, -8, 12);
}

/** Índice de presión fiscal que frena el crecimiento potencial. */
export function taxDrag(c: Country): number {
  const t = c.eco.taxes;
  return -(0.02 * t.income + 0.03 * t.corporate + 0.015 * t.consumption);
}

export function potentialGrowth(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  const pc = gdppc(c);
  const inst = 0.35 + 0.65 * (1 - c.pol.corruption / 100);
  let v = part(p, 'Base tecnológica mundial', 0.9);
  v += part(p, 'Convergencia (renta baja)', 3.2 * Math.pow(1 - Math.min(1, pc / 65000), 1.5) * inst);
  v += part(p, 'Demografía', ((c.soc.birth - c.soc.death + c.soc.migration) / 10) * 0.6 - (c.soc.medianAge - 38) * 0.03);
  v += part(p, 'Capital humano', (c.soc.education - 65) * 0.02);
  v += part(p, 'Infraestructuras', (c.eco.infra - 60) * 0.015);
  v += part(p, 'Nivel tecnológico', (c.tech.level - 60) * 0.015);
  v += part(p, 'Inversión', (c.eco.investment - 23) * 0.06);
  v += part(p, 'Estabilidad', (c.pol.stability - 55) * 0.02);
  v += part(p, 'Presión fiscal', taxDrag(c));
  for (const m of modParts(c, 'potentialGrowth')) v += part(p, m.label, m.value);
  v += part(p, 'Factores estructurales (calibración)', c.eco.calibPot);
  return { value: clamp(v, -6, 12), parts: p };
}

function commodityEffects(world: World, c: Country) {
  let growth = 0, infl = 0;
  const m = world.market;
  for (const k of COMMODITIES) {
    const r = c.res[k];
    const share = commodityValue(world, k, r.prod - r.cons) / Math.max(1, c.eco.gdp);
    const level = m.price[k] / m.base[k] - 1;
    const change = m.price[k] / m.ema[k] - 1;
    growth += share * (level * 0.05 + change * 0.25) * 100;
    const dep = r.cons > 0 ? clamp((r.cons - r.prod) / r.cons, -1, 1) : 0;
    infl += (INFL_WEIGHT[k] ?? 0) * (1 + Math.max(0, dep)) * change * 100;
    // Estrés de suministro por embargos o guerras de proveedores
    if ((k === 'oil' || k === 'gas' || k === 'food' || k === 'chips') && dep > 0.15) {
      const st = supplyStress(world, c, k);
      if (st > 0.02) {
        infl += st * (k === 'food' ? 12 : k === 'chips' ? 3 : 8);
        growth -= st * (k === 'chips' ? 2.5 : 1.5) * (1 + c.eco.sectors.industry / 30);
      }
    }
  }
  return { growth: clamp(growth, -8, 8), infl: clamp(infl, -6, 25) };
}

export function growthTarget(world: World, c: Country, gStar: number): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  let v = part(p, 'Crecimiento potencial', gStar);
  v += part(p, 'Impulso fiscal', clamp(0.4 * (c.eco.deficit - c.eco.structDeficit), -3, 3));
  v += part(p, 'Política monetaria', clamp(-0.3 * (c.eco.rateEma - (c.base.rateEma ?? NEUTRAL_REAL)), -2.5, 2.5));
  const openness = (c.eco.exports + c.eco.imports) / 200;
  v += part(p, 'Barreras comerciales', clamp(-6 * openness * (c.eco.tradeLoss - c.eco.tradeLossAdapted) * 3, -10, 3));
  const ce = commodityEffects(world, c);
  v += part(p, 'Precios de materias primas', ce.growth);
  v += part(p, 'Confianza empresarial', (c.groups.business.support - 50) * 0.02);
  v += part(p, 'Protestas y huelgas', -c.soc.protest * 0.025 - c.soc.strikes * 0.015);
  const sanc = sanctionLevelOn(world, c.id);
  v += part(p, 'Sanciones financieras', -clamp(sanc * 0.12, 0, 2.5) + (c.base.sanc ?? 0) * 0.12);
  v += part(p, 'Clima económico mundial', (world.global.worldGrowth - (world.global.worldGrowth0 ?? 2.7)) * 0.2);
  for (const m of modParts(c, 'growth')) v += part(p, m.label, m.value);
  v += part(p, 'Ciclo heredado (calibración)', c.eco.calibGrowth);
  return { value: clamp(v, -30, 20), parts: p };
}

export function inflationTarget(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  const indep = c.pol.policies.banco_central === undefined ? regimeOf(c.pol.regime).cbIndependent : c.pol.policies.banco_central === 0;
  const cred = clamp((indep ? 0.8 : 0.55) - Math.max(0, c.eco.inflation - 10) * 0.01, 0.15, 0.85);
  let v = part(p, 'Expectativas ancladas', cred * c.eco.cbTarget + (1 - cred) * c.eco.inflationExpect);
  v += part(p, 'Presión de demanda', clamp(0.25 * c.eco.outputGap, -3, 5));
  const hist = c.eco.currencyHist;
  const depr = hist.length ? (hist[0] / c.eco.currency - 1) * 100 : 0;
  v += part(p, 'Inflación importada (tipo de cambio)', clamp(depr * (c.eco.imports / 100) * 0.6, -4, 40));
  const ce = commodityEffects(world, c);
  v += part(p, 'Energía y alimentos', ce.infl);
  v += part(p, 'Política monetaria', clamp(-0.25 * (c.eco.rateEma - (c.base.rateEma ?? NEUTRAL_REAL)), -3, 3));
  // Monetización del déficit cuando no hay financiación
  const lowReserves = !c.eco.euro && c.eco.reserves < (c.eco.gdp * c.eco.imports) / 100 / 12;
  const stress = c.eco.riskPremium > 7 || (lowReserves && c.eco.riskPremium > 3 && !c.eco.reserveCurrency && c.eco.deficit > 4);
  if (stress) v += part(p, 'Financiación monetaria del déficit', clamp((c.eco.deficit - 2) * 1.5, 0, 60));
  for (const m of modParts(c, 'inflation')) v += part(p, m.label, m.value);
  v += part(p, 'Inercia heredada (calibración)', c.eco.calibInfl);
  return { value: clamp(v, -4, 3000), parts: p };
}

export function unemploymentTarget(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  let v = part(p, 'Desempleo estructural', c.eco.naturalUnemployment);
  v += part(p, 'Ciclo económico', clamp(-0.45 * c.eco.outputGap, -6, 15));
  v += part(p, 'Movilización militar', -c.mil.mobilization * 0.8);
  v += part(p, 'Empleo regional (obras e industria)', -regionalSum(c, 'jobs'));
  for (const m of modParts(c, 'naturalUnemployment')) v += part(p, m.label, m.value);
  for (const m of modParts(c, 'unemployment')) v += part(p, m.label, m.value);
  return { value: clamp(v, 0.8, 50), parts: p };
}

/** Media ponderada por población de un efecto regional de edificios (fx) en las regiones propias. */
export function regionalSum(c: Country, key: string): number {
  let s = 0;
  for (const r of c.regions) if (r.owner === c.id && r.controller === c.id) s += r.popShare * (r.fx[key] ?? 0);
  return s;
}

/** Suma absoluta de un efecto regional (producción, investigación…). */
export function regionalTotal(c: Country, key: string): number {
  let s = 0;
  for (const r of c.regions) if (r.owner === c.id && r.controller === c.id) s += r.fx[key] ?? 0;
  return s;
}

/** Ingresos públicos anuales (miles de millones). */
export function revenue(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  const t = c.eco.taxes;
  const compliance = 1 - c.pol.corruption / 250;
  const econMin = (c.pol.ministers.find((m) => m.ministry === 'economy')?.competence ?? 50) - 50;
  const eff = c.eco.taxEfficiency * compliance * (1 + modSum(c, 'taxEfficiency') + regionalSum(c, 'taxEfficiency') + econMin * 0.0015);
  const occ = c.regions.filter((r) => r.owner === c.id && r.controller !== c.id).reduce((a, r) => a + r.popShare, 0);
  const base = c.eco.gdp * (1 - occ * 0.8);
  let v = part(p, 'Impuesto sobre la renta', (base * 0.45 * t.income * eff) / 100);
  v += part(p, 'Impuesto de sociedades', (base * 0.1 * t.corporate * eff) / 100);
  v += part(p, 'Impuestos al consumo', (base * 0.35 * t.consumption * eff) / 100);
  v += part(p, 'Aranceles', ((c.eco.gdp * c.eco.imports) / 100) * (t.tariff / 100) * 0.7 * c.eco.tradeAccess);
  let resRev = 0;
  for (const k of ['oil', 'gas', 'minerals'] as const) {
    const net = commodityValue(world, k, c.res[k].prod - c.res[k].cons);
    if (net > 0) resRev += net;
  }
  v += part(p, 'Rentas de recursos naturales', resRev * clamp(c.eco.stateResourceShare + modSum(c, 'resourceShare'), 0, 0.95));
  v += part(p, 'Ayuda exterior recibida', c.eco.aidIn);
  v += part(p, 'Otros ingresos', c.eco.calibRevenueBase * (c.eco.gdp / Math.max(1, c.base.gdp)));
  return { value: Math.max(0, v), parts: p };
}

/** Componentes de ingresos con eficiencia fiscal 1 (para calibrar). */
export function rawRevenueParts(world: World, c: Country): { taxesAtEff1: number; tariffs: number; resources: number } {
  const t = c.eco.taxes;
  const compliance = 1 - c.pol.corruption / 250;
  const occ = c.regions.filter((r) => r.owner === c.id && r.controller !== c.id).reduce((a, r) => a + r.popShare, 0);
  const econMin = (c.pol.ministers.find((m) => m.ministry === 'economy')?.competence ?? 50) - 50;
  const extraEff = 1 + modSum(c, 'taxEfficiency') + regionalSum(c, 'taxEfficiency') + econMin * 0.0015;
  const taxesAtEff1 = (c.eco.gdp * (1 - occ * 0.8) * (0.45 * t.income + 0.1 * t.corporate + 0.35 * t.consumption) * compliance * extraEff) / 100;
  const tariffs = ((c.eco.gdp * c.eco.imports) / 100) * (t.tariff / 100) * 0.7 * c.eco.tradeAccess;
  let resRev = 0;
  for (const k of ['oil', 'gas', 'minerals'] as const) {
    const net = commodityValue(world, k, c.res[k].prod - c.res[k].cons);
    if (net > 0) resRev += net;
  }
  return { taxesAtEff1, tariffs, resources: resRev * clamp(c.eco.stateResourceShare + modSum(c, 'resourceShare'), 0, 0.95) };
}

export function budgetTotal(c: Country): number {
  let s = 0;
  for (const k of BUDGET_ITEMS) s += c.eco.budget[k];
  return s;
}

/** Gasto público anual (miles de millones), sin contar intereses. */
export function spending(world: World, c: Country): number {
  return (c.eco.gdp * budgetTotal(c)) / 100 + c.eco.extraSpending + c.eco.aidOut;
}

export function taylorRate(c: Country): number {
  const e = c.eco;
  const pi = 0.5 * e.inflation + 0.5 * e.inflationExpect;
  return NEUTRAL_REAL + pi + 0.5 * (pi - e.cbTarget) + 0.5 * e.outputGap;
}

export function riskPremiumTarget(world: World, c: Country): number {
  const dr = debtRatio(c);
  const sanc = sanctionLevelOn(world, c.id);
  const b0 = c.base.sanc ?? sanc;
  let rp = 0.03 * (dr - 60) + 0.25 * (c.eco.deficit - 3) + 0.04 * (50 - c.pol.stability) + 0.25 * Math.max(0, sanc - b0) + 0.04 * b0;
  if (world.turn - c.eco.defaulted < 60) rp += 4;
  const resCover = c.eco.reserves / Math.max(1, (c.eco.gdp * c.eco.imports) / 100);
  rp -= clamp(resCover * 2, 0, 2);
  if (c.eco.reserveCurrency) rp *= 0.3;
  return clamp(rp, 0, 40);
}

/** Avance mensual de la economía de un país. */
export function updateEconomy(world: World, c: Country) {
  const e = c.eco;
  const explain = c.explain;

  // --- Presupuesto y deuda ---
  const rev = revenue(world, c);
  e.revenue = rev.value;
  e.spending = spending(world, c);
  e.interest = (e.debt * e.debtRate) / 100;
  const deficitBn = e.spending + e.interest - e.revenue;
  e.deficit = (deficitBn / e.gdp) * 100;
  e.structDeficit = approach(e.structDeficit, e.deficit, 1 / 24);
  explain.revenue = rev.parts;
  explain.deficit = [
    { label: 'Gasto por partidas', value: (budgetTotal(c) * e.gdp) / 100 / e.gdp * 100 },
    { label: 'Intereses de la deuda', value: (e.interest / e.gdp) * 100 },
    { label: 'Obras, ayudas y gastos extraordinarios', value: ((e.extraSpending + e.aidOut) / e.gdp) * 100 },
    { label: 'Ingresos', value: -(e.revenue / e.gdp) * 100 },
  ];
  e.debt = Math.max(0, e.debt + deficitBn / 12 - (e.debt * clamp(e.inflation, -5, 200)) / 1200);
  e.riskPremium = approach(e.riskPremium, riskPremiumTarget(world, c), 0.15);
  const drTarget = clamp(e.policyRate * 0.7 + 1.0 + e.riskPremium + e.calibDebtRate, 0.2, 90);
  e.debtRate = approach(e.debtRate, drTarget, 1 / 36);
  e.calibDebtRate *= 0.997;

  // --- Política monetaria ---
  const indep = c.pol.policies.banco_central === undefined ? regimeOf(c.pol.regime).cbIndependent : c.pol.policies.banco_central === 0;
  const playerSets = world.player?.country === c.id && !indep;
  if (!playerSets) {
    const taylor = taylorRate(c);
    // Un banco central subordinado acomoda la inflación (tipos reales negativos)
    const policy = indep ? taylor : 0.5 * taylor + 0.5 * (e.inflationExpect * 0.85 + 0.5);
    const tgt = clamp(policy + c.eco.calibRate, 0, Math.max(80, e.inflation * 1.2));
    e.policyRate = approach(e.policyRate, tgt, indep ? 0.12 : 0.06);
    e.calibRate *= 0.97;
  }
  e.rateEma = approach(e.rateEma, realRate(c), 1 / 6);

  // --- Comercio ---
  e.tradeLoss = 1 - Math.min(1, e.tradeAccess);
  e.tradeLossAdapted = approach(e.tradeLossAdapted, e.tradeLoss, 1 / 24);

  // --- Crecimiento ---
  const pot = potentialGrowth(world, c);
  e.potentialGrowth = pot.value;
  const gT = growthTarget(world, c, pot.value);
  e.growth = approach(e.growth, gT.value, 0.25);
  e.gdp = Math.max(0.5, e.gdp * (1 + e.growth / 1200));
  e.outputGap = clamp(e.outputGap * 0.97 + (e.growth - e.potentialGrowth) / 12, -20, 20);
  e.calibGrowth *= 0.985;
  e.calibPot *= 0.996;
  explain.potentialGrowth = pot.parts;
  explain.growth = gT.parts;

  // --- Inflación ---
  const iT = inflationTarget(world, c);
  e.inflation = clamp(approach(e.inflation, iT.value, 0.15), -5, 3000);
  e.inflationExpect = approach(e.inflationExpect, e.inflation, 1 / 12);
  e.calibInfl *= 0.97;
  explain.inflation = iT.parts;
  if (e.inflation > 100) e.hyperMonths += 1;
  else e.hyperMonths = Math.max(0, e.hyperMonths - 1);

  // --- Desempleo ---
  const uT = unemploymentTarget(world, c);
  e.unemployment = clamp(approach(e.unemployment, uT.value, 0.08), 0.5, 55);
  explain.unemployment = uT.parts;

  // --- Inversión ---
  const invT = c.base.investment + (c.groups.business.support - (c.base.business ?? 50)) * 0.06 + (c.pol.stability - (c.base.stability ?? 55)) * 0.05
    - (e.rateEma - (c.base.rateEma ?? e.rateEma)) * 0.25 + modSum(c, 'investment');
  e.investment = clamp(approach(e.investment, invT, 1 / 12), 5, 55);

  // --- Comercio exterior, moneda y reservas ---
  let commEx = 0, commIm = 0;
  for (const k of COMMODITIES) {
    const net = commodityValue(world, k, c.res[k].prod - c.res[k].cons);
    if (net > 0) commEx += net * world.market.access[k];
    else commIm += -net;
  }
  const gdpRatio = e.gdp / Math.max(1, c.base.gdp);
  const nonEx = e.nonCommExports * Math.pow(gdpRatio, 0.85) * Math.pow(100 / e.currency, 0.5) * clamp(e.tradeAccess, 0, 1.3)
    * (1 + modSum(c, 'exports') + regionalTotal(c, 'exports') / 100);
  const nonIm = e.nonCommImports * Math.pow(gdpRatio, 1.05) * Math.pow(e.currency / 100, 0.35) * clamp(e.tradeAccess, 0, 1.3);
  e.exports = clamp(((nonEx + commEx) / e.gdp) * 100, 1, 250);
  e.imports = clamp(((nonIm + commIm) / e.gdp) * 100, 1, 250);
  e.currentAccount = e.exports - e.imports + ((e.aidIn - e.aidOut) / e.gdp) * 100;

  const flight = Math.max(0, (40 - c.pol.stability) * 0.02) + Math.max(0, (e.riskPremium - 5) * 0.08);
  const rr = realRate(c);
  const b = c.base;
  let dCur = 0.05 * ((rr - (b.rateEma ?? rr)) - (world.global.worldRealRate - 1)) + 0.04 * (e.currentAccount - (b.currentAccount ?? 0))
    - 0.004 * clamp(e.inflation - Math.max(b.inflation ?? 3, 3), -10, 200) + 0.005 * (c.pol.stability - (b.stability ?? 55))
    - flight * 0.6 + 0.004 * (100 - e.currency) + modSum(c, 'currency');
  dCur = clamp(dCur, -12, 6);
  e.currency = clamp(e.currency * (1 + dCur / 100), 5, 400);
  e.currencyHist.push(e.currency);
  if (e.currencyHist.length > 12) e.currencyHist.shift();

  // Flujos de capital: financiación estructural del déficit exterior inicial + flujos especulativos
  const structural = -(c.base.currentAccount ?? 0) / 100 * e.gdp;
  const capFlows = structural + e.gdp * ((c.pol.stability - (c.base.stability ?? 55)) * 0.0006 + (rr - (c.base.rateEma ?? rr)) * 0.001 - flight * 0.012);
  e.reserves = Math.max(0, e.reserves + (((e.currentAccount / 100) * e.gdp + capFlows) / 12) * 0.6);

  // --- Sectores ---
  updateSectors(world, c);

  // --- Infraestructuras ---
  const infraT = c.base.infra + (e.budget.infrastructure - c.base.budget_infrastructure) * 5 + regionalSum(c, 'infra') + modSum(c, 'infra') - avgDamage(c) * 0.3;
  e.infra = clamp(approach(e.infra, infraT, 1 / 36), 5, 100);
}

function avgDamage(c: Country): number {
  let s = 0;
  for (const r of c.regions) if (r.owner === c.id) s += r.popShare * r.damage;
  return s;
}

function updateSectors(world: World, c: Country) {
  const s = c.eco.sectors;
  const b = c.base;
  let energyVal = 0;
  for (const k of ['oil', 'gas'] as const) energyVal += commodityValue(world, k, c.res[k].prod);
  const energy0 = b.energyValue || 1;
  s.energy = clamp(b.sector_energy * Math.pow(energyVal / energy0 / Math.max(0.3, c.eco.gdp / b.gdp), 0.8), 0.3, 70);
  s.agriculture = clamp(b.sector_agriculture * (c.res.food.prod / Math.max(1e-6, c.res.food.baseProd)) * Math.pow(b.gdp / c.eco.gdp, 0.6), 0.3, 60);
  s.tech = clamp(b.sector_tech * (1 + (c.tech.level - b.techLevel) / 40) * (1 + modSum(c, 'sector.tech')), 0.5, 45);
  s.industry = clamp(b.sector_industry * (1 + modSum(c, 'sector.industry')) * Math.pow(c.eco.currency / 100, -0.1), 2, 60);
  s.services = clamp(100 - s.energy - s.agriculture - s.tech - s.industry, 10, 90);
}

