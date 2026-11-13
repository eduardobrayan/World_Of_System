/**
 * Motor genérico de acciones (jugador e IA), definido en actions.json:
 *   requisitos → costes → efectos inmediatos → efectos retardados → modificadores con duración.
 * Las mecánicas especiales (tratados, guerra, operaciones…) se conectan como "handlers".
 */
import type { ActionDef, Country, Dict, EffectDef, GroupId, Id, ModifierDef, World } from './types';
import { GROUPS } from './types';
import { evalExpr } from './expr';
import { resolver } from './vars';
import { addModifier, applyEffects, removeModifier, schedule, fillTemplate } from './effects';
import { forecastVote, type Lean, type VoteForecast } from './parliament';
import { DATA, regimeOf } from './data';
import { clamp, news, rngOf, timeline } from './util';
import actionsJson from '../data/actions.json';

export const ACTIONS: ActionDef[] = actionsJson as unknown as ActionDef[];
export const ACTION_BY_ID: Dict<ActionDef> = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));

export interface ActionCtx {
  actor: Country;
  target?: Country;
  regionId?: string;
  params?: Dict<number | string>;
  silent?: boolean; // IA: sin noticias triviales
}

export interface EffectLine { when: string; text: string; value?: number; good?: boolean; hidden?: boolean }

export interface ActionPreview {
  ok: boolean;
  unmet: string[];
  met: string[];
  ap: number;
  money: number;
  vote: VoteForecast | null;
  lines: EffectLine[];
  groups: { group: GroupId; name: string; delta: number }[];
  risks: string[];
  extra: string[]; // información adicional del handler (p. ej. probabilidad de aceptación)
}

export interface ActionResult { ok: boolean; passed: boolean; text: string }

export interface Handler {
  validate?: (world: World, def: ActionDef, ctx: ActionCtx) => string | null;
  preview?: (world: World, def: ActionDef, ctx: ActionCtx, p: ActionPreview) => void;
  apply: (world: World, def: ActionDef, ctx: ActionCtx) => ActionResult;
  lean?: (world: World, def: ActionDef, ctx: ActionCtx) => Lean;
}

const HANDLERS: Dict<Handler> = {};
export function registerHandler(name: string, h: Handler) {
  HANDLERS[name] = h;
}

