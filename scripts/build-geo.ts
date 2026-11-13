/**
 * Genera los datos geográficos del juego a partir de Natural Earth 110m (paquete world-atlas).
 *
 *  - src/data/geo/world.json      → polígonos simplificados por territorio (para la interfaz)
 *  - src/data/geo/adjacency.json  → grafo de vecindad terrestre y marítima por entidad (para la simulación)
 *
 * Uso: npm run geo
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { feature, neighbors } from 'topojson-client';
import type { Topology, GeometryCollection } from 'topojson-specification';

const topo = JSON.parse(
  readFileSync(new URL('../node_modules/world-atlas/countries-110m.json', import.meta.url), 'utf8'),
) as Topology;

/** Asignación de cada territorio de Natural Earth a una entidad del juego (país jugable o bloque regional). */
const ENTITY_BY_NAME: Record<string, string | null> = {
  // Países principales
  'United States of America': 'USA', 'Puerto Rico': 'USA', Canada: 'CAN', Mexico: 'MEX', Brazil: 'BRA',
  Argentina: 'ARG', Colombia: 'COL', Venezuela: 'VEN', Chile: 'CHL', 'United Kingdom': 'GBR',
  'Falkland Is.': 'GBR', France: 'FRA', 'New Caledonia': 'FRA', 'Fr. S. Antarctic Lands': 'FRA',
  Germany: 'DEU', Italy: 'ITA', Spain: 'ESP', Netherlands: 'NLD', Poland: 'POL', Sweden: 'SWE',
  Norway: 'NOR', Ukraine: 'UKR', Belarus: 'BLR', Russia: 'RUS', Turkey: 'TUR', Israel: 'ISR',
  Iran: 'IRN', Iraq: 'IRQ', 'Saudi Arabia': 'SAU', 'United Arab Emirates': 'ARE', Egypt: 'EGY',
  Nigeria: 'NGA', Ethiopia: 'ETH', 'South Africa': 'ZAF', Algeria: 'DZA', Pakistan: 'PAK', India: 'IND',
  China: 'CHN', Japan: 'JPN', 'South Korea': 'KOR', 'North Korea': 'PRK', Taiwan: 'TWN',
  Indonesia: 'IDN', Vietnam: 'VNM', Philippines: 'PHL', Australia: 'AUS', Kazakhstan: 'KAZ',
  // Bloques regionales
  Portugal: 'B_EUO', Ireland: 'B_EUO', Belgium: 'B_EUO', Luxembourg: 'B_EUO', Switzerland: 'B_EUO',
  Austria: 'B_EUO', Denmark: 'B_EUO', Finland: 'B_EUO', Iceland: 'B_EUO', Greenland: 'B_EUO',
  Czechia: 'B_EUC', Slovakia: 'B_EUC', Hungary: 'B_EUC', Romania: 'B_EUC', Bulgaria: 'B_EUC',
  Lithuania: 'B_EUC', Latvia: 'B_EUC', Estonia: 'B_EUC', Slovenia: 'B_EUC', Croatia: 'B_EUC', Moldova: 'B_EUC',
  Serbia: 'B_BAL', 'Bosnia and Herz.': 'B_BAL', Montenegro: 'B_BAL', Kosovo: 'B_BAL', Macedonia: 'B_BAL',
  Albania: 'B_BAL', Greece: 'B_BAL', Cyprus: 'B_BAL', 'N. Cyprus': 'B_BAL',
  Georgia: 'B_CAU', Armenia: 'B_CAU', Azerbaijan: 'B_CAU',
  Uzbekistan: 'B_ASC', Turkmenistan: 'B_ASC', Kyrgyzstan: 'B_ASC', Tajikistan: 'B_ASC',
  Afghanistan: 'B_ASC', Mongolia: 'B_ASC',
  Syria: 'B_LEV', Lebanon: 'B_LEV', Jordan: 'B_LEV', Palestine: 'B_LEV',
  Kuwait: 'B_GOL', Qatar: 'B_GOL', Oman: 'B_GOL', Yemen: 'B_GOL',
  Morocco: 'B_MAG', 'W. Sahara': 'B_MAG', Tunisia: 'B_MAG', Libya: 'B_MAG', Mauritania: 'B_MAG',
  Senegal: 'B_AFO', Gambia: 'B_AFO', 'Guinea-Bissau': 'B_AFO', Guinea: 'B_AFO', 'Sierra Leone': 'B_AFO',
  Liberia: 'B_AFO', "Côte d'Ivoire": 'B_AFO', Ghana: 'B_AFO', Togo: 'B_AFO', Benin: 'B_AFO',
  'Burkina Faso': 'B_AFO', Mali: 'B_AFO', Niger: 'B_AFO',
  Cameroon: 'B_AFC', Chad: 'B_AFC', 'Central African Rep.': 'B_AFC', Gabon: 'B_AFC', Congo: 'B_AFC',
  'Eq. Guinea': 'B_AFC', 'Dem. Rep. Congo': 'B_AFC',
  Sudan: 'B_AFE', 'S. Sudan': 'B_AFE', Eritrea: 'B_AFE', Djibouti: 'B_AFE', Somalia: 'B_AFE',
  Somaliland: 'B_AFE', Kenya: 'B_AFE', Uganda: 'B_AFE', Rwanda: 'B_AFE', Burundi: 'B_AFE', Tanzania: 'B_AFE',
  Angola: 'B_AFS', Zambia: 'B_AFS', Malawi: 'B_AFS', Mozambique: 'B_AFS', Zimbabwe: 'B_AFS',
  Botswana: 'B_AFS', Namibia: 'B_AFS', Lesotho: 'B_AFS', eSwatini: 'B_AFS', Madagascar: 'B_AFS',
  Bangladesh: 'B_ASS', Nepal: 'B_ASS', Bhutan: 'B_ASS', 'Sri Lanka': 'B_ASS',
  Thailand: 'B_SEA', Myanmar: 'B_SEA', Laos: 'B_SEA', Cambodia: 'B_SEA', Malaysia: 'B_SEA',
  Brunei: 'B_SEA', 'Timor-Leste': 'B_SEA',
  'New Zealand': 'B_OCE', 'Papua New Guinea': 'B_OCE', Fiji: 'B_OCE', 'Solomon Is.': 'B_OCE', Vanuatu: 'B_OCE',
  Guatemala: 'B_CAM', Belize: 'B_CAM', Honduras: 'B_CAM', 'El Salvador': 'B_CAM', Nicaragua: 'B_CAM',
  'Costa Rica': 'B_CAM', Panama: 'B_CAM', Cuba: 'B_CAM', Haiti: 'B_CAM', 'Dominican Rep.': 'B_CAM',
  Jamaica: 'B_CAM', Bahamas: 'B_CAM', 'Trinidad and Tobago': 'B_CAM',
  Peru: 'B_SAM', Ecuador: 'B_SAM', Bolivia: 'B_SAM', Paraguay: 'B_SAM', Uruguay: 'B_SAM',
  Guyana: 'B_SAM', Suriname: 'B_SAM',
  Antarctica: null,
};

