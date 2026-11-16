/** Los seis medidores 0–100 del panel de mando (100 = muy bien). Reglas sencillas y explicables. */
import type { Country, World } from './types';
import { relOp } from './vars';
import { clamp } from './util';

export interface GaugeValues {
  economia: number; felicidad: number; estabilidad: number; seguridad: number; militar: number; relaciones: number;
  /** Puesto militar mundial (1 = el más fuerte) y opinión media ponderada del mundo. */
  rank: number; relAvg: number;
}

export function gaugeValues(world: World, c: Country): GaugeValues {
  const e = c.eco;
  const economia = clamp(55 + e.growth * 9 - Math.max(0, e.inflation - 3) * 3 - Math.max(0, e.unemployment - 6) * 2.5 - Math.max(0, e.deficit - 4) * 2, 0, 100);
  const others = world.order.map((id) => world.countries[id]).filter((x) => x.alive && x.id !== c.id);
  const rank = 1 + others.filter((x) => x.mil.power > c.mil.power).length;
  const maxP = Math.max(c.mil.power, ...others.map((x) => x.mil.power)) || 1;
  let rel = 0, wsum = 0;
  for (const x of others) { const wt = Math.sqrt(x.eco.gdp); rel += relOp(world, x.id, c.id) * wt; wsum += wt; }
  const relAvg = wsum ? rel / wsum : 0;
  return {
    economia,
    felicidad: clamp(c.soc.satisfaction - c.soc.pressure * 0.5, 0, 100),
    estabilidad: clamp(c.pol.stability, 0, 100),
    seguridad: clamp(100 - c.police.crime * 1.2, 0, 100),
    militar: clamp(Math.sqrt(c.mil.power / maxP) * 100, 0, 100),
    relaciones: clamp(50 + relAvg * 0.8, 0, 100),
    rank, relAvg,
  };
}
