/** Eventos dinámicos: condiciones y pesos según el estado del mundo, opciones con consecuencias (a veces ocultas). */
import type { Country, EventDef, EventOption, Id, PendingEvent, World } from './types';
import { GROUPS } from './types';
import { evalExpr } from './expr';
import { resolver, neighborsLand, neighborsSea, relOp, atWar } from './vars';
import { addModifier, applyEffects, schedule, fillTemplate } from './effects';
import { clamp, news, rngOf, timeline, uid } from './util';
import { topPartners } from './market';
import { generateMinister } from './init';
import { MINISTRY_NAMES } from './govhandlers';
import type { Rng } from './rng';
import eventsJson from '../data/events.json';

export interface EventDefX extends EventDef {
  tone?: 'good' | 'bad' | 'neutral';
  options: (EventOption & { debtCut?: number; replaceMinister?: boolean })[];
  /** Evento sobre algo secreto: no aparece en las noticias cuando lo resuelve la IA. */
  secret?: boolean;
  /** Asunto crítico: en tiempo real detiene el reloj hasta que el jugador decida. */
  critical?: boolean;
}

export const EVENTS: EventDefX[] = eventsJson as unknown as EventDefX[];
export const EVENT_BY_ID: Record<string, EventDefX> = Object.fromEntries(EVENTS.map((e) => [e.id, e]));

function pickTarget(world: World, c: Country, kind: string | undefined, rng: Rng): Country | null {
  const alive = (id: Id) => world.countries[id]?.alive;
  const near = [...neighborsLand(c.id), ...neighborsSea(c.id)].filter(alive);
  let cands: Id[] = [];
  switch (kind) {
    case 'hostile_neighbor':
      cands = near.filter((id) => relOp(world, c.id, id) < -15).sort((a, b) => relOp(world, c.id, a) - relOp(world, c.id, b)).slice(0, 2);
      break;
    case 'neighbor_at_war':
      cands = near.filter((id) => atWar(world, id) && !atWar(world, c.id));
      break;
    case 'rival': {
      const rivals = c.ai.rivals.filter(alive);
      cands = rivals.length ? rivals : world.order.filter((id) => id !== c.id && alive(id) && relOp(world, c.id, id) < -40);
      break;
    }
    case 'trade_partner':
      cands = topPartners(world, c.id, 4).map((p) => p.id).filter((id) => alive(id) && relOp(world, c.id, id) > -30);
      break;
    default:
      cands = near;
  }
  if (!cands.length) return null;
  return world.countries[rng.pick(cands)];
}

function eventVars(world: World, c: Country, rng: Rng, target: Country | null): Record<string, string | number> {
  const regs = c.regions.filter((r) => r.owner === c.id);
  const region = regs.length ? rng.pick(regs).name : c.capital;
  const disloyal = [...c.pol.ministers].sort((a, b) => a.loyalty - b.loyalty)[0];
  return { region, minister: disloyal?.name ?? 'de Economía', ministry: disloyal?.ministry ?? 'economy', target: target?.id ?? '' };
}

/** Lanza un evento concreto para un país (jugador: queda pendiente; IA: decide al instante). */
export function triggerEvent(world: World, c: Country, def: EventDefX, rng: Rng, target: Country | null = null) {
  const vars = eventVars(world, c, rng, target);
  world.eventCooldowns[`${c.id}:${def.id}`] = world.turn + def.cooldown;
  if (def.once) world.eventCooldowns[`${c.id}:${def.id}:once`] = 1;
  const title = fillTemplate(def.title, world, c, { source: def.id, target: target ?? undefined, vars });
  if (world.player?.country === c.id) {
    const pe: PendingEvent = { uid: uid(world, 'ev'), id: def.id, country: c.id, turn: world.turn, vars: { ...vars, title } };
    world.pendingEvents.push(pe);
    return;
  }
  // IA: elige la opción con mayor utilidad (+ruido)
  const r = resolver(world, c, target ?? undefined);
  let best = 0, bestU = -Infinity;
  def.options.forEach((o, i) => {
    if (o.requires && !evalExpr(o.requires, r)) return;
    const u = evalExpr(o.ai ?? 0, r) + rng.normal() * 0.35;
    if (u > bestU) { bestU = u; best = i; }
  });
  applyOption(world, c, def, best, vars, target);
  if (!def.secret && def.tone !== 'neutral' && (def.category === 'desastre' || c.eco.gdp > 900 || def.scope === 'pair')) {
    news(world, `${title} en ${c.name}: ${def.options[best].text.toLowerCase()}.`, 'evento', [c.id, ...(target ? [target.id] : [])], def.category === 'desastre' ? 1 : 0);
  }
}

function applyOption(world: World, c: Country, def: EventDefX, idx: number, vars: Record<string, string | number>, target: Country | null) {
  const o = def.options[idx];
  const src = `evento:${def.id}`;
  const ctx = { source: src, target: target ?? undefined, vars };
  applyEffects(world, c, o.effects, ctx);
  if (target && o.targetEffects) applyEffects(world, target, o.targetEffects, { source: src, target: c, vars });
  for (const g of GROUPS) if (o.groups?.[g]) c.groups[g].support = clamp(c.groups[g].support + o.groups[g]!, 0, 100);
  for (const m of o.modifiers ?? []) addModifier(world, c, m, src, target ?? undefined);
  for (const d of o.delayed ?? []) schedule(world, c, d.in, d.effects, src, d.mods, d.text, target?.id);
  if (o.debtCut) c.eco.debt *= 1 - o.debtCut;
  // Desmantelar el programa biológico destruye también las cepas almacenadas
  if (c.bio.program <= 0 && c.bio.designs.length) c.bio.designs = [];
  if (o.replaceMinister) {
    const rng = rngOf(world);
    const ministry = String(vars.ministry) as keyof typeof MINISTRY_NAMES;
    const i = c.pol.ministers.findIndex((m) => m.ministry === ministry);
    if (i >= 0) c.pol.ministers[i] = generateMinister(rng, c, ministry, 'leal', world.turn);
    world.rng = rng.state;
  }
}

