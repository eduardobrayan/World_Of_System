/**
 * IA de los países: personalidad, amenazas percibidas, decisión por utilidad con ruido de la semilla,
 * evaluación de propuestas con motivos explicables, memoria y reacciones (incluidas coaliciones de contrapeso).
 */
import type { AIDecision, ActionDef, Country, Id, World } from './types';
import { ACTIONS, ACTION_BY_ID, executeAction, previewAction, type ActionCtx } from './actions';
import { evalExpr } from './expr';
import { resolver, allied, relOp, relTrust, tradeShare, neighborsLand, neighborsSea, hasTreaty, atWar, sanctionLevelOn } from './vars';
import { personalityOf, regimeOf } from './data';
import { bumpRev, clamp, gdppc, news, rngOf } from './util';
import { isAtWarWith, majorPowers, remember, setSanction, signTreaty, TREATY_NAMES } from './diplomacy';
import type { Rng } from './rng';

export interface Factor { label: string; value: number }

function fmtReasons(f: Factor[], n = 4): string[] {
  return [...f].filter((x) => Math.abs(x.value) >= 0.05).sort((a, b) => Math.abs(b.value) - Math.abs(a.value)).slice(0, n)
    .map((x) => `${x.label} (${x.value > 0 ? '+' : ''}${x.value.toFixed(2)})`);
}

export function logDecision(world: World, d: AIDecision) {
  if (world.forecast) return;
  world.aiLog.push(d);
  if (world.aiLog.length > 500) world.aiLog.splice(0, world.aiLog.length - 500);
  const c = world.countries[d.actor];
  if (c) {
    c.ai.lastDecisions.push(d);
    if (c.ai.lastDecisions.length > 12) c.ai.lastDecisions.shift();
  }
}

// ---------- Amenazas ----------

/** Amenaza (0..2+) que `t` supone para `c`: poder relativo × hostilidad × cercanía. */
export function threatOf(world: World, c: Country, t: Country): number {
  if (c.id === t.id || !t.alive) return 0;
  const hostile = clamp(-relOp(world, t.id, c.id) / 100, 0, 1) * 0.7 + clamp(-relOp(world, c.id, t.id) / 100, 0, 1) * 0.3;
  const war = isAtWarWith(world, c.id, t.id) ? 1 : 0;
  if (hostile < 0.15 && !war) return 0;
  const near = neighborsLand(c.id).includes(t.id) ? 1 : neighborsSea(c.id).includes(t.id) ? 0.7 : t.mil.navalPower > 600 ? 0.35 : 0.12;
  const ratio = t.mil.power / Math.max(30, c.mil.power + alliesPower(world, c) * 0.5);
  const nuke = t.mil.nukes > 0 ? 0.2 : 0;
  return clamp((Math.max(hostile, war) * near * Math.sqrt(ratio)) + nuke * hostile + war * 0.5, 0, 3);
}

const apCache = new WeakMap<World, { turn: number; m: Map<Id, number> }>();

export function alliesPower(world: World, c: Country): number {
  let e = apCache.get(world);
  if (!e || e.turn !== world.turn) { e = { turn: world.turn, m: new Map() }; apCache.set(world, e); }
  const hit = e.m.get(c.id);
  if (hit !== undefined) return hit;
  const v = alliesPowerRaw(world, c);
  e.m.set(c.id, v);
  return v;
}

function alliesPowerRaw(world: World, c: Country): number {
  let p = 0;
  for (const id of world.order) if (id !== c.id && allied(world, c.id, id)) p += world.countries[id].mil.power * 0.6;
  return p;
}

export function updateThreats(world: World, c: Country) {
  const th: Record<string, number> = {};
  let max = 0;
  for (const id of world.order) {
    const v = threatOf(world, c, world.countries[id]);
    if (v > 0.05) { th[id] = Math.round(v * 100) / 100; max = Math.max(max, v); }
  }
  th.max = Math.round(max * 100) / 100;
  c.ai.threat = th;
  const base = c.base.budget_defense ?? c.eco.budget.defense;
  c.ai.targetDefense = max > 0.45 ? Math.min(base * (1 + (max - 0.45) * 1.2), base + 4) : 0;
}

function commonThreat(world: World, a: Country, b: Country): number {
  let s = 0;
  for (const [id, v] of Object.entries(a.ai.threat)) {
    if (id === 'max' || id === b.id) continue;
    s += Math.min(v, b.ai.threat[id] ?? 0);
  }
  return clamp(s, 0, 2);
}