// ---------- Nombres legibles de rutas y modificadores ----------
export const PATH_NAMES: Dict<string> = {
  'eco.inflation': 'Inflación', 'eco.unemployment': 'Desempleo', 'eco.growth': 'Crecimiento', 'eco.currency': 'Moneda',
  'eco.reserves': 'Reservas', 'eco.investment': 'Inversión', 'eco.infra': 'Infraestructuras', 'eco.policyRate': 'Tipo de interés',
  'soc.education': 'Educación', 'soc.health': 'Sanidad', 'soc.gini': 'Desigualdad', 'soc.protest': 'Protestas', 'soc.strikes': 'Huelgas',
  'soc.trust': 'Confianza institucional', 'soc.satisfaction': 'Satisfacción', 'pol.stability': 'Estabilidad', 'pol.legitimacy': 'Legitimidad',
  'pol.corruption': 'Corrupción', 'pol.pressFreedom': 'Libertad de prensa', 'pol.repression': 'Represión', 'pol.ap': 'Capital político',
  'pol.warWeariness': 'Cansancio de guerra', 'mil.morale': 'Moral', 'mil.readiness': 'Preparación', 'mil.tech': 'Tecnología militar',
  'intel.level': 'Inteligencia', 'intel.counter': 'Contrainteligencia', 'tech.level': 'Nivel tecnológico', 'tech.renewables': 'Energía limpia',
  reputation: 'Reputación', 'groups.all': 'Apoyo de todos los grupos', 'tech.progress': 'Progreso de la investigación (puntos)',
  'eco.riskPremium': 'Prima de riesgo', 'eco.defaulted': 'Impago soberano', 'eco.defaults': 'Impagos', 'pol.emergency': 'Estado de emergencia (meses)',
  'soc.refugees': 'Refugiados (millones)', 'policy.energia': 'Sector energético (nivel)', 'res.oil.prod': 'Producción de petróleo',
  'res.oil.baseProd': 'Capacidad petrolera', 'res.minerals.prod': 'Producción de minerales', 'res.minerals.baseProd': 'Capacidad minera',
  'budget.defense': 'Presupuesto de defensa (% PIB)', 'budget.education': 'Presupuesto de educación (% PIB)', 'budget.health': 'Presupuesto de sanidad (% PIB)',
  'budget.pensions': 'Pensiones (% PIB)', 'budget.social': 'Protección social (% PIB)', 'budget.infrastructure': 'Infraestructuras (% PIB)',
  'budget.research': 'Investigación (% PIB)', 'budget.security': 'Seguridad interior (% PIB)', 'budget.administration': 'Administración (% PIB)',
  'budget.subsidies': 'Subvenciones (% PIB)', 'taxes.income': 'IRPF', 'taxes.corporate': 'Impuesto de sociedades', 'taxes.consumption': 'IVA',
  'taxes.tariff': 'Aranceles',
  'bio.defense': 'Defensa biológica', 'bio.lab': 'Seguridad de los laboratorios', 'bio.program': 'Programa de armas biológicas',
};
for (const g of GROUPS) PATH_NAMES[`groups.${g}`] = `Apoyo de ${DATA.groups[g].name.toLowerCase()}`;
for (const k of Object.keys(DATA.groups)) PATH_NAMES[`groups.${k}`] ??= k;

export const MOD_NAMES: Dict<string> = {
  growth: 'Crecimiento', potentialGrowth: 'Crecimiento potencial', inflation: 'Inflación', naturalUnemployment: 'Desempleo estructural',
  unemployment: 'Desempleo', stability: 'Estabilidad', protest: 'Protestas', strikes: 'Huelgas', corruption: 'Corrupción', education: 'Educación',
  health: 'Sanidad', gini: 'Desigualdad', migration: 'Migración', birth: 'Natalidad', death: 'Mortalidad', investment: 'Inversión',
  taxEfficiency: 'Recaudación', militaryPower: 'Poder militar', morale: 'Moral', readiness: 'Preparación', legitimacy: 'Legitimidad',
  trust: 'Confianza', satisfaction: 'Satisfacción', pressFreedom: 'Libertad de prensa', coupRisk: 'Riesgo de golpe', revolutionRisk: 'Riesgo de revolución',
  research: 'Investigación', renewablesGrowth: 'Transición energética', exports: 'Exportaciones', currency: 'Moneda', infra: 'Infraestructuras',
  resourceShare: 'Renta estatal de recursos', ap: 'Capital político/mes', intel: 'Inteligencia', counter: 'Contrainteligencia', milTech: 'Tecnología militar',
  'group.all': 'Apoyo de todos los grupos', 'prod.food': 'Producción de alimentos', logistics: 'Logística', 'sector.industry': 'Peso de la industria',
  'sector.tech': 'Peso tecnológico',
  crime: 'Criminalidad', 'police.training': 'Formación policial', 'police.militarization': 'Militarización policial',
  'narco.cartels': 'Poder de los cárteles', 'narco.production': 'Producción de droga', 'narco.transit': 'Tránsito de droga',
  'narco.violence': 'Violencia del narco', 'narco.consumption': 'Consumo de drogas',
  'corr.politica': 'Corrupción política', 'corr.administrativa': 'Corrupción administrativa', 'corr.judicial': 'Corrupción judicial',
  'corr.policial': 'Corrupción policial', 'corr.empresarial': 'Corrupción empresarial', 'corr.electoral': 'Corrupción electoral',
  'need.vivienda': 'Vivienda', pandemicSpread: 'Contagio de epidemias', pandemicResist: 'Resistencia a epidemias', disasterResist: 'Resistencia a desastres',
  nuclearDefense: 'Defensa antimisiles', 'capacity.oil': 'Capacidad petrolera', 'capacity.gas': 'Capacidad gasística', 'capacity.chips': 'Capacidad de chips',
  'capacity.minerals': 'Capacidad minera',
};
for (const g of GROUPS) MOD_NAMES[`group.${g}`] = `Apoyo de ${DATA.groups[g].name.toLowerCase()}`;

