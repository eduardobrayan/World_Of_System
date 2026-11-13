/** Efectos, modificadores con duración y efectos retardados (todo definido en datos). */
import type { Country, EffectDef, Id, Modifier, ModifierDef, World } from './types';
import { GROUPS } from './types';
import { evalExpr } from './expr';
import { resolver } from './vars';
import { clamp, news } from './util';

export interface EffectCtx {
  source: string;
  target?: Country;
  vars?: Record<string, string | number>;
}

/** Rango válido de cada ruta modificable. */
const RANGES: Record<string, [number, number]> = {
  'eco.inflation': [-5, 2000], 'eco.unemployment': [0.5, 60], 'eco.growth': [-40, 30], 'eco.currency': [5, 400],
  'eco.reserves': [0, 1e6], 'eco.policyRate': [0, 200], 'eco.investment': [3, 60], 'eco.infra': [0, 100],
  'soc.education': [0, 100], 'soc.health': [0, 100], 'soc.gini': [15, 75], 'soc.protest': [0, 100], 'soc.strikes': [0, 100],
  'soc.trust': [0, 100], 'soc.satisfaction': [0, 100], 'pol.stability': [0, 100], 'pol.legitimacy': [0, 100],
  'pol.corruption': [0, 100], 'pol.pressFreedom': [0, 100], 'pol.repression': [0, 100], 'pol.ap': [0, 20],
  'pol.warWeariness': [0, 100], 'mil.morale': [0, 100], 'mil.readiness': [0, 100], 'mil.tech': [0, 100],
  'mil.logistics': [0, 100], 'intel.level': [0, 100], 'intel.counter': [0, 100], 'tech.level': [0, 100],
  'tech.renewables': [0, 100], 'reputation': [0, 100],
};

export function fillTemplate(text: string, world: World, c: Country, ctx?: EffectCtx): string {
  return text
    .replace(/\{country\}/g, c.name)
    .replace(/\{target\}/g, ctx?.target?.name ?? '')
    .replace(/\{(\w+)\}/g, (m, k) => (ctx?.vars && k in ctx.vars ? String(ctx.vars[k]) : m));
}

/** Lee el valor actual de una ruta modificable. */
export function getPath(c: Country, path: string): number {
  const [h, a, b] = path.split('.');
  switch (h) {
    case 'groups': return c.groups[a as keyof typeof c.groups]?.support ?? 0;
    case 'budget': return c.eco.budget[a as keyof typeof c.eco.budget] ?? 0;
    case 'taxes': return c.eco.taxes[a as keyof typeof c.eco.taxes] ?? 0;
    case 'flags': return c.pol.flags[a] ?? 0;
    case 'policy': return c.pol.policies[a] ?? 0;
    case 'reputation': return c.reputation;
    case 'res': return (c.res[a as keyof typeof c.res] as unknown as Record<string, number>)?.[b ?? 'prod'] ?? 0;
    case 'mil':
      if (a === 'units') return c.mil.units[b as keyof typeof c.mil.units] ?? 0;
      return ((c.mil as unknown as Record<string, number>)[a]) ?? 0;
    default: {
      const obj = (c as unknown as Record<string, Record<string, unknown>>)[h];
      const v = obj?.[a];
      return typeof v === 'number' ? v : 0;
    }
  }
}

/** Escribe un valor en una ruta modificable (con límites). */
export function setPath(c: Country, path: string, value: number) {
  const r = RANGES[path];
  if (r) value = clamp(value, r[0], r[1]);
  const [h, a, b] = path.split('.');
  switch (h) {
    case 'groups': {
      const g = c.groups[a as keyof typeof c.groups];
      if (g) g.support = clamp(value, 0, 100);
      return;
    }
    case 'budget': c.eco.budget[a as keyof typeof c.eco.budget] = clamp(value, 0, 60); return;
    case 'taxes': c.eco.taxes[a as keyof typeof c.eco.taxes] = clamp(value, 0, 70); return;
    case 'flags': c.pol.flags[a] = value; return;
    case 'policy': c.pol.policies[a] = Math.round(value); return;
    case 'reputation': c.reputation = clamp(value, 0, 100); return;
    case 'res': {
      const rs = c.res[a as keyof typeof c.res] as unknown as Record<string, number>;
      if (rs) rs[b ?? 'prod'] = Math.max(0, value);
      return;
    }
    case 'mil':
      if (a === 'units') { c.mil.units[b as keyof typeof c.mil.units] = Math.max(0, value); return; }
      (c.mil as unknown as Record<string, number>)[a] = value;
      return;
    default: {
      const obj = (c as unknown as Record<string, Record<string, unknown>>)[h];
      if (obj && typeof obj[a] === 'number') obj[a] = value;
    }
  }
}

export function makeModifier(world: World, c: Country, def: ModifierDef, source: string, target?: Country): Modifier {
  const r = resolver(world, c, target);
  const mods: Record<string, number> = {};
  for (const [k, v] of Object.entries(def.mods)) mods[k] = evalExpr(v, r);
  return { id: def.id, name: def.name, source, remaining: def.duration, mods };
}

export function addModifier(world: World, c: Country, def: ModifierDef, source: string, target?: Country) {
  const m = makeModifier(world, c, def, source, target);
  const i = c.mods.findIndex((x) => x.id === m.id);
  if (i >= 0) c.mods[i] = m;
  else c.mods.push(m);
}

export function removeModifier(c: Country, id: string) {
  c.mods = c.mods.filter((m) => m.id !== id);
}