/** El jugador elige una opción de un evento pendiente. */
export function resolveEvent(world: World, uidStr: string, optionIdx: number): string {
  const i = world.pendingEvents.findIndex((p) => p.uid === uidStr);
  if (i < 0) return 'El evento ya no está pendiente.';
  const pe = world.pendingEvents[i];
  const def = EVENT_BY_ID[pe.id];
  const c = world.countries[pe.country];
  world.pendingEvents.splice(i, 1);
  if (!def || !c) return '';
  const target = pe.vars.target ? world.countries[String(pe.vars.target)] ?? null : null;
  applyOption(world, c, def, optionIdx, pe.vars, target);
  const opt = def.options[optionIdx];
  news(world, `${String(pe.vars.title ?? def.title)}: ${opt.text.toLowerCase()}.`, 'evento', [c.id], 1);
  timeline(world, `${String(pe.vars.title ?? def.title)} → ${opt.text}`, 'evento');
  return opt.text;
}

/** Opción que elegiría el gabinete (utilidad de la IA sin ruido: determinista). */
export function cabinetChoice(world: World, pe: PendingEvent): number {
  const def = EVENT_BY_ID[pe.id];
  const c = world.countries[pe.country];
  if (!def || !c) return 0;
  const target = pe.vars.target ? world.countries[String(pe.vars.target)] : undefined;
  const r = resolver(world, c, target);
  let best = 0, bestU = -Infinity;
  def.options.forEach((o, i) => {
    if (o.requires && !evalExpr(o.requires, r)) return;
    const u = evalExpr(o.ai ?? 0, r);
    if (u > bestU) { bestU = u; best = i; }
  });
  return best;
}

/**
 * Asuntos no críticos que llevan un mes sin respuesta: decide el gabinete. Devuelve los títulos y
 * las opciones elegidas (para avisar al jugador).
 */
export function autoResolveExpired(world: World): { title: string; option: string }[] {
  const pid = world.player?.country;
  const out: { title: string; option: string }[] = [];
  for (const pe of [...world.pendingEvents]) {
    if (pe.country !== pid || EVENT_BY_ID[pe.id]?.critical || pe.turn > world.turn) continue;
    const idx = cabinetChoice(world, pe);
    const title = String(pe.vars.title ?? EVENT_BY_ID[pe.id]?.title ?? 'Asunto');
    const option = resolveEvent(world, pe.uid, idx);
    if (option) out.push({ title, option });
  }
  return out;
}

export function eventWeight(world: World, c: Country, def: EventDefX, target: Country | null): number {
  const r = resolver(world, c, target ?? undefined);
  if (def.condition && !evalExpr(def.condition, r)) return 0;
  let w = Math.max(0, evalExpr(def.weight, r));
  const p = world.player;
  if (p?.country === c.id) {
    if (def.tone === 'bad') w *= p.difficulty === 'facil' ? 0.7 : p.difficulty === 'dificil' ? 1.3 : 1;
    if (def.tone === 'good') w *= p.difficulty === 'facil' ? 1.3 : p.difficulty === 'dificil' ? 0.8 : 1;
  }
  return w;
}

/** Genera los eventos del mes. Peso = probabilidad mensual en %. */
export function generateEvents(world: World) {
  if (world.forecast) return;
  const rng = rngOf(world);
  // Eventos encadenados que vencen
  const due = world.chains.filter((ch) => ch.turn <= world.turn);
  world.chains = world.chains.filter((ch) => ch.turn > world.turn);
  for (const ch of due) {
    const c = world.countries[ch.country];
    const def = EVENT_BY_ID[ch.id];
    if (c?.alive && def) triggerEvent(world, c, def, rng, ch.target ? world.countries[ch.target] ?? null : null);
  }
  for (const id of world.order) {
    const c = world.countries[id];
    if (!c.alive) continue;
    const isPlayer = world.player?.country === id;
    const maxEvents = isPlayer ? 2 : 1;
    let fired = 0;
    // Orden aleatorio para no favorecer a los primeros del fichero
    const order = EVENTS.map((e, i) => ({ e, k: rng.next() + i * 0 })).sort((a, b) => a.k - b.k).map((x) => x.e);
    for (const def of order) {
      if (fired >= maxEvents) break;
      if ((world.eventCooldowns[`${id}:${def.id}`] ?? -1) > world.turn) continue;
      if (def.once && world.eventCooldowns[`${id}:${def.id}:once`]) continue;
      let target: Country | null = null;
      if (def.scope === 'pair') {
        target = pickTarget(world, c, def.pickTarget, rng);
        if (!target) continue;
      }
      const w = eventWeight(world, c, def, target);
      if (w <= 0) continue;
      if (rng.next() * 100 < w) {
        triggerEvent(world, c, def, rng, target);
        fired += 1;
      }
    }
  }
  world.rng = rng.state;
}