/** Indica si subir esta variable es bueno para el país (para colorear previsiones). */
const BAD_UP = new Set(['eco.riskPremium', 'taxes.income', 'taxes.corporate', 'taxes.consumption', 'inflation', 'unemployment', 'naturalUnemployment', 'protest', 'strikes', 'corruption', 'gini', 'death', 'coupRisk', 'revolutionRisk',
  'eco.inflation', 'eco.unemployment', 'soc.protest', 'soc.strikes', 'soc.gini', 'pol.corruption', 'pol.repression', 'pol.warWeariness',
  'crime', 'narco.cartels', 'narco.production', 'narco.transit', 'narco.violence', 'narco.consumption', 'pandemicSpread',
  'corr.politica', 'corr.administrativa', 'corr.judicial', 'corr.policial', 'corr.empresarial', 'corr.electoral']);

function sign(v: number, d = 1) {
  return `${v >= 0 ? '+' : ''}${Math.abs(v) < 0.1 && v !== 0 ? v.toFixed(2) : v.toFixed(d)}`;
}

function describeEffects(world: World, c: Country, effects: EffectDef[] | undefined, when: string, target: Country | undefined, out: EffectLine[], who = '') {
  if (!effects) return;
  const r = resolver(world, c, target);
  for (const e of effects) {
    if (e.type) {
      const v = evalExpr(e.value ?? e.add ?? 0, r);
      let text = '';
      switch (e.type) {
        case 'relation': text = `${e.target === 'all' ? 'Opinión mundial' : `Opinión de ${target?.short ?? 'el objetivo'}`} sobre ${c.short}: ${sign(v, 0)}`; break;
        case 'opinion': text = `Opinión de ${c.short} sobre ${target?.short ?? 'el objetivo'}: ${sign(v, 0)}`; break;
        case 'treasury': text = `Tesoro: ${v >= 0 ? '+' : ''}${v.toFixed(1)} mil millones $`; break;
        case 'gdp': text = `PIB: ${sign(v)} %`; break;
        case 'tension': text = `Tensión mundial: ${sign(v, 0)}`; break;
        case 'price': text = `Precio de ${e.id === 'oil' ? 'petróleo' : e.id === 'gas' ? 'gas' : e.id === 'food' ? 'alimentos' : e.id === 'chips' ? 'chips' : 'minerales'}: ${sign(v, 0)} %`; break;
        case 'pop': text = `Población: ${sign(v, 2)} %`; break;
        case 'units': text = `Fuerzas armadas: ${sign(v, 0)} %`; break;
        case 'damage': text = `Daños en las regiones: ${sign(v, 0)}`; break;
        case 'memory': text = `${target?.short ?? 'El objetivo'} lo recordará (${v >= 0 ? 'favor' : 'agravio'})`; break;
        case 'event': text = 'Puede desencadenar nuevos acontecimientos'; break;
        case 'news': continue;
        default: continue;
      }
      out.push({ when, text: who + text, value: v, hidden: e.hidden });
      continue;
    }
    if (!e.path || e.path.startsWith('flags.')) continue; // marcas internas: no se muestran
    const name = PATH_NAMES[e.path] ?? e.path;
    if (e.add !== undefined) {
      const v = evalExpr(e.add, r);
      out.push({ when, text: `${who}${name}: ${sign(v)}`, value: v, good: BAD_UP.has(e.path) ? v < 0 : v > 0, hidden: e.hidden });
    } else if (e.mul !== undefined) {
      const v = evalExpr(e.mul, r);
      out.push({ when, text: `${who}${name}: ×${v.toFixed(2)}`, value: v, good: BAD_UP.has(e.path) ? v < 1 : v > 1, hidden: e.hidden });
    } else if (e.set !== undefined) {
      const v = evalExpr(e.set, r);
      out.push({ when, text: `${who}${name} = ${v.toFixed(1)}`, value: v, hidden: e.hidden });
    }
  }
}