type Ring = [number, number][];
const r2 = (v: number) => Math.round(v * 100) / 100;

const coll = topo.objects.countries as GeometryCollection<{ name: string }>;
const fc = feature(topo, coll) as unknown as GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { name: string }>;
const neigh = neighbors(coll.geometries as never);

interface OutFeature { name: string; entity: string; polys: Ring[][] }
const features: OutFeature[] = [];
const featureEntity: (string | null)[] = [];

fc.features.forEach((f) => {
  const name = f.properties.name;
  if (!(name in ENTITY_BY_NAME)) throw new Error(`Territorio sin asignar: ${name}`);
  const entity = ENTITY_BY_NAME[name];
  featureEntity.push(entity);
  if (!entity) return;
  const polys: number[][][][] = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const out: Ring[][] = polys.map((poly) =>
    poly.map((ring) => {
      const res: Ring = [];
      let shift = 0;
      let prevX: number | null = null;
      for (const [x0, y] of ring) {
        // Desenrollar el antimeridiano: anillos continuos (lon puede superar 180)
        if (prevX !== null) {
          const d = x0 + shift - prevX;
          if (d > 180) shift -= 360;
          else if (d < -180) shift += 360;
        }
        const x = x0 + shift;
        prevX = x;
        const p: [number, number] = [r2(x), r2(y)];
        const last = res[res.length - 1];
        if (!last || last[0] !== p[0] || last[1] !== p[1]) res.push(p);
      }
      return res;
    }).filter((ring) => ring.length >= 4),
  ).filter((p) => p.length > 0);
  features.push({ name, entity, polys: out });
});

// --- Vecindad terrestre (fronteras compartidas) ---
const land: Record<string, Set<string>> = {};
const add = (m: Record<string, Set<string>>, a: string, b: string) => {
  if (a === b) return;
  (m[a] ??= new Set()).add(b);
  (m[b] ??= new Set()).add(a);
};
neigh.forEach((list, i) => {
  const a = featureEntity[i];
  if (!a) return;
  for (const j of list) {
    const b = featureEntity[j];
    if (b) add(land, a, b);
  }
});

// --- Costa: arcos usados por una sola geometría ---
const arcUse = new Map<number, number>();
const walkArcs = (arcs: unknown, cb: (a: number) => void) => {
  if (typeof arcs === 'number') cb(arcs < 0 ? ~arcs : arcs);
  else if (Array.isArray(arcs)) arcs.forEach((x) => walkArcs(x, cb));
};
coll.geometries.forEach((g) => walkArcs((g as { arcs?: unknown }).arcs, (a) => arcUse.set(a, (arcUse.get(a) ?? 0) + 1)));
const coastal: Record<string, number> = {};
coll.geometries.forEach((g, i) => {
  const e = featureEntity[i];
  if (!e) return;
  walkArcs((g as { arcs?: unknown }).arcs, (a) => {
    if (arcUse.get(a) === 1) coastal[e] = (coastal[e] ?? 0) + 1;
  });
});

