/** Geometría del mapa: proyección de Miller, polígonos por territorio, Voronoi regional y pruebas de pertenencia. */
import worldJson from '../data/geo/world.json';
import { DATA } from '../sim/data';
import type { Region } from '../sim/types';

const RAD = Math.PI / 180;
export const millerY = (lat: number) => (1.25 * Math.log(Math.tan(Math.PI / 4 + 0.4 * clampLat(lat) * RAD))) / RAD;
export const invMillerY = (y: number) => (2.5 * Math.atan(Math.exp(0.8 * y * RAD)) - 0.625 * Math.PI) / RAD;
function clampLat(l: number) { return Math.max(-85, Math.min(85, l)); }

export type Pt = [number, number];
export interface BBox { x0: number; y0: number; x1: number; y1: number }

export interface GeoFeature {
  name: string;
  entity: string;
  polys: Pt[][][]; // polígonos → anillos (proyectados), incluye copias desplazadas ±360
  bbox: BBox;
  area: number;
  centroid: Pt;
  path?: Path2D;
}

function ringArea(r: Pt[]): number {
  let a = 0;
  for (let i = 0; i < r.length - 1; i++) a += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
  return a / 2;
}

function ringCentroid(r: Pt[]): Pt {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0; i < r.length - 1; i++) {
    const c = r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1];
    a += c; cx += (r[i][0] + r[i + 1][0]) * c; cy += (r[i][1] + r[i + 1][1]) * c;
  }
  if (Math.abs(a) < 1e-9) return r[0];
  return [cx / (3 * a), cy / (3 * a)];
}

const raw = worldJson as unknown as { features: { name: string; entity: string; polys: Pt[][][] }[] };

export const FEATURES: GeoFeature[] = raw.features.map((f) => {
  const polys: Pt[][][] = [];
  let bbox: BBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  let best = 0, centroid: Pt = [0, 0], area = 0;
  for (const poly of f.polys) {
    const proj = poly.map((ring) => ring.map(([x, y]) => [x, millerY(y)] as Pt));
    const variants: Pt[][][] = [proj];
    const xs = proj[0].map((p) => p[0]);
    if (Math.max(...xs) > 180) variants.push(proj.map((r) => r.map(([x, y]) => [x - 360, y] as Pt)));
    if (Math.min(...xs) < -180) variants.push(proj.map((r) => r.map(([x, y]) => [x + 360, y] as Pt)));
    for (const v of variants) polys.push(v);
    const a = Math.abs(ringArea(proj[0]));
    area += a;
    if (a > best) { best = a; centroid = ringCentroid(proj[0]); }
    for (const v of variants) for (const [x, y] of v[0]) {
      bbox = { x0: Math.min(bbox.x0, x), y0: Math.min(bbox.y0, y), x1: Math.max(bbox.x1, x), y1: Math.max(bbox.y1, y) };
    }
  }
  return { name: f.name, entity: f.entity, polys, bbox, area, centroid };
});

export const BY_ENTITY: Record<string, GeoFeature[]> = {};
for (const f of FEATURES) (BY_ENTITY[f.entity] ??= []).push(f);
export const BY_NAME: Record<string, GeoFeature> = Object.fromEntries(FEATURES.map((f) => [f.name, f]));

export function featurePath(f: GeoFeature): Path2D {
  if (!f.path) {
    const p = new Path2D();
    for (const poly of f.polys) for (const ring of poly) {
      p.moveTo(ring[0][0], ring[0][1]);
      for (let i = 1; i < ring.length; i++) p.lineTo(ring[i][0], ring[i][1]);
      p.closePath();
    }
    f.path = p;
  }
  return f.path;
}

