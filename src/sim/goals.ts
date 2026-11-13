/** Objetivos de partida, victoria, derrotas (quiebra, límite de tiempo) y sugerencias de cambio de objetivo. */
import type { Country, World } from './types';
import objectivesJson from '../data/objectives.json';
import { relOp, allied, occupiedShare } from './vars';
import { majorPowers } from './diplomacy';
import { clamp, gdppc, news, timeline, dateLabel } from './util';

export interface ObjectiveDef { id: string; name: string; icon: string; desc: string; targets: Record<string, number> }
export const OBJECTIVES: ObjectiveDef[] = objectivesJson as ObjectiveDef[];
export const OBJECTIVE_BY_ID: Record<string, ObjectiveDef> = Object.fromEntries(OBJECTIVES.map((o) => [o.id, o]));

export const MAX_TURNS = 360; // 30 años

export function hdi(c: Country): number {
  const inc = clamp(((Math.log(gdppc(c)) - Math.log(500)) / (Math.log(75000) - Math.log(500))) * 100, 0, 100);
  return (c.soc.education + c.soc.health + inc) / 3;
}

function share(world: World, c: Country, f: (x: Country) => number): number {
  let tot = 0;
  for (const id of world.order) if (world.countries[id].alive) tot += f(world.countries[id]);
  return tot > 0 ? f(c) / tot : 0;
}

export function baselineMetrics(world: World, c: Country): Record<string, number> {
  return { gdpShare: share(world, c, (x) => x.eco.gdp), powerShare: share(world, c, (x) => x.mil.power), hdi: hdi(c), turn: world.turn };
}

export interface Progress { label: string; value: string; ratio: number }

export function objectiveProgress(world: World, c: Country, id: string): { items: Progress[]; done: boolean } {
  const o = OBJECTIVE_BY_ID[id];
  const p = world.player!;
  const st = p.objectiveStart;
  const t = o?.targets ?? {};
  const items: Progress[] = [];
  const add = (label: string, cur: number, target: number, fmt: (v: number) => string, lowerBetter = false) => {
    const ratio = lowerBetter ? clamp(target / Math.max(1e-9, cur), 0, 1) : clamp(cur / Math.max(1e-9, target), 0, 1);
    items.push({ label, value: `${fmt(cur)} / ${fmt(target)}`, ratio });
  };
  switch (id) {
    case 'hegemonia_economica':
      add('Cuota del PIB mundial (× la de 2026)', share(world, c, (x) => x.eco.gdp) / Math.max(1e-9, st.gdpShare), t.gdpShareRatio, (v) => `${v.toFixed(2)}×`);
      add('Estabilidad', c.pol.stability, t.stability, (v) => v.toFixed(0));
      break;
    case 'dominio_militar':
      add('Cuota del poder militar mundial (× la de 2026)', share(world, c, (x) => x.mil.power) / Math.max(1e-9, st.powerShare), t.powerShareRatio, (v) => `${v.toFixed(2)}×`);
      add('Guerras ganadas', c.pol.flags.guerras_ganadas ?? 0, t.warsWon, (v) => v.toFixed(0));
      break;
    case 'liderazgo_diplomatico': {
      const majors = majorPowers(world, 12).filter((x) => x.id !== c.id);
      const avg = majors.reduce((a, x) => a + relOp(world, x.id, c.id), 0) / Math.max(1, majors.length);
      add('Opinión media de las grandes potencias', avg, t.avgMajorOpinion, (v) => v.toFixed(0));
      add('Reputación', c.reputation, t.reputation, (v) => v.toFixed(0));
      add('Aliados', world.order.filter((x) => x !== c.id && allied(world, c.id, x)).length, t.allies, (v) => v.toFixed(0));
      add('Resoluciones propias aprobadas', c.pol.flags.resoluciones ?? 0, t.resolutions, (v) => v.toFixed(0));
      break;
    }
    case 'supervivencia':
      add('Meses en el poder', world.turn - (st.turn ?? 0), t.months, (v) => v.toFixed(0));
      break;
    case 'prosperidad':
      add('Mejora del IDH', hdi(c) - st.hdi, t.hdiGain, (v) => v.toFixed(1));
      add('Meses seguidos con estabilidad > 60', c.pol.flags.meses_estables ?? 0, t.stableMonths, (v) => v.toFixed(0));
      break;
    default:
      return { items: [], done: false };
  }
  return { items, done: items.length > 0 && items.every((x) => x.ratio >= 1) };
}

