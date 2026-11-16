/**
 * Misiones: el hilo que le dice al jugador qué hacer ahora y cómo seguir.
 *  - Siempre hay UNA misión en curso. Al cumplirla se cobra el premio (capital político y prestigio)
 *    y se asigna la siguiente.
 *  - Primero, tres misiones de aprendizaje («Primeros pasos»). Después, misiones que se eligen según
 *    lo que peor va en el país, el objetivo de la partida y lo que acaba de hacerse (para no repetir).
 *  - El prestigio acumulado da un rango (de «Recién llegado» a «Leyenda»): el progreso a largo plazo.
 * Todo es determinista y se guarda con la partida; la interfaz solo lo muestra.
 */
import type { ActionDef, Country, MissionRun, MissionState, World } from './types';
import missionsJson from '../data/missions.json';
import { gaugeValues } from './gauges';
import { allied, atWar } from './vars';
import { regimeOf } from './data';
import { clamp, news, timeline } from './util';

export type MissionCheck =
  | { kind: 'acts'; n: number; ids?: string[]; cats?: string[]; foreign?: boolean; tries?: boolean }
  | { kind: 'metric'; metric: string; delta: number; limit?: number }
  | { kind: 'election' }
  | { kind: 'peace' };

export interface MissionGo { kind: 'advice' | 'goal' | 'country' | 'tab' | 'local'; id?: string; pick?: 'trade' | 'ally'; hint?: string }

export interface MissionDef {
  id: string;
  stage: 'intro' | 'pool';
  icon: string;
  name: string;
  text: string;
  how: string;
  when?: { m: string; lt?: number; gt?: number }[];
  priority?: number;
  themes?: string[]; // objetivos de partida que la hacen más probable
  months?: number; // plazo; sin plazo si falta
  check: MissionCheck;
  go: MissionGo;
  rec?: string[]; // acciones recomendadas (se destacan con ⭐ en el catálogo)
  reward: { ap: number; prestige: number };
}

export const MISSIONS: MissionDef[] = missionsJson as MissionDef[];
export const MISSION_BY_ID: Record<string, MissionDef> = Object.fromEntries(MISSIONS.map((m) => [m.id, m]));
const INTRO = MISSIONS.filter((m) => m.stage === 'intro');
export const INTRO_COUNT = INTRO.length;

// ---------- Rangos ----------

export interface Rank { min: number; name: string; icon: string }
export const RANKS: Rank[] = [
  { min: 0, name: 'Recién llegado', icon: '🌱' },
  { min: 60, name: 'Gestor', icon: '🥉' },
  { min: 200, name: 'Líder respetado', icon: '🥈' },
  { min: 450, name: 'Estadista', icon: '🥇' },
  { min: 900, name: 'Leyenda', icon: '👑' },
];

export function rankOf(prestige: number): { index: number; rank: Rank; next: Rank | null; ratio: number } {
  let i = 0;
  while (i + 1 < RANKS.length && prestige >= RANKS[i + 1].min) i++;
  const next = RANKS[i + 1] ?? null;
  return { index: i, rank: RANKS[i], next, ratio: next ? clamp((prestige - RANKS[i].min) / (next.min - RANKS[i].min), 0, 1) : 1 };
}

// ---------- Indicadores que usan las misiones ----------

interface MetricDef { get: (w: World, c: Country) => number; digits: number; unit: string }

const tradeDeals = (w: World, c: Country) => w.treaties.filter((t) => t.type === 'trade' && t.parties.includes(c.id)).length;
const allyCount = (w: World, c: Country) => w.order.filter((id) => id !== c.id && w.countries[id].alive && allied(w, c.id, id)).length;
/** Edificios en pie más obras encargadas en regiones propias (encargar una obra ya cuenta). */
const buildingCount = (c: Country) => c.regions.reduce((a, r) => a + (r.owner === c.id ? Object.values(r.buildings).reduce((x, y) => x + y, 0) + r.queue.length : 0), 0);