// ---------- Evaluación de propuestas ----------

export interface Evaluation { score: number; threshold: number; prob: number; factors: Factor[]; reasons: string[] }

const sig = (x: number) => 1 / (1 + Math.exp(-x));

/** ¿Acepta `to` la propuesta de `from`? Determinista (el azar se aplica al decidir). */
export function evaluateProposal(world: World, from: Country, to: Country, kind: string, terms: Record<string, number | string> = {}): Evaluation {
  const f: Factor[] = [];
  const add = (label: string, v: number) => { f.push({ label, value: v }); return v; };
  const p = to.ai;
  const op = relOp(world, to.id, from.id);
  const trust = relTrust(world, to.id, from.id);
  let s = 0;
  s += add(op >= 0 ? 'buena relación' : 'mala relación', op / 50);
  s += add(trust >= 50 ? 'confianza alta' : 'confianza baja', (trust - 50) / 45);
  s += add('reputación del proponente', (from.reputation - 60) / 60);
  if (p.rivals.includes(from.id)) s += add('rival histórico', -1.5);
  if (isAtWarWith(world, to.id, from.id)) s += add('estamos en guerra', -3);
  const foreignMin = ((from.pol.ministers.find((m) => m.ministry === 'foreign')?.competence ?? 50) - 50) / 100;
  s += add('habilidad de su diplomacia', foreignMin * 0.6);
  let threshold = 0.6;
  switch (kind) {
    case 'trade': {
      const share = tradeShare(world, to.id, from.id);
      s += add('beneficio comercial', (share * 18 + Math.min(1, from.eco.gdp / Math.max(50, to.eco.gdp)) * 0.4) * (0.5 + p.pragmatism));
      if (from.eco.gdp > to.eco.gdp * 4 && to.eco.sectors.industry > 22) s += add('competencia para su industria', -0.4);
      s += add('preferencia ideológica por el libre comercio', regimeOf(to.pol.regime).competitive ? 0.2 : -0.1);
      threshold = 0.5;
      break;
    }
    case 'alliance': case 'defense': {
      const ct = commonThreat(world, to, from);
      s += add('amenaza común', ct * 1.3 * (personalityOf(p.personality).priorities.security ?? 1));
      s += add('poder militar del aliado', clamp(Math.log10(Math.max(10, from.mil.power) / Math.max(10, to.mil.power)) * 0.5, -0.5, 0.8));
      const entangle = (atWar(world, from.id) ? 1.2 : 0) + clamp(((from.ai.threat.max ?? 0) - (to.ai.threat.max ?? 0)) * 0.5, 0, 1);
      s += add('riesgo de verse arrastrado a sus guerras', -entangle * (0.5 + p.riskAversion));
      const bigRivals = from.ai.rivals.filter((r) => (world.rel[to.id]?.[r]?.op ?? 0) > 30).length;
      if (bigRivals) s += add('enemistad con nuestros socios', -0.6 * bigRivals);
      s += add('fiabilidad propia', (p.reliability - 0.5) * 0.4);
      threshold = 1.1;
      break;
    }
    case 'nonaggression': {
      const ratio = from.mil.power / Math.max(30, to.mil.power);
      s += add('seguridad frente a un vecino poderoso', clamp((ratio - 0.6) * 0.6, -0.3, 1.2) * (0.5 + p.riskAversion));
      s += add('ambiciones propias', -p.aggression * (p.claims.includes(from.id) ? 1.5 : 0.4));
      threshold = 0.3;
      break;
    }
    case 'cooperation': {
      const gap = (from.tech.level - to.tech.level) / 25;
      s += add('acceso a tecnología', clamp(gap, -0.5, 1.2));
      if (p.rivals.length && from.ai.rivals.some((r) => p.rivals.includes(r))) s += add('rivales comunes', 0.4);
      threshold = 0.6;
      break;
    }
    case 'energy': {
      const toImporter = to.res.oil.cons > to.res.oil.prod || to.res.gas.cons > to.res.gas.prod;
      s += add(toImporter ? 'seguridad de suministro' : 'mercado estable para nuestras exportaciones', 0.8 * (0.5 + p.pragmatism));
      threshold = 0.5;
      break;
    }
    case 'join_org': {
      s += add('afinidad política', op / 80);
      threshold = 0.4;
      break;
    }
    case 'ultimatum': {
      // Aceptar la exigencia: cuanto más fuerte el que amenaza y más aversión al riesgo, más probable
      const ratio = (from.mil.power + alliesPower(world, from) * 0.6) / Math.max(30, to.mil.power + alliesPower(world, to) * 0.6);
      s = 0; f.length = 0;
      s += add('desventaja militar', clamp(Math.log2(ratio) * 0.9, -2, 2));
      s += add('aversión al riesgo', (p.riskAversion - 0.5) * 1.5);
      s += add('orgullo nacional y agresividad', -p.aggression * 1.2 - p.ideologyZeal * 0.4);
      if (to.mil.nukes > 0) s += add('disuasión nuclear propia', -1.2);
      s += add('relación previa', op / 150);
      threshold = 0.7;
      break;
    }
    case 'peace': {
      const score = Number(terms.score ?? 0); // puntuación de guerra desde el punto de vista de `to`
      const exh = Number(terms.exhaustion ?? 0);
      const cost = Number(terms.cost ?? 0); // dureza de los términos para `to` (0..3)
      s = 0; f.length = 0;
      s += add('situación militar', -score / 35);
      s += add('cansancio de guerra', exh / 45);
      s += add('dureza de las condiciones', -cost * 0.9);
      s += add('aversión al riesgo', (p.riskAversion - 0.5));
      s += add('agresividad', -p.aggression * 0.6);
      if (to.pol.stability < 35) s += add('inestabilidad interna', 0.6);
      threshold = 0.4;
      break;
    }
    case 'ceasefire': {
      const score = Number(terms.score ?? 0);
      const exh = Number(terms.exhaustion ?? 0);
      s = 0; f.length = 0;
      s += add('situación militar', -score / 40);
      s += add('cansancio de guerra', exh / 40);
      s += add('presión internacional', Number(terms.pressure ?? 0));
      s += add('agresividad', -p.aggression * 0.7);
      threshold = 0.5;
      break;
    }
  }
  const prob = clamp(sig((s - threshold) * 3), 0.01, 0.99);
  return { score: s, threshold, prob, factors: f, reasons: fmtReasons(f) };
}

