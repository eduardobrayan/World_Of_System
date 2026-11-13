/** Resolución de variables para el lenguaje de expresiones de los datos. */
import type { Country, Id, World } from './types';
import { GROUPS } from './types';
import type { Resolver } from './expr';
import { ideologyOf, regimeOf } from './data';
import { gdppc } from './util';

export function modSum(c: Country, key: string): number {
  let s = 0;
  for (const m of c.mods) {
    const v = m.mods[key];
    if (typeof v === 'number') s += v;
  }
  for (const sh of c.shocks) if (sh.key === key) s += sh.value;
  return s;
}

export function modParts(c: Country, key: string): { label: string; value: number }[] {
  const out: { label: string; value: number }[] = [];
  for (const m of c.mods) {
    const v = m.mods[key];
    if (typeof v === 'number' && v !== 0) out.push({ label: m.name, value: v });
  }
  for (const sh of c.shocks) if (sh.key === key && sh.value !== 0) out.push({ label: sh.label, value: sh.value });
  return out;
}

export function addShock(c: Country, key: string, label: string, value: number) {
  if (!value) return;
  const ex = c.shocks.find((s) => s.key === key && s.label === label);
  if (ex) ex.value += value;
  else c.shocks.push({ key, label, value });
}

export function atWar(world: World, id: Id): boolean {
  return world.wars.some((w) => w.ceasefire <= 0 && (w.attackers.includes(id) || w.defenders.includes(id)));
}

export function warsOf(world: World, id: Id) {
  return world.wars.filter((w) => w.attackers.includes(id) || w.defenders.includes(id));
}

/** Puntuación de guerra media desde la perspectiva del país (−100..100). */
export function warScoreFor(world: World, id: Id): number {
  const ws = warsOf(world, id);
  if (!ws.length) return 0;
  let s = 0;
  for (const w of ws) s += w.attackers.includes(id) ? w.score : -w.score;
  return s / ws.length;
}

export function sanctionLevelOn(world: World, id: Id): number {
  let s = 0;
  for (const x of world.sanctions) {
    if (x.target !== id) continue;
    const by = world.countries[x.by];
    if (!by) continue;
    s += x.level * Math.min(1.5, Math.sqrt(by.eco.gdp / 2000));
  }
  return s;
}

export function occupiedShare(c: Country): number {
  let tot = 0, occ = 0;
  for (const r of c.regions) {
    if (r.owner !== c.id) continue;
    tot += r.popShare;
    if (r.controller !== c.id) occ += r.popShare;
  }
  return tot > 0 ? occ / tot : 0;
}

export function relOp(world: World, a: Id, b: Id): number {
  return world.rel[a]?.[b]?.op ?? 0;
}

export function relTrust(world: World, a: Id, b: Id): number {
  return world.rel[a]?.[b]?.trust ?? 50;
}

const allyCache = new WeakMap<World, { sig: string; set: Set<string> }>();

function allySet(world: World): Set<string> {
  const sig = `${world.turn}:${world.rev ?? 0}`;
  let c = allyCache.get(world);
  if (!c || c.sig !== sig) {
    const set = new Set<string>();
    const addPair = (x: Id, y: Id) => { set.add(`${x}|${y}`); set.add(`${y}|${x}`); };
    for (const t of world.treaties) if (t.type === 'alliance' || t.type === 'defense') addPair(t.parties[0], t.parties[1]);
    for (const o of Object.values(world.orgs)) {
      if (!o.mutualDefense) continue;
      for (let i = 0; i < o.members.length; i++) for (let j = i + 1; j < o.members.length; j++) addPair(o.members[i], o.members[j]);
    }
    c = { sig, set };
    allyCache.set(world, c);
  }
  return c.set;
}

export function allied(world: World, a: Id, b: Id): boolean {
  if (a === b) return true;
  return allySet(world).has(`${a}|${b}`);
}

export function hasTreaty(world: World, a: Id, b: Id, type: string): boolean {
  return world.treaties.some((t) => t.type === type && t.parties.includes(a) && t.parties.includes(b));
}