export function describeModifiers(world: World, c: Country, mods: ModifierDef[] | undefined, out: EffectLine[], target?: Country, prefix = '') {
  if (!mods) return;
  const r = resolver(world, c, target);
  for (const m of mods) {
    const dur = m.duration < 0 ? 'permanente' : `${m.duration} meses`;
    for (const [k, vv] of Object.entries(m.mods)) {
      const v = evalExpr(vv, r);
      if (!v) continue;
      out.push({ when: `${prefix}${dur}`, text: `${MOD_NAMES[k] ?? k}: ${sign(v, 2)}`, value: v, good: BAD_UP.has(k) ? v < 0 : v > 0 });
    }
  }
}

export function checkRequirements(world: World, def: ActionDef, ctx: ActionCtx): { met: string[]; unmet: string[] } {
  const met: string[] = [], unmet: string[] = [];
  const c = ctx.actor;
  const r = resolver(world, c, ctx.target);
  for (const req of def.requires ?? []) (evalExpr(req.expr, r) ? met : unmet).push(req.text);
  if (def.targetRequires && ctx.target) for (const req of def.targetRequires) (evalExpr(req.expr, r) ? met : unmet).push(req.text);
  if (def.target === 'foreign' && !ctx.target) unmet.push('Elige un país objetivo');
  if (def.target === 'foreign' && ctx.target && (ctx.target.id === c.id || !ctx.target.alive)) unmet.push('Objetivo no válido');
  if (def.regimes && !def.regimes.includes(c.pol.regime)) unmet.push(`Solo para: ${def.regimes.map((x) => regimeOf(x).name).join(', ')}`);
  const cd = c.pol.cooldowns[def.id + (ctx.target ? `:${ctx.target.id}` : '')] ?? -1;
  if (cd > world.turn) unmet.push(`Disponible de nuevo en ${cd - world.turn} meses`);
  if (def.handler && HANDLERS[def.handler]?.validate) {
    const why = HANDLERS[def.handler].validate!(world, def, ctx);
    if (why) unmet.push(why);
  }
  return { met, unmet };
}

export function actionCost(world: World, def: ActionDef, ctx: ActionCtx): { ap: number; money: number } {
  const r = resolver(world, ctx.actor, ctx.target, ctx.params as Record<string, number> | undefined);
  return { ap: evalExpr(def.cost.ap ?? 0, r), money: evalExpr(def.cost.money ?? 0, r) };
}

function leanOf(world: World, def: ActionDef, ctx: ActionCtx): Lean {
  if (def.handler && HANDLERS[def.handler]?.lean) return HANDLERS[def.handler].lean!(world, def, ctx);
  const p = def.params ?? {};
  return { econ: Number(p.econ ?? 0), auth: Number(p.auth ?? 0) };
}

export function needsParliament(def: ActionDef, c: Country): boolean {
  return !!def.parliament && regimeOf(c.pol.regime).parliament;
}

