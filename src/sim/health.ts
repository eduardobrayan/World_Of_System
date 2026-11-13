/** Métricas de salud del mundo (para el script de simulación y los tests). */
import type { World } from './types';

export interface HealthReport {
  turn: number;
  worldGdp: number;
  worldGrowth: number;
  worldInflation: number;
  oil: number;
  tension: number;
  wars: number;
  treaties: number;
  sanctions: number;
  avgStability: number;
  avgApproval: number;
  nan: number;
  dead: number;
  govChanges: number;
  extremes: string[];
  problems: string[];
}

function countNaN(obj: unknown, depth = 0): number {
  if (depth > 6) return 0;
  if (typeof obj === 'number') return Number.isFinite(obj) ? 0 : 1;
  if (Array.isArray(obj)) return obj.reduce((a: number, x) => a + countNaN(x, depth + 1), 0);
  if (obj && typeof obj === 'object') {
    let s = 0;
    for (const v of Object.values(obj)) s += countNaN(v, depth + 1);
    return s;
  }
  return 0;
}

export function worldHealth(world: World): HealthReport {
  const alive = world.order.map((id) => world.countries[id]).filter((c) => c.alive);
  let gdp = 0, stab = 0, appr = 0;
  for (const c of alive) { gdp += c.eco.gdp; stab += c.pol.stability; appr += c.pol.approval; }
  let nan = 0;
  for (const c of alive) nan += countNaN(c.eco) + countNaN(c.soc) + countNaN(c.pol) + countNaN(c.mil) + countNaN(c.groups);
  nan += countNaN(world.market.price) + countNaN(world.global);

  const by = <T>(f: (c: (typeof alive)[number]) => number, desc = true) => [...alive].sort((a, b) => (desc ? f(b) - f(a) : f(a) - f(b)))[0];
  const hiInfl = by((c) => c.eco.inflation);
  const loGrowth = by((c) => c.eco.growth, false);
  const hiGrowth = by((c) => c.eco.growth);
  const hiDebt = by((c) => c.eco.debt / c.eco.gdp);
  const loStab = by((c) => c.pol.stability, false);
  const hiUnemp = by((c) => c.eco.unemployment);
  const extremes = [
    `Inflación máx.: ${hiInfl.name} ${hiInfl.eco.inflation.toFixed(1)} %`,
    `Crecimiento mín./máx.: ${loGrowth.name} ${loGrowth.eco.growth.toFixed(1)} % · ${hiGrowth.name} ${hiGrowth.eco.growth.toFixed(1)} %`,
    `Deuda máx.: ${hiDebt.name} ${((hiDebt.eco.debt / hiDebt.eco.gdp) * 100).toFixed(0)} % del PIB`,
    `Paro máx.: ${hiUnemp.name} ${hiUnemp.eco.unemployment.toFixed(1)} %`,
    `Estabilidad mín.: ${loStab.name} ${loStab.pol.stability.toFixed(0)}`,
  ];

  const govChanges = world.timeline.filter((t) => t.kind === 'gobierno').length + world.news.filter((n) => n.type === 'gobierno').length;
  const problems: string[] = [];
  if (nan > 0) problems.push(`${nan} valores no finitos (NaN/Infinity)`);
  const dead = world.order.length - alive.length;
  if (dead > world.order.length * 0.25) problems.push(`${dead} países han desaparecido`);
  const first = world.worldHistory[0];
  const last = world.worldHistory[world.worldHistory.length - 1];
  if (first && last && last.t - first.t >= 60) {
    const years = (last.t - first.t) / 12;
    const cagr = (Math.pow(last.gdp / first.gdp, 1 / years) - 1) * 100;
    if (cagr < 0.3) problems.push(`El PIB mundial crece demasiado poco (${cagr.toFixed(2)} %/año)`);
    if (cagr > 6.5) problems.push(`El PIB mundial crece demasiado (${cagr.toFixed(2)} %/año)`);
    const oils = world.worldHistory.map((h) => h.oil);
    const oilRange = Math.max(...oils) / Math.min(...oils);
    if (oilRange < 1.03) problems.push('El precio del petróleo no se mueve (mundo estático)');
  }
  const crazy = alive.filter((c) => c.eco.inflation > 400 && c.eco.hyperMonths > 24);
  if (crazy.length > 2) problems.push(`Hiperinflación crónica en ${crazy.map((c) => c.short).join(', ')}`);
  const avgStab = stab / alive.length;
  if (avgStab < 22) problems.push(`Estabilidad media muy baja (${avgStab.toFixed(1)})`);
  if (avgStab > 92) problems.push(`Estabilidad media irrealmente alta (${avgStab.toFixed(1)})`);
  const collapsed = alive.filter((c) => c.eco.gdp < c.base.gdp * 0.35);
  if (collapsed.length > 3) problems.push(`Colapso económico en ${collapsed.map((c) => c.short).join(', ')}`);

  return {
    turn: world.turn, worldGdp: gdp, worldGrowth: world.global.worldGrowth, worldInflation: world.global.worldInflation,
    oil: world.market.price.oil, tension: world.global.tension, wars: world.wars.length, treaties: world.treaties.length,
    sanctions: world.sanctions.length, avgStability: avgStab, avgApproval: appr / alive.length, nan, dead, govChanges, extremes, problems,
  };
}