// --- Vecindad marítima: costas a menos de ~550 km sin frontera terrestre ---
// Puntos de costa: vértices que no comparte ningún otro territorio de otra entidad.
const pointOwners = new Map<string, Set<string>>();
for (const f of features) {
  for (const poly of f.polys) for (const ring of poly) for (const p of ring) {
    const k = p[0] + ',' + p[1];
    let s = pointOwners.get(k);
    if (!s) pointOwners.set(k, (s = new Set()));
    s.add(f.name);
  }
}
const samples: Record<string, [number, number][]> = {};
for (const f of features) {
  const s = (samples[f.entity] ??= []);
  for (const poly of f.polys) for (const ring of poly) for (const p of ring) {
    if ((pointOwners.get(p[0] + ',' + p[1])?.size ?? 0) <= 1) s.push(p);
  }
}
const dist = (a: [number, number], b: [number, number]) => {
  const lat = ((a[1] + b[1]) / 2) * (Math.PI / 180);
  let dx = Math.abs(a[0] - b[0]);
  if (dx > 180) dx = 360 - dx;
  return Math.hypot(dx * Math.cos(lat), a[1] - b[1]) * 111;
};
const sea: Record<string, Set<string>> = {};
const ents = Object.keys(samples).sort();
for (let i = 0; i < ents.length; i++) {
  for (let j = i + 1; j < ents.length; j++) {
    const a = ents[i], b = ents[j];
    if (land[a]?.has(b)) continue;
    if (!coastal[a] || !coastal[b]) continue;
    let best = Infinity;
    const sa = samples[a], sb = samples[b];
    for (const p of sa) {
      for (const q of sb) {
        const d = dist(p, q);
        if (d < best) best = d;
      }
      if (best < 600) break;
    }
    if (best < 600) add(sea, a, b);
  }
}
// Enlaces marítimos relevantes que la resolución 110m no capta (mares estrechos de islas pequeñas).
const MANUAL_SEA: [string, string][] = [['JPN', 'CHN'], ['JPN', 'TWN'], ['CHN', 'PHL'], ['VNM', 'PHL'], ['VNM', 'IDN'], ['GBR', 'ESP'], ['NGA', 'B_AFC']];
for (const [a, b] of MANUAL_SEA) if (!land[a]?.has(b)) add(sea, a, b);

// --- Centroide aproximado (del mayor polígono) y caja ---
const meta: Record<string, { centroid: [number, number]; bbox: [number, number, number, number]; area: number }> = {};
for (const f of features) {
  for (const poly of f.polys) {
    const ring = poly[0];
    let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < ring.length - 1; k++) {
      const [x0, y0] = ring[k], [x1, y1] = ring[k + 1];
      const c = x0 * y1 - x1 * y0;
      A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    A /= 2;
    const area = Math.abs(A) * Math.cos(((cy / (6 * A || 1)) * Math.PI) / 180);
    const m = (meta[f.entity] ??= { centroid: [0, 0], bbox: [180, 90, -180, -90], area: 0 });
    if (A !== 0 && area > m.area) {
      m.area = area;
      m.centroid = [r2(cx / (6 * A)), r2(cy / (6 * A))];
    }
    for (const [x, y] of ring) {
      m.bbox = [Math.min(m.bbox[0], x), Math.min(m.bbox[1], y), Math.max(m.bbox[2], x), Math.max(m.bbox[3], y)];
    }
  }
}

// Centroide de cada territorio (para regiones de los bloques)
const featureCentroids: Record<string, [number, number]> = {};
for (const f of features) {
  let best = 0;
  for (const poly of f.polys) {
    const ring = poly[0];
    let A = 0, cx = 0, cy = 0;
    for (let k = 0; k < ring.length - 1; k++) {
      const [x0, y0] = ring[k], [x1, y1] = ring[k + 1];
      const c = x0 * y1 - x1 * y0;
      A += c; cx += (x0 + x1) * c; cy += (y0 + y1) * c;
    }
    if (Math.abs(A) > best && A !== 0) {
      best = Math.abs(A);
      featureCentroids[f.name] = [r2(cx / (3 * A)), r2(cy / (3 * A))];
    }
  }
}

const adjacency: Record<string, { land: string[]; sea: string[]; coastal: boolean; centroid: [number, number]; bbox: [number, number, number, number] }> = {};
for (const e of ents) {
  adjacency[e] = {
    land: [...(land[e] ?? [])].sort(),
    sea: [...(sea[e] ?? [])].sort(),
    coastal: (coastal[e] ?? 0) > 0,
    centroid: meta[e].centroid,
    bbox: meta[e].bbox,
  };
}

writeFileSync(new URL('../src/data/geo/world.json', import.meta.url), JSON.stringify({ features }));
writeFileSync(new URL('../src/data/geo/adjacency.json', import.meta.url), JSON.stringify({ entities: adjacency, features: featureCentroids }, null, 1));
console.log(`Territorios: ${features.length}, entidades: ${ents.length}`);
for (const e of ents) console.log(e.padEnd(6), 'tierra:', adjacency[e].land.join(','), '| mar:', adjacency[e].sea.join(','));