export function previewAction(world: World, def: ActionDef, ctx: ActionCtx): ActionPreview {
  const c = ctx.actor;
  const { met, unmet } = checkRequirements(world, def, ctx);
  const cost = actionCost(world, def, ctx);
  if (c.pol.ap < cost.ap) unmet.push(`Capital político insuficiente (${c.pol.ap.toFixed(1)}/${cost.ap})`);
  const lines: EffectLine[] = [];
  describeEffects(world, c, def.effects, 'inmediato', ctx.target, lines);
  if (ctx.target) describeEffects(world, ctx.target, def.targetEffects, 'inmediato', c, lines, `${ctx.target.short} · `);
  for (const d of def.delayed ?? []) {
    describeEffects(world, c, d.effects, `en ${d.in} meses`, ctx.target, lines);
    describeModifiers(world, c, d.mods, lines, ctx.target, `desde el mes ${d.in}, `);
  }
  describeModifiers(world, c, def.modifiers, lines, ctx.target);
  const groups = GROUPS.filter((g) => def.groups?.[g]).map((g) => ({ group: g, name: DATA.groups[g].name, delta: def.groups![g]! }));
  const vote = needsParliament(def, c) ? forecastVote(world, c, leanOf(world, def, ctx)) : null;
  const p: ActionPreview = { ok: unmet.length === 0, unmet, met, ap: cost.ap, money: cost.money, vote, lines, groups, risks: [...(def.risks ?? [])], extra: [] };
  if (def.handler && HANDLERS[def.handler]?.preview) HANDLERS[def.handler].preview!(world, def, ctx, p);
  return p;
}

/** Ejecuta una acción: comprueba requisitos, cobra costes, vota y aplica efectos. */
export function executeAction(world: World, def: ActionDef, ctx: ActionCtx): ActionResult {
  const c = ctx.actor;
  const pv = previewAction(world, def, ctx);
  if (!pv.ok) return { ok: false, passed: false, text: pv.unmet.join(' · ') };
  c.pol.ap = clamp(c.pol.ap - pv.ap, 0, 20);
  if (pv.money) c.eco.debt = Math.max(0, c.eco.debt + pv.money);
  if (def.cooldown) c.pol.cooldowns[def.id + (ctx.target ? `:${ctx.target.id}` : '')] = world.turn + def.cooldown;
  if (pv.vote) {
    const rng = rngOf(world);
    const passed = rng.next() < pv.vote.prob;
    world.rng = rng.state;
    if (!passed) {
      c.pol.legitimacy = clamp(c.pol.legitimacy - 1.5, 0, 100);
      news(world, `El parlamento de ${c.name} rechaza «${def.name}».`, 'politica', [c.id], world.player?.country === c.id ? 2 : 1);
      if (world.player?.country === c.id) timeline(world, `Rechazada en el parlamento: ${def.name}`, 'politica');
      return { ok: true, passed: false, text: `El parlamento ha rechazado «${def.name}». Has perdido el capital político invertido.` };
    }
  }
  let text = `${def.name}: aprobado.`;
  if (def.handler) {
    const h = HANDLERS[def.handler];
    if (!h) return { ok: false, passed: false, text: `Mecánica desconocida: ${def.handler}` };
    const res = h.apply(world, def, ctx);
    if (!res.ok || !res.passed) return res;
    text = res.text;
  }
  applyStandard(world, def, ctx);
  if (world.player?.country === c.id) timeline(world, `${def.name}${ctx.target ? ` (${ctx.target.name})` : ''}`, def.category);
  return { ok: true, passed: true, text };
}

