/**
 * Previsión contrafactual: simula N meses con y sin una decisión (sin eventos ni decisiones de la IA)
 * para mostrar el efecto aislado antes de confirmarla.
 */
import type { Id, World } from './types';
import { advanceTurn } from './turn';
import { cloneWorld } from './save';

export interface ForecastPoint { growth: number; inflation: number; unemployment: number; deficit: number; debt: number; approval: number; stability: number; gdp: number }
export interface ForecastResult { months: number; base: ForecastPoint[]; alt: ForecastPoint[]; delta: ForecastPoint }

function point(w: World, id: Id): ForecastPoint {
  const c = w.countries[id];
  return {
    growth: c.eco.growth, inflation: c.eco.inflation, unemployment: c.eco.unemployment, deficit: c.eco.deficit,
    debt: (c.eco.debt / c.eco.gdp) * 100, approval: c.pol.approval, stability: c.pol.stability, gdp: c.eco.gdp,
  };
}

export function forecast(world: World, id: Id, mutate: (w: World) => void, months = 12): ForecastResult {
  const a = cloneWorld(world);
  a.forecast = true;
  a.pendingEvents = [];
  const b = cloneWorld(a);
  mutate(b);
  const base: ForecastPoint[] = [point(a, id)], alt: ForecastPoint[] = [point(b, id)];
  for (let i = 0; i < months; i++) {
    advanceTurn(a);
    advanceTurn(b);
    base.push(point(a, id));
    alt.push(point(b, id));
  }
  const la = base[base.length - 1], lb = alt[alt.length - 1];
  const delta = Object.fromEntries(Object.keys(la).map((k) => [k, lb[k as keyof ForecastPoint] - la[k as keyof ForecastPoint]])) as unknown as ForecastPoint;
  delta.gdp = (lb.gdp / la.gdp - 1) * 100;
  return { months, base, alt, delta };
}