export function decideProposal(world: World, from: Country, to: Country, kind: string, rng: Rng, terms: Record<string, number | string> = {}): { accepted: boolean; ev: Evaluation } {
  const ev = evaluateProposal(world, from, to, kind, terms);
  const accepted = rng.next() < ev.prob;
  return { accepted, ev };
}

// ---------- Decisiones de la IA ----------

interface Candidate { def: ActionDef; ctx: ActionCtx; utility: number; factors: Factor[]; text: string }

type Generator = (world: World, c: Country, rng: Rng, out: Candidate[]) => void;
const GENERATORS: Generator[] = [];
export function registerAiGenerator(g: Generator) { GENERATORS.push(g); }

function relevantTargets(world: World, c: Country): Country[] {
  const set = new Set<Id>([...neighborsLand(c.id), ...neighborsSea(c.id), ...c.ai.rivals, ...c.ai.sphere, ...c.ai.claims]);
  for (const p of majorPowers(world, 6)) set.add(p.id);
  for (const t of world.treaties) if (t.parties.includes(c.id)) for (const x of t.parties) set.add(x);
  for (const s of world.sanctions) { if (s.by === c.id) set.add(s.target); if (s.target === c.id) set.add(s.by); }
  for (const inc of world.incidents) if (inc.target === c.id) set.add(inc.actor);
  set.delete(c.id);
  return [...set].map((id) => world.countries[id]).filter((x) => x?.alive);
}

function importance(world: World, c: Country, t: Country): number {
  return Math.pow(t.eco.gdp / 3000, 0.3) * 0.6 + (neighborsLand(c.id).includes(t.id) ? 0.35 : 0) + (c.ai.sphere.includes(t.id) ? 0.4 : 0) + tradeShare(world, c.id, t.id) * 4;
}