/** Aplica la parte estándar (datos) de una acción. */
export function applyStandard(world: World, def: ActionDef, ctx: ActionCtx) {
  const c = ctx.actor;
  const src = `accion:${def.id}`;
  applyEffects(world, c, def.effects, { source: src, target: ctx.target });
  if (ctx.target && def.targetEffects) applyEffects(world, ctx.target, def.targetEffects, { source: src, target: c });
  for (const g of GROUPS) if (def.groups?.[g]) c.groups[g].support = clamp(c.groups[g].support + def.groups[g]!, 0, 100);
  for (const m of def.modifiers ?? []) {
    if (m.target === 'target' && ctx.target) addModifier(world, ctx.target, m, src, c);
    else addModifier(world, c, m, src, ctx.target);
  }
  for (const d of def.delayed ?? []) schedule(world, c, d.in, d.effects, src, d.mods, d.text, ctx.target?.id);
  if (def.params?.law) c.pol.flags[def.id] = 1;
  if (def.incident && ctx.target) {
    world.incidents.push({ turn: world.turn, actor: c.id, target: ctx.target.id, kind: def.incident.kind, magnitude: def.incident.magnitude, text: def.name });
  }
  const newsText = def.params?.news ? fillTemplate(String(def.params.news), world, c, { source: src, target: ctx.target }) : null;
  if (newsText && !ctx.silent) news(world, newsText, def.category, [c.id, ...(ctx.target ? [ctx.target.id] : [])], Number(def.params?.importance ?? 1));
}

/** Deroga una ley: elimina sus modificadores permanentes y revierte parte de la reacción de los grupos. */
export function repealLaw(world: World, c: Country, id: string): ActionResult {
  const def = ACTION_BY_ID[id];
  if (!def || !c.pol.flags[id]) return { ok: false, passed: false, text: 'La ley no está en vigor.' };
  const ap = Math.max(1, Math.ceil(evalExpr(def.cost.ap ?? 1, resolver(world, c)) / 2));
  if (c.pol.ap < ap) return { ok: false, passed: false, text: `Necesitas ${ap} de capital político.` };
  c.pol.ap -= ap;
  if (needsParliament(def, c)) {
    const lean = leanOf(world, def, { actor: c });
    const vote = forecastVote(world, c, { econ: -lean.econ, auth: -lean.auth });
    const rng = rngOf(world);
    const ok = rng.next() < vote.prob;
    world.rng = rng.state;
    if (!ok) return { ok: true, passed: false, text: 'El parlamento rechaza la derogación.' };
  }
  for (const m of def.modifiers ?? []) removeModifier(c, m.id);
  for (const g of GROUPS) if (def.groups?.[g]) c.groups[g].support = clamp(c.groups[g].support - def.groups[g]! * 0.5, 0, 100);
  c.pol.flags[id] = 0;
  news(world, `${c.name} deroga «${def.name}».`, 'politica', [c.id], 1);
  if (world.player?.country === c.id) timeline(world, `Derogada: ${def.name}`, 'politica');
  return { ok: true, passed: true, text: `Derogada: ${def.name}.` };
}

/** Acciones disponibles por categoría (para la interfaz y la IA). */
export function actionsIn(category: string): ActionDef[] {
  return ACTIONS.filter((a) => a.category === category && !a.hidden);
}

export function targetsFor(world: World, actor: Id): Country[] {
  return world.order.map((id) => world.countries[id]).filter((c) => c.alive && c.id !== actor);
}

/** Describe un conjunto de consecuencias (opción de evento, acción…) para la interfaz. */
export function describeBundle(world: World, c: Country, b: { effects?: EffectDef[]; delayed?: { in: number; effects: EffectDef[]; mods?: ModifierDef[] }[]; modifiers?: ModifierDef[]; groups?: Partial<Record<GroupId, number>> }, target?: Country): EffectLine[] {
  const lines: EffectLine[] = [];
  describeEffects(world, c, b.effects, 'inmediato', target, lines);
  for (const d of b.delayed ?? []) {
    describeEffects(world, c, d.effects, `en ${d.in} meses`, target, lines);
    describeModifiers(world, c, d.mods, lines, target, `desde el mes ${d.in}, `);
  }
  describeModifiers(world, c, b.modifiers, lines, target);
  for (const g of GROUPS) {
    const v = b.groups?.[g];
    if (v) lines.push({ when: 'inmediato', text: `Apoyo de ${DATA.groups[g].name.toLowerCase()}: ${v > 0 ? '+' : ''}${v}`, value: v, good: v > 0 });
  }
  return lines;
}
