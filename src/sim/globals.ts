/** Variables globales: crecimiento e inflación mundiales, tensión internacional y clima. */
import type { World } from './types';
import { approach, clamp } from './util';

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