function diplomaticCandidates(world: World, c: Country, out: Candidate[]) {
  const pers = personalityOf(c.ai.personality);
  const P = pers.priorities;
  const isRich = gdppc(c) > 22000;
  const myTreaties = world.treaties.filter((x) => x.parties.includes(c.id) && x.type !== 'aid').length;
  for (const t of relevantTargets(world, c)) {
    const op = relOp(world, c.id, t.id);
    const imp = importance(world, c, t);
    const rival = c.ai.rivals.includes(t.id);
    const share = tradeShare(world, c.id, t.id);
    const sanctioning = world.sanctions.find((s) => s.by === c.id && s.target === t.id)?.level ?? 0;
    const atWarWith = isAtWarWith(world, c.id, t.id);
    const push = (id: string, factors: Factor[], text: string, params?: Record<string, number | string>) => {
      const def = ACTION_BY_ID[id];
      if (!def) return;
      const ttype = def.handler === 'treaty' ? String(def.params?.type) : null;
      if (ttype) {
        const same = world.treaties.filter((x) => x.type === ttype && x.parties.includes(c.id)).length;
        factors.push({ label: 'saturación de tratados', value: -same * 0.55 - Math.max(0, myTreaties - 6) * 0.2 });
      }
      out.push({ def, ctx: { actor: c, target: t, params, silent: true }, utility: factors.reduce((a, x) => a + x.value, 0), factors, text });
    };
    if (atWarWith) continue;
    // Mejorar relaciones
    if (!rival || c.ai.pragmatism > 0.7) {
      push('visita_diplomatica', [
        { label: 'importancia del país', value: imp * 0.8 },
        { label: 'margen de mejora', value: (1 - Math.abs(op - 30) / 100) * 0.3 },
        { label: 'pragmatismo', value: c.ai.pragmatism * 0.3 },
        { label: 'rivalidad', value: rival ? -0.6 : 0 },
        { label: 'hostilidad', value: op < -50 ? -0.4 : 0 },
      ], `mejorar relaciones con ${t.name}`);
    }
    // Acuerdo comercial
    if (!hasTreaty(world, c.id, t.id, 'trade') && op > 5 && !sanctioning && !rival && share > 0.015) {
      push('acuerdo_comercial', [
        { label: 'comercio bilateral', value: Math.min(1.2, share * 15) },
        { label: 'prioridad económica', value: (P.economy ?? 1) * 0.35 },
        { label: 'buena relación', value: op / 120 },
        { label: 'pragmatismo', value: c.ai.pragmatism * 0.3 },
        { label: 'coste de negociación', value: -0.75 },
      ], `firmar un acuerdo comercial con ${t.name}`);
    }
    // Alianza
    if (!allied(world, c.id, t.id) && op > 40 && relTrust(world, c.id, t.id) > 55) {
      const ct = commonThreat(world, c, t);
      push('alianza', [
        { label: 'amenaza común', value: ct * 1.4 * (P.security ?? 1) },
        { label: 'amenaza máxima percibida', value: (c.ai.threat.max ?? 0) > 0.5 ? 0.35 : 0 },
        { label: 'riesgo de arrastre', value: atWar(world, t.id) ? -c.ai.riskAversion * 1.2 : 0 },
        { label: 'coste base', value: -0.55 },
      ], `proponer una alianza a ${t.name}`);
    }
    // Pacto de no agresión
    if (!hasTreaty(world, c.id, t.id, 'nonaggression') && op < 5 && op > -60 && neighborsLand(c.id).includes(t.id) && t.mil.power > c.mil.power * 0.7) {
      push('pacto_no_agresion', [
        { label: 'vecino poderoso', value: 0.4 + c.ai.riskAversion * 0.5 },
        { label: 'ambición territorial', value: c.ai.claims.includes(t.id) ? -1.5 : -c.ai.aggression * 0.6 },
      ], `asegurar la frontera con ${t.name}`);
    }
    // Cooperación tecnológica
    if (!hasTreaty(world, c.id, t.id, 'cooperation') && op > 35 && t.tech.level > c.tech.level + 5) {
      push('cooperacion_tecnologica', [{ label: 'brecha tecnológica', value: (t.tech.level - c.tech.level) / 30 }, { label: 'relación', value: op / 150 }, { label: 'coste', value: -0.7 }], `cooperar en tecnología con ${t.name}`);
    }
    // Acuerdo energético
    const iImp = c.res.oil.cons > c.res.oil.prod * 1.2 || c.res.gas.cons > c.res.gas.prod * 1.2;
    const tExp = t.res.oil.prod > t.res.oil.cons * 1.2 || t.res.gas.prod > t.res.gas.cons * 1.2;
    if (iImp && tExp && op > 15 && !hasTreaty(world, c.id, t.id, 'energy')) {
      push('acuerdo_energetico', [{ label: 'dependencia energética', value: 0.5 + (world.market.price.oil / world.market.base.oil - 1) }, { label: 'relación', value: op / 150 }, { label: 'coste', value: -0.5 }], `asegurar energía de ${t.name}`);
    }
    // Ayuda exterior
    if (isRich && op > 25 && (gdppc(t) < 8000 || t.regions.some((r) => r.damage > 10) || (atWar(world, t.id) && allied(world, c.id, t.id)))) {
      push('ayuda_exterior', [
        { label: 'amistad', value: op / 120 }, { label: 'necesidad del receptor', value: t.regions.some((r) => r.damage > 10) ? 0.5 : 0.15 },
        { label: 'aliado en guerra', value: atWar(world, t.id) && allied(world, c.id, t.id) ? 0.6 : 0 }, { label: 'influencia', value: (P.influence ?? 1) * 0.15 },
        { label: 'coste', value: -0.35 },
      ], `ayudar a ${t.name}`);
    }
    // Sanciones
    if (op < -45 && sanctioning < 3) {
      const redline = world.incidents.some((i) => i.actor === t.id && (i.target === c.id || c.ai.sphere.includes(i.target) || allied(world, c.id, i.target)) && world.turn - i.turn < 6 && i.magnitude >= 2);
      push('sancionar', [
        { label: 'hostilidad', value: (-op - 45) / 45 },
        { label: 'agresividad', value: c.ai.aggression * 0.7 },
        { label: 'provocación reciente', value: redline ? 1.0 : 0 },
        { label: 'coste comercial', value: -share * 18 * c.ai.pragmatism },
        { label: 'riesgo de represalia', value: t.eco.gdp > c.eco.gdp ? -c.ai.riskAversion * 0.6 : 0 },
        { label: 'ya sancionado', value: sanctioning ? -0.4 * sanctioning : 0 },
        { label: 'coste base', value: -0.7 },
      ], `sancionar a ${t.name}`, { level: Math.min(3, sanctioning + 1) });
    }
    // Levantar sanciones
    if (sanctioning > 0 && op > -25) {
      push('levantar_sanciones', [{ label: 'relación mejorada', value: (op + 25) / 40 }, { label: 'pragmatismo', value: c.ai.pragmatism * 0.5 }, { label: 'coste comercial', value: share * 10 }, { label: 'agresividad', value: -c.ai.aggression * 0.5 }], `levantar las sanciones a ${t.name}`);
    }
    // Romper tratados con quien se ha vuelto hostil
    if (op < -25 && world.treaties.some((x) => x.type !== 'aid' && x.type !== 'ceasefire' && x.parties.includes(c.id) && x.parties.includes(t.id))) {
      push('romper_tratado', [{ label: 'hostilidad', value: (-op - 25) / 30 }, { label: 'fiabilidad', value: -(c.ai.reliability) * 1.2 }, { label: 'coste reputacional', value: -0.3 }], `romper los tratados con ${t.name}`);
    }
  }
}

