/** Cambios de presupuesto, impuestos y tipos de interés decididos por el jugador. */
import type { BudgetItem, Country, TaxId, World } from './types';
import { BUDGET_ITEMS, TAXES } from './types';
import { forecastVote, type Lean, type VoteForecast } from './parliament';
import { regimeOf } from './data';
import { bumpRev, clamp, news, rngOf, timeline } from './util';

export interface FiscalDraft {
  budget: Record<BudgetItem, number>;
  taxes: Record<TaxId, number>;
  rate: number;
}

export function draftFrom(c: Country): FiscalDraft {
  return { budget: { ...c.eco.budget }, taxes: { ...c.eco.taxes }, rate: c.eco.policyRate };
}

export function cbIndependent(c: Country): boolean {
  const lv = c.pol.policies.banco_central;
  return lv === undefined ? regimeOf(c.pol.regime).cbIndependent : lv === 0;
}

export interface FiscalInfo {
  changed: boolean;
  magnitude: number;
  ap: number;
  lean: Lean;
  vote: VoteForecast;
  deficitDelta: number; // % PIB, efecto estático inmediato
  rateChanged: boolean;
  warnings: string[];
}

export function fiscalInfo(world: World, c: Country, d: FiscalDraft): FiscalInfo {
  let mag = 0, econ = 0;
  let spendDelta = 0;
  for (const k of BUDGET_ITEMS) {
    const delta = d.budget[k] - c.eco.budget[k];
    mag += Math.abs(delta);
    spendDelta += delta;
    if (k === 'social' || k === 'pensions' || k === 'health' || k === 'education') econ -= delta * 0.18;
    if (k === 'defense' || k === 'security') econ += delta * 0.12;
    if (k === 'subsidies') econ -= delta * 0.08;
  }
  let revDelta = 0;
  for (const k of TAXES) {
    const delta = d.taxes[k] - c.eco.taxes[k];
    mag += Math.abs(delta) * 0.3;
    if (k === 'income' || k === 'corporate') econ -= delta * 0.05;
    if (k === 'tariff') econ -= delta * 0.02;
    const base = k === 'income' ? 0.45 : k === 'corporate' ? 0.1 : k === 'consumption' ? 0.35 : (c.eco.imports / 100) * 0.7;
    revDelta += delta * base * c.eco.taxEfficiency * (1 - c.pol.corruption / 250);
  }
  const rateChanged = Math.abs(d.rate - c.eco.policyRate) > 0.01;
  const changed = mag > 0.005 || rateChanged;
  const lean: Lean = { econ: clamp(econ, -1, 1), auth: 0 };
  const vote = forecastVote(world, c, lean);
  const ap = !changed ? 0 : mag > 4 ? 3 : mag > 1.5 ? 2 : 1;
  const warnings: string[] = [];
  const newDef = c.eco.deficit + spendDelta - revDelta;
  if (newDef > 6) warnings.push(`Déficit estimado del ${newDef.toFixed(1)} % del PIB: la prima de riesgo subirá.`);
  if (d.taxes.consumption - c.eco.taxes.consumption > 2) warnings.push('Subir el IVA dispara los precios a corto plazo y enfada a trabajadores y jóvenes.');
  if (d.budget.defense < c.eco.budget.defense * 0.8) warnings.push('Un recorte fuerte de defensa reduce la preparación militar y el apoyo de los militares.');
  if (d.taxes.corporate - c.eco.taxes.corporate > 3) warnings.push('Subir sociedades frena la inversión y el crecimiento potencial.');
  if (rateChanged && d.rate < c.eco.inflation - 2) warnings.push('Tipos reales muy negativos: más crecimiento ahora, más inflación después.');
  return { changed, magnitude: mag, ap: rateChanged && mag < 0.005 ? 1 : ap, lean, vote, deficitDelta: spendDelta - revDelta, rateChanged, warnings };
}

export interface ApplyResult { ok: boolean; passed: boolean; text: string }

export function applyFiscal(world: World, c: Country, d: FiscalDraft): ApplyResult {
  const info = fiscalInfo(world, c, d);
  if (!info.changed) return { ok: false, passed: false, text: 'No hay cambios que aprobar.' };
  if (c.pol.ap < info.ap) return { ok: false, passed: false, text: `Necesitas ${info.ap} de capital político.` };
  c.pol.ap -= info.ap;
  // El tipo de interés lo fija el Gobierno solo si el banco central está subordinado
  if (info.rateChanged && !cbIndependent(c)) c.eco.policyRate = clamp(d.rate, 0, 200);
  const budgetChanged = info.magnitude > 0.005;
  if (!budgetChanged) {
    news(world, `${c.name} fija el tipo de interés oficial en el ${c.eco.policyRate.toFixed(2)} %.`, 'economia', [c.id], 1);
    return { ok: true, passed: true, text: 'Tipo de interés modificado.' };
  }
  const rng = rngOf(world);
  const passed = !info.vote.required || rng.next() < info.vote.prob;
  world.rng = rng.state;
  if (!passed) {
    c.pol.legitimacy = clamp(c.pol.legitimacy - 2, 0, 100);
    news(world, `El parlamento de ${c.name} rechaza los presupuestos del Gobierno.`, 'politica', [c.id], 2);
    timeline(world, 'Presupuestos rechazados por el parlamento', 'politica');
    return { ok: true, passed: false, text: 'El parlamento ha rechazado los presupuestos. Has perdido el capital político invertido.' };
  }
  const dVat = d.taxes.consumption - c.eco.taxes.consumption;
  for (const k of BUDGET_ITEMS) c.eco.budget[k] = clamp(d.budget[k], 0, 60);
  for (const k of TAXES) c.eco.taxes[k] = clamp(d.taxes[k], 0, k === 'tariff' ? 80 : 70);
  bumpRev(world);
  // Efecto precio inmediato del IVA
  if (dVat) c.eco.inflation = clamp(c.eco.inflation + dVat * 0.25, -5, 3000);
  news(world, `${c.name} aprueba nuevos presupuestos (cambio de ${info.deficitDelta >= 0 ? '+' : ''}${info.deficitDelta.toFixed(1)} pp en el saldo).`, 'economia', [c.id], 1);
  timeline(world, `Presupuestos aprobados (${info.magnitude.toFixed(1)} pp de cambios)`, 'economia');
  return { ok: true, passed: true, text: 'Presupuestos aprobados.' };
}
