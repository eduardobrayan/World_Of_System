/** Historial de variables para gráficas. */
import type { Country, World } from './types';
import { round } from './util';

export function snapshot(world: World, c: Country, force = false) {
  const isPlayer = world.player?.country === c.id;
  if (!force && !isPlayer && world.turn % 3 !== 0) return;
  c.history.push({
    t: world.turn,
    gdp: round(c.eco.gdp, 1),
    growth: round(c.eco.growth, 2),
    inflation: round(c.eco.inflation, 2),
    unemployment: round(c.eco.unemployment, 2),
    debt: round((c.eco.debt / c.eco.gdp) * 100, 1),
    deficit: round(c.eco.deficit, 2),
    approval: round(c.pol.approval, 1),
    stability: round(c.pol.stability, 1),
    power: round(c.mil.power, 0),
    pop: round(c.soc.pop, 2),
    protest: round(c.soc.protest, 1),
    reserves: round(c.eco.reserves, 0),
    currency: round(c.eco.currency, 1),
  });
  if (c.history.length > 1200) c.history.shift();
}

export function worldSnapshot(world: World) {
  let gdp = 0;
  for (const id of world.order) if (world.countries[id].alive) gdp += world.countries[id].eco.gdp;
  world.worldHistory.push({
    t: world.turn, gdp: round(gdp, 0), oil: round(world.market.price.oil, 1), tension: round(world.global.tension, 1),
    temp: round(world.global.temperature, 3), wars: world.wars.length,
  });
}