function domesticCandidates(world: World, c: Country, out: Candidate[]) {
  const r = resolver(world, c);
  for (const def of ACTIONS) {
    if (!def.ai?.utility || !['ley', 'economia', 'social', 'gobierno'].includes(def.category)) continue;
    if (def.params?.law && c.pol.flags[def.id]) continue;
    const u = evalExpr(def.ai.utility, r);
    if (u < 0.3) continue;
    out.push({ def, ctx: { actor: c, silent: true }, utility: u, factors: [{ label: 'necesidad interna', value: u }], text: def.name.toLowerCase() });
  }
}

/** Turno de decisión de un país IA. */
export function aiDecide(world: World, c: Country, rng: Rng) {
  updateThreats(world, c);
  const cands: Candidate[] = [];
  domesticCandidates(world, c, cands);
  diplomaticCandidates(world, c, cands);
  for (const g of GENERATORS) g(world, c, rng, cands);
  const diff = world.player?.difficulty;
  for (const cd of cands) {
    cd.utility += rng.normal() * 0.25;
    if (cd.ctx.target && world.player?.country === cd.ctx.target.id && ['sancionar', 'ultimatum', 'aranceles'].includes(cd.def.id)) {
      cd.utility *= diff === 'facil' ? 0.7 : diff === 'dificil' ? 1.25 : 1;
    }
  }
  cands.sort((a, b) => b.utility - a.utility);
  let done = 0;
  const maxActions = c.eco.gdp > 2000 ? 3 : 2;
  for (const cd of cands) {
    if (done >= maxActions) break;
    if (cd.utility < 0.75) break;
    const pv = previewAction(world, cd.def, cd.ctx);
    if (!pv.ok) continue;
    const res = executeAction(world, cd.def, cd.ctx);
    if (!res.ok) continue;
    done++;
    if (['visita_diplomatica', 'cumbre'].includes(cd.def.id) && cd.ctx.target && world.player?.country !== cd.ctx.target.id) continue;
    logDecision(world, {
      turn: world.turn, actor: c.id, action: cd.def.id, target: cd.ctx.target?.id, score: Math.round(cd.utility * 100) / 100,
      accepted: res.passed, text: `${c.name} decide ${cd.text}${res.passed ? '' : ' (fracasa)'}`, reasons: fmtReasons(cd.factors, 3),
    });
  }
}