export function hasModifier(c: Country, id: string): boolean {
  return c.mods.some((m) => m.id === id);
}

/** Aplica una lista de efectos sobre el país `c`. */
export function applyEffects(world: World, c: Country, effects: EffectDef[] | undefined, ctx: EffectCtx) {
  if (!effects) return;
  const r = resolver(world, c, ctx.target);
  for (const e of effects) {
    if (e.type) {
      applySpecial(world, c, e, ctx);
      continue;
    }
    if (!e.path) continue;
    const paths = e.path === 'groups.all' ? GROUPS.map((g) => `groups.${g}`) : [e.path];
    for (const path of paths) {
      const cur = getPath(c, path);
      let v = cur;
      if (e.set !== undefined) v = evalExpr(e.set, r);
      if (e.add !== undefined) v += evalExpr(e.add, r);
      if (e.mul !== undefined) v *= evalExpr(e.mul, r);
      setPath(c, path, v);
    }
  }
}

function applySpecial(world: World, c: Country, e: EffectDef, ctx: EffectCtx) {
  const r = resolver(world, c, ctx.target);
  const val = evalExpr(e.value ?? e.add ?? 0, r);
  const tgt = ctx.target;
  switch (e.type) {
    case 'news':
      news(world, fillTemplate(e.text ?? '', world, c, ctx), 'evento', [c.id, ...(tgt ? [tgt.id] : [])], 1);
      break;
    case 'relation': {
      // Cambia la opinión que tiene el objetivo (o todos) sobre este país.
      const who: Id[] = e.target === 'all' ? world.order.filter((x) => x !== c.id) : tgt ? [tgt.id] : [];
      for (const w of who) {
        const rel = world.rel[w]?.[c.id];
        if (rel) rel.op = clamp(rel.op + val, -100, 100);
      }
      break;
    }
    case 'opinion': {
      // Cambia la opinión de este país sobre el objetivo.
      if (tgt) {
        const rel = world.rel[c.id]?.[tgt.id];
        if (rel) rel.op = clamp(rel.op + val, -100, 100);
      }
      break;
    }
    case 'memory':
      if (tgt) addMemory(world, tgt, c.id, e.id ?? 'evento', val, e.text ?? '', 36);
      break;
    case 'treasury':
      // Coste o ingreso único (miles de millones). Negativo = gasto.
      c.eco.debt = Math.max(0, c.eco.debt - val);
      break;
    case 'gdp':
      c.eco.gdp *= 1 + val / 100;
      break;
    case 'tension':
      world.global.tension = clamp(world.global.tension + val, 0, 100);
      break;
    case 'price': {
      const k = (e.id ?? 'oil') as keyof typeof world.market.shock;
      if (k in world.market.shock) world.market.shock[k] += val / 100;
      break;
    }
    case 'pop':
      c.soc.pop = Math.max(0.01, c.soc.pop * (1 + val / 100));
      break;
    case 'units': {
      // Pérdidas o ganancias proporcionales de todas las unidades (%).
      for (const k of Object.keys(c.mil.units) as (keyof typeof c.mil.units)[]) c.mil.units[k] = Math.max(0, c.mil.units[k] * (1 + val / 100));
      break;
    }
    case 'event':
      if (e.id) world.chains.push({ id: e.id, country: c.id, turn: world.turn + (e.in ?? 0), target: tgt?.id });
      break;
    case 'damage':
      for (const reg of c.regions) reg.damage = clamp(reg.damage + val, 0, 100);
      break;
    default:
      break;
  }
}

export function addMemory(world: World, holder: Country, about: Id, kind: string, value: number, text: string, halfLife: number) {
  if (world.forecast || holder.id === about) return;
  holder.memory.push({ about, kind, value, turn: world.turn, halfLife, text });
  if (holder.memory.length > 120) holder.memory.splice(0, holder.memory.length - 120);
}

/** Valor actual (decaído) de la memoria de `holder` sobre `about`. */
export function memoryValue(world: World, holder: Country, about: Id): number {
  let s = 0;
  for (const m of holder.memory) {
    if (m.about !== about) continue;
    s += m.value * Math.pow(0.5, (world.turn - m.turn) / Math.max(1, m.halfLife));
  }
  return s;
}

export function schedule(world: World, c: Country, delay: number, effects: EffectDef[], source: string, mods?: ModifierDef[], text?: string, target?: Id) {
  world.scheduled.push({ turn: world.turn + delay, country: c.id, source, effects, mods, text, target });
}

/** Ejecuta los efectos retardados que vencen este turno. */
export function processScheduled(world: World) {
  const due = world.scheduled.filter((s) => s.turn <= world.turn);
  world.scheduled = world.scheduled.filter((s) => s.turn > world.turn);
  for (const s of due) {
    const c = world.countries[s.country];
    if (!c || !c.alive) continue;
    const tgt = s.target ? world.countries[s.target] : undefined;
    applyEffects(world, c, s.effects, { source: s.source, target: tgt });
    for (const m of s.mods ?? []) addModifier(world, c, m, s.source, tgt);
    if (s.text) news(world, fillTemplate(s.text, world, c, { source: s.source, target: tgt }), 'consecuencia', [c.id], 1);
  }
}

/** Avanza la duración de los modificadores y elimina los vencidos. */
export function tickModifiers(c: Country) {
  for (const m of c.mods) if (m.remaining > 0) m.remaining -= 1;
  c.mods = c.mods.filter((m) => m.remaining !== 0);
}