export const METRICS: Record<string, MetricDef> = {
  'g.economia': { get: (w, c) => gaugeValues(w, c).economia, digits: 0, unit: '' },
  'g.felicidad': { get: (w, c) => gaugeValues(w, c).felicidad, digits: 0, unit: '' },
  'g.estabilidad': { get: (w, c) => gaugeValues(w, c).estabilidad, digits: 0, unit: '' },
  'g.seguridad': { get: (w, c) => gaugeValues(w, c).seguridad, digits: 0, unit: '' },
  'g.militar': { get: (w, c) => gaugeValues(w, c).militar, digits: 0, unit: '' },
  'g.relaciones': { get: (w, c) => gaugeValues(w, c).relaciones, digits: 0, unit: '' },
  approval: { get: (_w, c) => c.pol.approval, digits: 0, unit: ' %' },
  unemployment: { get: (_w, c) => c.eco.unemployment, digits: 1, unit: ' %' },
  inflation: { get: (_w, c) => c.eco.inflation, digits: 1, unit: ' %' },
  deficit: { get: (_w, c) => c.eco.deficit, digits: 1, unit: ' %' },
  growth: { get: (_w, c) => c.eco.growth, digits: 1, unit: ' %' },
  corruption: { get: (_w, c) => c.pol.corruption, digits: 0, unit: '' },
  crime: { get: (_w, c) => c.police.crime, digits: 0, unit: '' },
  cartels: { get: (_w, c) => c.narco.cartels, digits: 0, unit: '' },
  pressure: { get: (_w, c) => c.soc.pressure, digits: 0, unit: '' },
  trade: { get: tradeDeals, digits: 0, unit: '' },
  allies: { get: allyCount, digits: 0, unit: '' },
  techs: { get: (_w, c) => c.tech.done.length, digits: 0, unit: '' },
  buildings: { get: (_w, c) => buildingCount(c), digits: 0, unit: '' },
  war: { get: (w, c) => (atWar(w, c.id) ? 1 : 0), digits: 0, unit: '' },
  elects: { get: (_w, c) => (regimeOf(c.pol.regime).elections && c.pol.nextElection >= 0 ? 1 : 0), digits: 0, unit: '' },
  electionIn: { get: (w, c) => (regimeOf(c.pol.regime).elections && c.pol.nextElection >= 0 ? Math.max(0, c.pol.nextElection - w.turn) : 999), digits: 0, unit: '' },
};

const round = (v: number, digits: number) => { const k = 10 ** digits; return Math.round(v * k) / k; };

export function metricValue(world: World, c: Country, metric: string): number {
  const m = METRICS[metric];
  return m ? round(m.get(world, c), m.digits) : 0;
}

export function fmtMetric(metric: string, v: number): string {
  const m = METRICS[metric];
  return m ? `${v.toFixed(m.digits)}${m.unit}` : String(v);
}

// ---------- Estado ----------

export function newMissionState(): MissionState {
  return { current: null, log: [], prestige: 0, done: 0, acts: {} };
}

/** Estado de misiones del jugador (lo crea si la partida es anterior a las misiones). */
export function missionsOf(world: World): MissionState | null {
  const p = world.player;
  if (!p) return null;
  return (p.missions ??= newMissionState());
}

/**
 * La simulación avisa aquí de cada acción del jugador. `passed` es falso si el parlamento la tumbó:
 * cuenta como intento (claves `t` y `tf`), que es lo único que piden las dos primeras misiones.
 */
export function recordPlayerAction(world: World, def: ActionDef, foreign: boolean, passed = true) {
  const st = missionsOf(world);
  if (!st || world.forecast) return;
  const add = (k: string) => { st.acts[k] = (st.acts[k] ?? 0) + 1; };
  add('t');
  if (foreign) add('tf');
  if (!passed) return;
  add('n');
  add(`a:${def.id}`);
  add(`c:${def.category}`);
  if (foreign) add('f');
}

function actCount(st: MissionState, ch: Extract<MissionCheck, { kind: 'acts' }>): number {
  if (ch.ids) return ch.ids.reduce((a, id) => a + (st.acts[`a:${id}`] ?? 0), 0);
  if (ch.cats) return ch.cats.reduce((a, k) => a + (st.acts[`c:${k}`] ?? 0), 0);
  return st.acts[ch.foreign ? (ch.tries ? 'tf' : 'f') : ch.tries ? 't' : 'n'] ?? 0;
}

// ---------- Textos y progreso ----------

function fill(s: string, def: MissionDef, run: MissionRun): string {
  if (def.check.kind !== 'metric') return s;
  const metric = def.check.metric;
  return s.replace('{from}', fmtMetric(metric, run.from)).replace('{target}', fmtMetric(metric, run.target));
}
export const missionName = (def: MissionDef, run: MissionRun) => fill(def.name, def, run);
/** Nombre corto, sin cifras (para listas de misiones que aún no han empezado). */
export const missionTitle = (def: MissionDef) => (def.name.includes('{') ? def.name.replace(/:.*$/, '').replace(/ (hasta|a|al|del) \{target\}.*$/, '') : def.name);
export const missionText = (def: MissionDef, run: MissionRun) => fill(def.text, def, run);