// ---------- Reacciones a incidentes ----------

const AGGRESSIVE = new Set(['sancion', 'amenaza', 'aranceles', 'ruptura', 'insulto', 'espionaje', 'guerra', 'bloqueo', 'maniobras']);

/** Puntuación de amenaza de un actor según sus incidentes agresivos recientes. */
export function aggressionScore(world: World, actor: Id): number {
  let s = 0;
  for (const i of world.incidents) if (i.actor === actor && AGGRESSIVE.has(i.kind) && world.turn - i.turn < 24) s += i.magnitude * (i.kind === 'guerra' ? 3 : 1);
  return s;
}

function react(world: World, rng: Rng) {
  const fresh = world.incidents.filter((i) => !i.processed);
  for (const inc of fresh) {
    inc.processed = true;
    const actor = world.countries[inc.actor], target = world.countries[inc.target];
    if (!actor?.alive || !target?.alive) continue;
    // Solidaridad de los aliados de la víctima
    for (const id of world.order) {
      if (id === actor.id || id === target.id) continue;
      const ally = world.countries[id];
      if (!allied(world, id, target.id) && !(ally.ai.sphere.includes(target.id))) continue;
      const r = world.rel[id]?.[actor.id];
      if (r && AGGRESSIVE.has(inc.kind)) r.op = clamp(r.op - inc.magnitude * 3, -100, 100);
    }
    if (world.player?.country === target.id || !AGGRESSIVE.has(inc.kind)) continue;
    // Respuesta del afectado
    const p = target.ai;
    const op = relOp(world, target.id, actor.id);
    const factors: Factor[] = [
      { label: 'agresividad', value: p.aggression },
      { label: 'gravedad del agravio', value: inc.magnitude * 0.3 },
      { label: 'relación', value: -op / 100 },
      { label: 'poder relativo', value: clamp(Math.log10(Math.max(10, target.mil.power) / Math.max(10, actor.mil.power)), -1, 1) * 0.4 },
      { label: 'coste comercial', value: -tradeShare(world, target.id, actor.id) * 12 * p.pragmatism },
    ];
    const u = factors.reduce((a, x) => a + x.value, 0) + rng.normal() * 0.2;
    if (inc.kind === 'sancion' || inc.kind === 'aranceles') {
      if (u > 0.55) {
        if (inc.kind === 'sancion') {
          const cur = world.sanctions.find((s) => s.by === target.id && s.target === actor.id)?.level ?? 0;
          setSanction(world, target, actor, Math.min(3, Math.max(cur, inc.magnitude)));
        } else {
          (world.tariffs[target.id] ??= {})[actor.id] = Math.max(world.tariffs[target.id]?.[actor.id] ?? 0, 25);
          bumpRev(world);
          remember(world, actor, target.id, 'aranceles');
          news(world, `↩ ${target.name} responde con aranceles a ${actor.name}.`, 'diplomacia', [target.id, actor.id], 1);
        }
        logDecision(world, { turn: world.turn, actor: target.id, action: 'represalia', target: actor.id, score: u, text: `${target.name} responde con represalias a ${actor.name}`, reasons: fmtReasons(factors, 3) });
      } else {
        logDecision(world, { turn: world.turn, actor: target.id, action: 'contencion', target: actor.id, score: u, text: `${target.name} no responde a ${actor.name}, por ahora`, reasons: fmtReasons(factors, 3) });
      }
    } else if (inc.kind === 'amenaza' || inc.kind === 'maniobras') {
      target.ai.targetDefense = Math.max(target.ai.targetDefense, target.eco.budget.defense + 0.5);
      // Acercamiento a los rivales del agresor
      const rivalOfActor = world.order.map((id) => world.countries[id]).filter((x) => x.alive && x.id !== target.id && x.id !== actor.id && relOp(world, x.id, actor.id) < -30)
        .sort((a, b) => b.mil.power - a.mil.power)[0];
      if (rivalOfActor) {
        const r1 = world.rel[target.id][rivalOfActor.id], r2 = world.rel[rivalOfActor.id][target.id];
        r1.op = clamp(r1.op + 6, -100, 100); r2.op = clamp(r2.op + 6, -100, 100);
        logDecision(world, { turn: world.turn, actor: target.id, action: 'acercamiento', target: rivalOfActor.id, score: u, text: `${target.name} se acerca a ${rivalOfActor.name} tras las amenazas de ${actor.name}`, reasons: fmtReasons(factors, 3) });
      }
    } else if (inc.kind === 'espionaje' && u > 0.3) {
      remember(world, target, actor.id, 'espionaje');
      actor.intel.networks[target.id] = (actor.intel.networks[target.id] ?? 0) * 0.5;
      news(world, `🕵 ${target.name} expulsa a diplomáticos de ${actor.name} acusados de espionaje.`, 'inteligencia', [target.id, actor.id], 1);
    }
  }
  world.incidents = world.incidents.filter((i) => world.turn - i.turn < 24);
}