/** Comprobación mensual de victoria, derrotas especiales y sugerencias de objetivo. */
export function checkGoals(world: World) {
  const p = world.player;
  if (!p || world.gameOver || world.forecast) return;
  const c = world.countries[p.country];
  // Contadores auxiliares
  c.pol.flags.meses_estables = c.pol.stability > 60 ? (c.pol.flags.meses_estables ?? 0) + 1 : 0;
  // Derrota por quiebra del Estado
  const recentDefaults = (c.eco.defaultTurns ?? []).filter((t) => world.turn - t < 120).length;
  if (recentDefaults >= 2 || c.eco.hyperMonths >= 18) {
    world.gameOver = {
      turn: world.turn, victory: false, reason: 'quiebra',
      text: recentDefaults >= 2 ? `${c.name} ha suspendido pagos dos veces en menos de diez años: el Estado está en quiebra.` : `Año y medio de hiperinflación ha destruido la economía de ${c.name}: el Estado está en quiebra.`,
    };
    news(world, `💸 Quiebra del Estado en ${c.name}.`, 'derrota', [c.id], 3);
    timeline(world, 'Quiebra del Estado', 'derrota');
    return;
  }
  if (!c.alive) {
    world.gameOver = { turn: world.turn, victory: false, reason: 'militar', text: `${c.name} ha dejado de existir como Estado independiente.` };
    return;
  }
  const prog = objectiveProgress(world, c, p.objective);
  if (p.objective !== 'libre' && prog.done) {
    world.gameOver = { turn: world.turn, victory: true, reason: p.objective, text: `Has cumplido el objetivo «${OBJECTIVE_BY_ID[p.objective].name}» en ${dateLabel(world.turn)}.` };
    news(world, `🏆 ${c.name} cumple su objetivo: ${OBJECTIVE_BY_ID[p.objective].name}.`, 'victoria', [c.id], 3);
    timeline(world, `Objetivo cumplido: ${OBJECTIVE_BY_ID[p.objective].name}`, 'victoria');
    return;
  }
  if (world.turn >= MAX_TURNS) {
    world.gameOver = { turn: world.turn, victory: false, reason: 'tiempo', text: `Han pasado 30 años. Tu etapa al frente de ${c.name} termina${p.objective === 'libre' ? '.' : ' sin haber cumplido el objetivo.'}` };
    return;
  }
  // Sugerencias de cambio de objetivo según los acontecimientos
  const sug = suggestObjective(world, c);
  if (sug && sug !== p.objective && p.objectiveSuggestion !== sug) {
    p.objectiveSuggestion = sug;
    news(world, `🎯 Las circunstancias sugieren cambiar de objetivo: ${OBJECTIVE_BY_ID[sug].name}.`, 'objetivo', [c.id], 2);
  }
}

function suggestObjective(world: World, c: Country): string | null {
  if (occupiedShare(c) > 0.1 || c.pol.stability < 30) return 'supervivencia';
  const h = c.history.slice(-24);
  if (h.length >= 24 && h.reduce((a, s) => a + s.growth, 0) / h.length > 4) return 'hegemonia_economica';
  if (c.reputation > 80) return 'liderazgo_diplomatico';
  return null;
}

/** Cambia el objetivo (gratis si es el sugerido; si no, cuesta 3 de capital político). */
export function changeObjective(world: World, id: string): string {
  const p = world.player;
  if (!p || !OBJECTIVE_BY_ID[id] || p.objective === id) return 'Sin cambios.';
  const c = world.countries[p.country];
  const free = p.objectiveSuggestion === id;
  if (!free && c.pol.ap < 3) return 'Necesitas 3 de capital político (o esperar a que las circunstancias lo sugieran).';
  if (!free) c.pol.ap -= 3;
  p.objective = id;
  p.objectiveSuggestion = undefined;
  p.objectiveHistory.push({ turn: world.turn, objective: id, reason: free ? 'Sugerido por los acontecimientos' : 'Decisión del gobierno' });
  if (id === 'supervivencia') p.objectiveStart.turn = world.turn;
  timeline(world, `Nuevo objetivo: ${OBJECTIVE_BY_ID[id].name}`, 'objetivo');
  return `Nuevo objetivo: ${OBJECTIVE_BY_ID[id].name}.`;
}
