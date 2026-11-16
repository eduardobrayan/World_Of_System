/** Puntos de anclaje en el mapa para los efectos: capital, centro y costa más cercana de cada país. */
import type { Country, World } from '../../sim/types';
import { labelPoint, regionSeed, type Pt } from '../geo';

const capCache = new Map<string, Pt>();

export function capitalPt(w: World, id: string): Pt {
  const hit = capCache.get(id);
  if (hit) return hit;
  const c = w.countries[id];
  let p: Pt = labelPoint(id);
  if (c && !c.isBlock) {
    const r = c.regions.find((x) => x.capital && x.id.startsWith(c.id));
    if (r) p = regionSeed(r);
  }
  capCache.set(id, p);
  return p;
}

export function centerPt(id: string): Pt { return labelPoint(id); }

/** Región costera de `c` más cercana a `toward` (para barcos); si no hay costa, su capital. */
export function coastPt(w: World, c: Country, toward: Pt): Pt {
  let best: Pt | null = null, bd = Infinity;
  for (const r of c.regions) {
    if (!r.coastal || r.owner !== c.id) continue;
    const s = regionSeed(r);
    const d = (s[0] - toward[0]) ** 2 + (s[1] - toward[1]) ** 2;
    if (d < bd) { bd = d; best = s; }
  }
  return best ?? capitalPt(w, c.id);
}

/** Desplaza un punto un poco al azar (para que varios efectos sobre el mismo país no se tapen). */
export function jitter(p: Pt, r = 1.5): Pt {
  return [p[0] + (Math.random() - 0.5) * 2 * r, p[1] + (Math.random() - 0.5) * 2 * r];
}