/** Coaliciones de contrapeso frente a un país que acumula agresiones (sea el jugador o la IA). */
function counterbalance(world: World, rng: Rng) {
  if (world.turn % 3 !== 0) return;
  for (const id of world.order) {
    const a = world.countries[id];
    if (!a.alive) continue;
    const score = aggressionScore(world, id);
    if (score < 8) continue;
    if ((world.eventCooldowns[`coalicion:${id}`] ?? -1) > world.turn) continue;
    const threatened = world.order.map((x) => world.countries[x]).filter((c) => c.alive && c.id !== id && world.player?.country !== c.id
      && relOp(world, c.id, id) < -30 && (c.ai.threat[id] ?? 0) > 0.25 && !allied(world, c.id, id))
      .sort((x, y) => (y.ai.threat[id] ?? 0) - (x.ai.threat[id] ?? 0)).slice(0, 4);
    if (threatened.length < 2) continue;
    let made = 0;
    for (let i = 0; i < threatened.length; i++) for (let j = i + 1; j < threatened.length; j++) {
      const x = threatened[i], y = threatened[j];
      if (allied(world, x.id, y.id) || relOp(world, x.id, y.id) < -10) continue;
      const t = signTreaty(world, 'defense', x, y, 120);
      t.name = `Coalición de contrapeso frente a ${a.short} (${x.short}–${y.short})`;
      made++;
    }
    if (made) {
      world.eventCooldowns[`coalicion:${id}`] = world.turn + 36;
      news(world, `🛡 Se forma una coalición de contrapeso frente a ${a.name}: ${threatened.map((c) => c.short).join(', ')}.`, 'diplomacia', [id, ...threatened.map((c) => c.id)], 3);
      for (const c of threatened) logDecision(world, { turn: world.turn, actor: c.id, action: 'coalicion', target: id, score, text: `${c.name} se une a una coalición contra ${a.name}`, reasons: [`agresiones recientes de ${a.short} (${score.toFixed(0)})`, `amenaza percibida (${(c.ai.threat[id] ?? 0).toFixed(2)})`] });
    }
  }
  void rng;
}

export function aiTurn(world: World) {
  if (world.forecast) return;
  const rng = rngOf(world);
  for (const id of world.order) {
    const c = world.countries[id];
    if (!c.alive || world.player?.country === id) {
      if (c.alive) updateThreats(world, c);
      continue;
    }
    aiDecide(world, c, rng);
  }
  react(world, rng);
  counterbalance(world, rng);
  world.rng = rng.state;
}

export { TREATY_NAMES, sanctionLevelOn };