function baseVar(world: World, c: Country, path: string): number {
  const p = path.split('.');
  const head = p[0];
  switch (head) {
    case 'gdp': return c.eco.gdp;
    case 'gdppc': return gdppc(c);
    case 'growth': return c.eco.growth;
    case 'potentialGrowth': return c.eco.potentialGrowth;
    case 'inflation': return c.eco.inflation;
    case 'unemployment': return c.eco.unemployment;
    case 'debt': return (c.eco.debt / c.eco.gdp) * 100;
    case 'deficit': return c.eco.deficit;
    case 'reserves': return c.eco.reserves;
    case 'rate': return c.eco.policyRate;
    case 'currency': return c.eco.currency;
    case 'tradeAccess': return c.eco.tradeAccess;
    case 'exports': return c.eco.exports;
    case 'imports': return c.eco.imports;
    case 'pop': return c.soc.pop;
    case 'atWar': return atWar(world, c.id) ? 1 : 0;
    case 'wars': return warsOf(world, c.id).length;
    case 'warScore': return warScoreFor(world, c.id);
    case 'occupied': return occupiedShare(c) * 100;
    case 'sanctioned': return sanctionLevelOn(world, c.id);
    case 'reputation': return c.reputation;
    case 'isBlock': return c.isBlock ? 1 : 0;
    case 'isPlayer': return world.player?.country === c.id ? 1 : 0;
    case 'nuclear': return c.mil.nukes > 0 ? 1 : 0;
    case 'coastal': return c.regions.some((r) => r.coastal) ? 1 : 0;
    case 'refugees': return c.soc.refugees;
    case 'pandemic': return world.global.pandemic?.infected[c.id] ?? 0;
    case 'eco': {
      const v = (c.eco as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : typeof v === 'boolean' ? (v ? 1 : 0) : 0;
    }
    case 'budget': return c.eco.budget[p[1] as keyof typeof c.eco.budget] ?? 0;
    case 'taxes': return c.eco.taxes[p[1] as keyof typeof c.eco.taxes] ?? 0;
    case 'sector': return c.eco.sectors[p[1] as keyof typeof c.eco.sectors] ?? 0;
    case 'soc': return ((c.soc as unknown as Record<string, number>)[p[1]]) ?? 0;
    case 'groups': {
      const g = c.groups[p[1] as keyof typeof c.groups];
      if (!g) return 0;
      return p[2] === 'radical' ? g.radical : g.support;
    }
    case 'pol': {
      const v = (c.pol as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'flags': return c.pol.flags[p[1]] ?? 0;
    case 'policy': return c.pol.policies[p[1]] ?? 0;
    case 'regime': {
      const r = regimeOf(c.pol.regime) as unknown as Record<string, unknown>;
      if (p[1] === 'is') return c.pol.regime === p[2] ? 1 : 0;
      const v = r[p[1]];
      return typeof v === 'number' ? v : v ? 1 : 0;
    }
    case 'ideo': {
      if (p[1] === 'is') return c.pol.ideology === p[2] ? 1 : 0;
      if (p[1].startsWith('prefs_')) return (ideologyOf(c.pol.ideology).prefs as unknown as Record<string, number>)[p[1].slice(6)] ?? 0;
      const v = (ideologyOf(c.pol.ideology) as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'mil': {
      if (p[1] === 'units') return c.mil.units[p[2] as keyof typeof c.mil.units] ?? 0;
      const v = (c.mil as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'intel': {
      const v = (c.intel as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'tech': {
      if (p[1] === 'has') return c.tech.done.includes(p[2]) ? 1 : 0;
      const v = (c.tech as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'res': {
      const r = c.res[p[1] as keyof typeof c.res];
      if (!r) return 0;
      if (p[2] === 'net') return r.prod - r.cons;
      if (p[2] === 'dep') return r.cons > 0 ? Math.max(0, (r.cons - r.prod) / r.cons) : 0;
      return (r as unknown as Record<string, number>)[p[2] ?? 'prod'] ?? 0;
    }
    case 'hazard': return c.hazards[p[1]] ?? 0;
    case 'police': return ((c.police as unknown as Record<string, number>)[p[1]]) ?? 0;
    case 'corr': return c.corr[p[1] as keyof typeof c.corr] ?? 0;
    case 'narco': return ((c.narco as unknown as Record<string, number>)[p[1]]) ?? 0;
    case 'needs': return c.soc.needs[p[1]] ?? 0;
    case 'pressure': return c.soc.pressure;
    case 'crime': return c.police.crime;
    case 'bio': {
      if (p[1] === 'designs') return c.bio.designs.length;
      if (p[1] === 'exposed') return c.bio.exposed >= 0 ? 1 : 0;
      const v = (c.bio as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'outbreak': {
      let s = 0;
      for (const o of world.global.outbreaks ?? []) if (o.detected) s += o.infected[c.id] ?? 0;
      return s;
    }
    case 'minister': {
      const m = c.pol.ministers.find((x) => x.ministry === p[1]);
      return m ? (p[2] === 'loyalty' ? m.loyalty : m.competence) : 50;
    }
    case 'pers': {
      const v = (c.ai as unknown as Record<string, unknown>)[p[1]];
      return typeof v === 'number' ? v : 0;
    }
    case 'mod': return modSum(c, p.slice(1).join('.'));
    case 'regions': return c.regions.filter((r) => r.owner === c.id).length;
    case 'world': {
      const g = world.global;
      switch (p[1]) {
        case 'turn': return world.turn;
        case 'year': return 2026 + Math.floor(world.turn / 12);
        case 'tension': return g.tension;
        case 'temperature': return g.temperature;
        case 'pandemic': return g.pandemic ? g.pandemic.severity : 0;
        case 'wars': return world.wars.length;
        case 'price': {
          const k = p[2] as keyof typeof world.market.price;
          return world.market.price[k] / world.market.base[k];
        }
        case 'oilPrice': return world.market.price.oil / world.market.base.oil;
        case 'foodPrice': return world.market.price.food / world.market.base.food;
        case 'growth': return g.worldGrowth;
        default: return 0;
      }
    }
    default:
      return NaN;
  }
}

/**
 * Crea un resolutor para el país `c`. Si se da `target`, las rutas `target.*` se resuelven en el
 * país objetivo y se habilitan `rel`, `relT`, `trust`, `trustT`, `allied`, `border`, `sea`, `powerRatio`, `trade`.
 */
export function resolver(world: World, c: Country, target?: Country, extra?: Record<string, number>): Resolver {
  return (path: string) => {
    if (extra && path in extra) return extra[path];
    if (path.startsWith('target.')) {
      if (!target) return 0;
      return baseVar(world, target, path.slice(7));
    }
    if (target) {
      switch (path) {
        case 'rel': return relOp(world, c.id, target.id);
        case 'relT': return relOp(world, target.id, c.id);
        case 'trust': return relTrust(world, c.id, target.id);
        case 'trustT': return relTrust(world, target.id, c.id);
        case 'allied': return allied(world, c.id, target.id) ? 1 : 0;
        case 'border': return c.regions.length && neighborsLand(c.id).includes(target.id) ? 1 : 0;
        case 'sea': return neighborsSea(c.id).includes(target.id) ? 1 : 0;
        case 'powerRatio': return c.mil.power / Math.max(1, target.mil.power);
        case 'trade': return tradeShare(world, c.id, target.id);
        case 'rival': return c.ai.rivals.includes(target.id) ? 1 : 0;
        case 'claim': return c.ai.claims.includes(target.id) ? 1 : 0;
        case 'atWarWith': return world.wars.some((w) => (w.attackers.includes(c.id) && w.defenders.includes(target.id)) || (w.defenders.includes(c.id) && w.attackers.includes(target.id))) ? 1 : 0;
        case 'sanctioning': return world.sanctions.find((s) => s.by === c.id && s.target === target.id)?.level ?? 0;
        case 'sanctionedBy': return world.sanctions.find((s) => s.by === target.id && s.target === c.id)?.level ?? 0;
      }
    }
    if (path === 'GROUPS') return GROUPS.length;
    const v = baseVar(world, c, path);
    return Number.isNaN(v) ? 0 : v;
  };
}

// Vecindades (se rellenan en init a partir de adjacency.json)
const LAND: Record<string, string[]> = {};
const SEA: Record<string, string[]> = {};
export function setNeighbors(land: Record<string, string[]>, sea: Record<string, string[]>) {
  Object.assign(LAND, land);
  Object.assign(SEA, sea);
}
export function neighborsLand(id: Id): string[] {
  return LAND[id] ?? [];
}
export function neighborsSea(id: Id): string[] {
  return SEA[id] ?? [];
}

/** Proporción del comercio total de a que va a/viene de b. */
const shareCache = new WeakMap<World, { turn: number; m: Map<string, number> }>();

export function tradeShare(world: World, a: Id, b: Id): number {
  let e = shareCache.get(world);
  if (!e || e.turn !== world.turn) { e = { turn: world.turn, m: new Map() }; shareCache.set(world, e); }
  const k = a + '|' + b;
  let v = e.m.get(k);
  if (v === undefined) { v = tradeShareRaw(world, a, b); e.m.set(k, v); }
  return v;
}

const totalCache = new WeakMap<object, Record<string, number>>();

function tradeShareRaw(world: World, a: Id, b: Id): number {
  let tot = totalCache.get(world.trade);
  if (!tot) {
    tot = {};
    for (const x in world.trade) for (const y in world.trade[x]) {
      const v = world.trade[x][y];
      tot[x] = (tot[x] ?? 0) + v;
      tot[y] = (tot[y] ?? 0) + v;
    }
    totalCache.set(world.trade, tot);
  }
  const ab = (world.trade[a]?.[b] ?? 0) + (world.trade[b]?.[a] ?? 0);
  return (tot[a] ?? 0) > 0 ? ab / tot[a] : 0;
}
