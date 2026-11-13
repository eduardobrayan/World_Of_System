/** Variables globales: crecimiento e inflación mundiales, tensión internacional y clima. */
import type { World } from './types';
import { approach, clamp, news } from './util';
import { rngOf } from './util';
import { addShock, modSum, tradeShare, neighborsLand } from './vars';

export function updateGlobals(world: World) {
  const g = world.global;
  let gdp = 0, gw = 0, iw = 0, rw = 0, emis = 0, big = 0;
  for (const id of world.order) {
    const c = world.countries[id];
    if (!c.alive) continue;
    gdp += c.eco.gdp;
    gw += c.eco.gdp * c.eco.growth;
    iw += c.eco.gdp * clamp(c.eco.inflation, -2, 30);
    if (c.eco.gdp > 1000) { rw += c.eco.gdp * clamp(c.eco.policyRate - c.eco.inflation, -5, 8); big += c.eco.gdp; }
    emis += c.eco.gdp * (1 - c.tech.renewables / 100) * (1 + c.eco.sectors.industry / 100);
  }
  g.worldGrowth = gw / gdp;
  g.worldInflation = iw / gdp;
  g.worldRealRate = big > 0 ? rw / big : 1;
  if (!g.emissions) g.emissions = emis;
  // +0.025 ºC/año con las emisiones de 2026; proporcional a las emisiones actuales
  g.temperature += (0.025 / 12) * (emis / g.emissions);

  let warHeat = 0;
  for (const w of world.wars) warHeat += w.ceasefire > 0 ? 2 : 6 + w.nuclear * 12;
  let nuclear = 0;
  for (const id of world.order) nuclear = Math.max(nuclear, world.countries[id].mil.nuclearPosture);
  const sanc = world.sanctions.filter((s) => s.level >= 2).length;
  const target = clamp(28 + warHeat + sanc * 0.3 + nuclear * 10, 0, 100);
  g.tension = clamp(approach(g.tension, target, 0.05), 0, 100);
}

const PATHOGENS = ['coronavirus H-27', 'gripe aviar H5N4', 'fiebre hemorrágica Kivu', 'virus respiratorio Nipah-B', 'paramixovirus X-29'];

/** Pandemias: aparición, propagación por comercio y fronteras, efectos y final por inmunidad o vacunas. */
export function updatePandemic(world: World) {
  if (world.forecast) return;
  const g = world.global;
  const rng = rngOf(world);
  if (!g.pandemic) {
    const p = 0.0016 * (1 + (g.temperature - 1.45) * 2);
    if (rng.next() < p) {
      const weights = world.order.map((id) => { const c = world.countries[id]; return c.alive ? c.soc.pop * (110 - c.soc.health) : 0; });
      const origin = world.order[rng.weighted(weights)];
      const name = PATHOGENS[rng.int(0, PATHOGENS.length - 1)];
      g.pandemic = { name, severity: 0.4 + rng.next() * 0.6, infected: { [origin]: 0.04 }, months: 0, vaccine: 0 };
      news(world, `🦠 Brote de ${name} en ${world.countries[origin].name}. La OMS declara una emergencia sanitaria internacional.`, 'salud', [origin], 3);
    }
    world.rng = rng.state;
    return;
  }
  const pd = g.pandemic;
  pd.months += 1;
  const next: Record<string, number> = { ...pd.infected };
  for (const [id, inf] of Object.entries(pd.infected)) {
    if (inf < 0.004) continue;
    const links = [...neighborsLand(id), ...world.order.filter((x) => x !== id && tradeShare(world, id, x) > 0.03)];
    for (const j of links) {
      const cj = world.countries[j];
      if (!cj?.alive) continue;
      const resist = clamp(1 + modSum(cj, 'pandemicResist') * -1 + modSum(cj, 'pandemicSpread'), 0.2, 2);
      // Con vacunas y medidas de contención, el contagio entre países se frena
      const contained = pd.months > 18 ? 0.2 : pd.months > 12 ? 0.5 : 1;
      next[j] = clamp((next[j] ?? 0) + inf * 0.12 * pd.severity * resist * contained, 0, 0.6);
    }
  }
  let maxInf = 0;
  for (const [id, inf0] of Object.entries(next)) {
    const c = world.countries[id];
    if (!c?.alive) { delete next[id]; continue; }
    const vaccinated = pd.months > (c.tech.done.includes('vacunas_arnm') ? 9 : 18);
    const resist = clamp(1 + modSum(c, 'pandemicSpread') - modSum(c, 'pandemicResist'), 0.2, 2);
    const growth = vaccinated ? 0.7 : pd.months > 14 ? 0.85 : 1 + 0.45 * pd.severity * resist * (1 - inf0 * 2.5);
    const inf = clamp(inf0 * growth, 0, 0.6);
    next[id] = inf;
    maxInf = Math.max(maxInf, inf);
    const healthF = 1.6 - c.soc.health / 100;
    addShock(c, 'growth', `Pandemia (${pd.name})`, -inf * 9 * pd.severity);
    addShock(c, 'death', 'Pandemia', inf * 6 * pd.severity * healthF);
    addShock(c, 'protest', 'Pandemia', inf * 15);
  }
  pd.infected = next;
  if ((maxInf < 0.003 && pd.months > 6) || pd.months > 60) {
    news(world, `🦠 La OMS da por terminada la pandemia de ${pd.name}.`, 'salud', [], 3);
    g.pandemic = null;
  }
  world.rng = rng.state;
}