export interface MissionProgress { ratio: number; label: string; done: boolean; monthsLeft: number }

export function missionProgress(world: World, run: MissionRun): MissionProgress {
  const def = MISSION_BY_ID[run.id];
  const p = world.player;
  const monthsLeft = run.deadline < 0 ? -1 : Math.max(0, run.deadline - world.turn);
  if (!def || !p) return { ratio: 0, label: '', done: false, monthsLeft };
  const c = world.countries[p.country];
  const ch = def.check;
  switch (ch.kind) {
    case 'acts': {
      const n = Math.max(0, actCount(p.missions, ch) - run.from);
      return { ratio: clamp(n / ch.n, 0, 1), label: `${Math.min(n, ch.n)} de ${ch.n}`, done: n >= ch.n, monthsLeft };
    }
    case 'metric': {
      const cur = metricValue(world, c, ch.metric);
      const up = run.target >= run.from;
      const span = Math.abs(run.target - run.from) || 1;
      const ratio = clamp((up ? cur - run.from : run.from - cur) / span, 0, 1);
      return { ratio, label: `${fmtMetric(ch.metric, cur)} → ${fmtMetric(ch.metric, run.target)}`, done: up ? cur >= run.target : cur <= run.target, monthsLeft };
    }
    case 'election': {
      const left = Math.max(0, c.pol.nextElection - world.turn);
      const done = c.pol.lastElection > run.start && !world.gameOver;
      return { ratio: done ? 1 : clamp(c.pol.approval / 50, 0, 0.98), label: `Apoyo ${c.pol.approval.toFixed(0)} % · ${left <= 1 ? 'votan ya' : `votan en ${left} meses`}`, done, monthsLeft };
    }
    case 'peace': {
      const war = atWar(world, c.id);
      return { ratio: war ? 0.1 : 1, label: war ? 'En guerra' : 'En paz', done: !war, monthsLeft };
    }
  }
}

// ---------- Elección de la siguiente misión ----------

function targetFor(world: World, c: Country, def: MissionDef): { from: number; target: number } | null {
  const ch = def.check;
  if (ch.kind !== 'metric') return { from: 0, target: 0 };
  const from = metricValue(world, c, ch.metric);
  let target = from + ch.delta;
  if (ch.limit !== undefined) target = ch.delta > 0 ? Math.min(ch.limit, target) : Math.max(ch.limit, target);
  target = round(target, METRICS[ch.metric]?.digits ?? 0);
  // Si ya no queda margen de mejora, la misión no tiene sentido
  if (Math.abs(target - from) < Math.abs(ch.delta) * 0.5) return null;
  return { from, target };
}

function eligible(world: World, c: Country, def: MissionDef): boolean {
  for (const w of def.when ?? []) {
    const v = metricValue(world, c, w.m);
    if (w.lt !== undefined && !(v < w.lt)) return false;
    if (w.gt !== undefined && !(v > w.gt)) return false;
  }
  if (def.check.kind === 'election' && metricValue(world, c, 'electionIn') < 1) return false;
  return targetFor(world, c, def) !== null;
}

function scoreOf(world: World, c: Country, st: MissionState, def: MissionDef): number {
  let s = def.priority ?? 10;
  if (def.themes?.includes(world.player!.objective)) s += 15;
  let need = 0;
  for (const w of def.when ?? []) {
    const v = metricValue(world, c, w.m);
    if (w.lt !== undefined) need = Math.max(need, clamp((w.lt - v) / Math.max(1, Math.abs(w.lt)), 0, 1));
    if (w.gt !== undefined) need = Math.max(need, clamp((v - w.gt) / Math.max(1, Math.abs(w.gt)), 0, 1));
  }
  s += need * 20;
  // Variedad: lo recién hecho (o fallado) espera su turno, y lo ya repetido muchas veces pierde atractivo
  const recent = st.log.slice(-6).map((e) => e.id);
  if (recent.slice(-3).includes(def.id)) s -= 60;
  else if (recent.includes(def.id)) s -= 25;
  s -= Math.min(24, st.log.filter((e) => e.id === def.id).length * 4);
  return s;
}