function pointInRing(x: number, y: number, r: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const [xi, yi] = r[i], [xj, yj] = r[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function pointInFeature(f: GeoFeature, x: number, y: number): boolean {
  for (const poly of f.polys) {
    if (!pointInRing(x, y, poly[0])) continue;
    let hole = false;
    for (let k = 1; k < poly.length; k++) if (pointInRing(x, y, poly[k])) { hole = true; break; }
    if (!hole) return true;
  }
  return false;
}

export function hitFeature(x: number, y: number): GeoFeature | null {
  for (const f of FEATURES) {
    const b = f.bbox;
    if (x < b.x0 || x > b.x1 || y < b.y0 || y > b.y1) continue;
    if (pointInFeature(f, x, y)) return f;
  }
  return null;
}

/** Punto para la etiqueta de una entidad. */
export function labelPoint(id: string): Pt {
  const block = DATA.blocks.find((b) => b.id === id);
  if (block?.label) return [block.label[0], millerY(block.label[1])];
  const feats = BY_ENTITY[id] ?? [];
  let best: GeoFeature | null = null;
  for (const f of feats) if (!best || f.area > best.area) best = f;
  return best ? best.centroid : [0, 0];
}

export function entityArea(id: string): number {
  return (BY_ENTITY[id] ?? []).reduce((a, f) => a + f.area, 0);
}

// ---------- Marco local (polígonos cercanos al territorio principal) ----------

export interface LocalFrame { features: GeoFeature[]; bbox: BBox; main: Pt }

const frameCache: Record<string, LocalFrame> = {};

export function localFrame(id: string): LocalFrame {
  if (frameCache[id]) return frameCache[id];
  const feats = BY_ENTITY[id] ?? [];
  const main = labelPoint(id);
  const block = DATA.blocks.find((b) => b.id === id);
  let bbox: BBox = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
  const near: GeoFeature[] = [];
  for (const f of feats) {
    for (const poly of f.polys) {
      const c = ringCentroid(poly[0]);
      const d = Math.hypot(c[0] - main[0], c[1] - main[1]);
      if (d > (block ? 75 : 60)) continue;
      for (const [x, y] of poly[0]) bbox = { x0: Math.min(bbox.x0, x), y0: Math.min(bbox.y0, y), x1: Math.max(bbox.x1, x), y1: Math.max(bbox.y1, y) };
    }
    near.push(f);
  }
  if (!Number.isFinite(bbox.x0)) bbox = { x0: main[0] - 5, y0: main[1] - 5, x1: main[0] + 5, y1: main[1] + 5 };
  frameCache[id] = { features: near, bbox, main };
  return frameCache[id];
}

// ---------- Voronoi regional ----------

function clipHalfPlane(poly: Pt[], a: Pt, b: Pt): Pt[] {
  // Conserva los puntos más cerca de a que de b
  const mx = (a[0] + b[0]) / 2, my = (a[1] + b[1]) / 2;
  const nx = b[0] - a[0], ny = b[1] - a[1];
  const side = (p: Pt) => (p[0] - mx) * nx + (p[1] - my) * ny;
  const out: Pt[] = [];
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i], q = poly[(i + 1) % poly.length];
    const sp = side(p), sq = side(q);
    if (sp <= 0) out.push(p);
    if ((sp <= 0) !== (sq <= 0)) {
      const t = sp / (sp - sq);
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]);
    }
  }
  return out;
}

export function regionSeed(r: Region): Pt {
  return [r.lon, millerY(r.lat)];
}

const cellCache: Record<string, Pt[][]> = {};

/** Celdas Voronoi (convexas) de las regiones de una entidad, dentro de su caja local ampliada. */
export function regionCells(entity: string, regions: Region[]): Pt[][] {
  const key = entity + ':' + regions.length;
  if (cellCache[key]) return cellCache[key];
  const fr = localFrame(entity);
  const pad = 40;
  const box: Pt[] = [[fr.bbox.x0 - pad, fr.bbox.y0 - pad], [fr.bbox.x1 + pad, fr.bbox.y0 - pad], [fr.bbox.x1 + pad, fr.bbox.y1 + pad], [fr.bbox.x0 - pad, fr.bbox.y1 + pad]];
  const seeds = regions.map(regionSeed);
  const cells = seeds.map((s, i) => {
    let poly = box.slice();
    for (let j = 0; j < seeds.length; j++) if (j !== i) poly = clipHalfPlane(poly, s, seeds[j]);
    return poly;
  });
  cellCache[key] = cells;
  return cells;
}

/** Región de una entidad que contiene el punto (x, y), o -1. */
export function hitRegion(entity: string, regions: Region[], isBlock: boolean, x: number, y: number): number {
  if (isBlock) {
    return regions.findIndex((r) => r.geoName && BY_NAME[r.geoName] && pointInFeature(BY_NAME[r.geoName], x, y));
  }
  const inside = (BY_ENTITY[entity] ?? []).some((f) => pointInFeature(f, x, y));
  if (!inside) return -1;
  let best = -1, bd = Infinity;
  regions.forEach((r, i) => {
    const s = regionSeed(r);
    const d = (s[0] - x) ** 2 + (s[1] - y) ** 2;
    if (d < bd) { bd = d; best = i; }
  });
  return best;
}

export function cellPath(cell: Pt[]): Path2D {
  const p = new Path2D();
  p.moveTo(cell[0][0], cell[0][1]);
  for (let i = 1; i < cell.length; i++) p.lineTo(cell[i][0], cell[i][1]);
  p.closePath();
  return p;
}

export function entityPath(entity: string): Path2D {
  const p = new Path2D();
  for (const f of BY_ENTITY[entity] ?? []) p.addPath(featurePath(f));
  return p;
}

let landCache: Path2D | null = null;
/** Todas las tierras emergidas en un único trazo (para el resplandor de las costas y el sombreado). */
export function landPath(): Path2D {
  if (!landCache) {
    landCache = new Path2D();
    for (const f of FEATURES) landCache.addPath(featurePath(f));
  }
  return landCache;
}