/** Misiones que podrían asignarse ahora, de más a menos adecuada (sin la que está en curso). */
export function missionCandidates(world: World): MissionDef[] {
  const st = missionsOf(world);
  if (!st) return [];
  const c = world.countries[world.player!.country];
  const seen = new Set(st.log.map((e) => e.id));
  const intro = INTRO.find((m) => !seen.has(m.id) && m.id !== st.current?.id);
  const pool = MISSIONS.filter((m) => m.stage === 'pool' && m.id !== st.current?.id && eligible(world, c, m))
    .map((m) => ({ m, s: scoreOf(world, c, st, m) }))
    .sort((a, b) => b.s - a.s || a.m.id.localeCompare(b.m.id))
    .map((x) => x.m);
  // Mientras queden «Primeros pasos», la siguiente es siempre la de aprendizaje
  return intro ? [intro, ...pool] : pool;
}

function start(world: World, st: MissionState, def: MissionDef) {
  const c = world.countries[world.player!.country];
  const t = targetFor(world, c, def) ?? { from: 0, target: 0 };
  const from = def.check.kind === 'acts' ? actCount(st, def.check) : t.from;
  st.current = { id: def.id, start: world.turn, from, target: t.target, deadline: def.months ? world.turn + def.months : -1 };
}

function close(world: World, st: MissionState, ok: boolean, why = '') {
  const run = st.current;
  if (!run) return;
  const def = MISSION_BY_ID[run.id];
  const c = world.countries[world.player!.country];
  const name = def ? missionName(def, run) : run.id;
  st.log.push({ id: run.id, name, turn: world.turn, ok });
  if (st.log.length > 80) st.log.splice(0, st.log.length - 80);
  st.current = null;
  if (ok && def) {
    st.done += 1;
    st.prestige += def.reward.prestige;
    c.pol.ap = clamp(c.pol.ap + def.reward.ap, 0, 15);
    news(world, `🎯 Misión cumplida: ${name} (+${def.reward.ap} ⚡, +${def.reward.prestige} ⭐).`, 'mision', [c.id], 1);
    timeline(world, `Misión cumplida: ${name}`, 'mision');
  } else if (why) {
    news(world, `⌛ ${why}: ${name}.`, 'mision', [c.id], 1);
  }
}

/**
 * Comprueba la misión en curso (cumplida, caducada o sin sentido) y asigna la siguiente si hace falta.
 * Se llama al final de cada mes y justo después de cada acción del jugador.
 */
export function updateMissions(world: World) {
  const st = missionsOf(world);
  if (!st || world.gameOver || world.forecast) return;
  const c = world.countries[world.player!.country];
  if (!c.alive) return;
  if (st.current) {
    const def = MISSION_BY_ID[st.current.id];
    if (!def) st.current = null;
    else {
      const pr = missionProgress(world, st.current);
      if (pr.done) close(world, st, true);
      else if (def.check.kind === 'election' && metricValue(world, c, 'elects') < 1) close(world, st, false);
      else if (st.current.deadline >= 0 && world.turn >= st.current.deadline) close(world, st, false, 'Misión caducada');
    }
  }
  if (!st.current) {
    const next = missionCandidates(world)[0];
    if (next) start(world, st, next);
  }
}

/** El jugador cambia la misión en curso por otra de las posibles (sin premio ni castigo). */
export function swapMission(world: World, id?: string): string {
  const st = missionsOf(world);
  if (!st || world.gameOver) return 'Ahora no es posible.';
  const options = missionCandidates(world);
  const next = id ? options.find((m) => m.id === id) : options[0];
  if (!next) return 'No hay otra misión disponible ahora.';
  close(world, st, false);
  start(world, st, next);
  return `Nueva misión: ${missionName(next, st.current!)}.`;
}

/** Acciones que conviene destacar para la misión en curso (⭐ en catálogos y fichas de país). */
export function missionRecIds(world: World): string[] {
  const run = world.player?.missions?.current;
  const def = run ? MISSION_BY_ID[run.id] : null;
  if (!def) return [];
  const out = [...(def.rec ?? [])];
  if (def.go.pick === 'trade') out.push('acuerdo_comercial');
  if (def.go.pick === 'ally') out.push('alianza');
  if (def.id === 'mira_el_mundo') out.push('visita_diplomatica');
  return out;
}
