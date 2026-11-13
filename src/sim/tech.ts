/** Árbol tecnológico, puntos de investigación, difusión y transición energética. */
import type { Country, World } from './types';
import { DATA, TECH_BY_ID } from './data';
import type { TechDef } from './data';
import { addModifier } from './effects';
import { modSum } from './vars';
import { clamp, news } from './util';
import { regionalTotal } from './economy';

export function techModifierId(t: TechDef) {
  return `tech_${t.id}`;
}

export function grantTech(world: World, c: Country, t: TechDef, silent = false) {
  if (c.tech.done.includes(t.id)) return;
  c.tech.done.push(t.id);
  addModifier(world, c, { id: techModifierId(t), name: `Tecnología: ${t.name}`, duration: -1, mods: t.mods }, 'tecnologia');
  if (!silent) {
    c.tech.level = clamp(c.tech.level + 0.4 + t.tier * 0.4, 0, 100);
    if (world.player?.country === c.id) news(world, `🔬 ${c.name} completa la investigación «${t.name}».`, 'tecnologia', [c.id], 2);
    else if (t.tier >= 3) news(world, `🔬 ${c.name} domina la tecnología «${t.name}».`, 'tecnologia', [c.id], t.tier >= 4 ? 3 : 1);
  }
}

export function initTech(world: World, c: Country) {
  // Se concede en orden de dependencias
  let changed = true;
  while (changed) {
    changed = false;
    for (const t of DATA.techs) {
      if (c.tech.done.includes(t.id)) continue;
      if (c.tech.level < t.start) continue;
      if (!t.req.every((r) => c.tech.done.includes(r))) continue;
      grantTech(world, c, t, true);
      changed = true;
    }
  }
  c.base.techCount = c.tech.done.length;
}

export function available(c: Country): TechDef[] {
  return DATA.techs.filter((t) => !c.tech.done.includes(t.id) && t.req.every((r) => c.tech.done.includes(r)));
}

/** Coste efectivo: más barato si buena parte del PIB mundial ya la domina (difusión). */
export function techCost(world: World, c: Country, t: TechDef): number {
  let tot = 0, has = 0;
  for (const id of world.order) {
    const o = world.countries[id];
    if (!o.alive) continue;
    tot += o.eco.gdp;
    if (o.tech.done.includes(t.id)) has += o.eco.gdp;
  }
  const share = tot > 0 ? has / tot : 0;
  const eduPenalty = c.soc.education < t.minEdu ? 1 + (t.minEdu - c.soc.education) / 25 : 1;
  return t.cost * (1 - 0.6 * share) * eduPenalty;
}

export function researchPoints(c: Country): number {
  const bn = (c.eco.gdp * c.eco.budget.research) / 100;
  return 3 * Math.sqrt(Math.max(0, bn)) * (c.soc.education / 70) * (1 + modSum(c, 'research')) + regionalTotal(c, 'research') * 0.5;
}

/** La IA (y el jugador si no elige) escoge la siguiente investigación. */
export function autoPickTech(world: World, c: Country): string | null {
  const opts = available(c);
  if (!opts.length) return null;
  const pref: Record<string, number> = {
    militar: 0.6 + c.ai.aggression, ia: 1.1, industria: 1.0, energia: 0.8 + (c.tech.renewables < 40 ? 0.3 : 0), medicina: 0.8,
    agricultura: c.res.food.cons > c.res.food.prod ? 1.1 : 0.5, transporte: 0.7, comunicaciones: 0.8, civil: 0.8, espacio: 0.5 + c.ai.ambition * 0.4,
  };
  let best: TechDef | null = null, bestScore = -Infinity;
  for (const t of opts) {
    const s = (pref[t.branch] ?? 0.7) / Math.sqrt(techCost(world, c, t));
    if (s > bestScore) { bestScore = s; best = t; }
  }
  return best?.id ?? null;
}

export function updateTech(world: World, c: Country) {
  const tech = c.tech;
  tech.points = researchPoints(c);
  if (!tech.current || tech.done.includes(tech.current)) {
    tech.current = world.player?.country === c.id && tech.current === null ? autoPickTech(world, c) : autoPickTech(world, c);
    tech.progress = 0;
  }
  if (tech.current) {
    const t = TECH_BY_ID[tech.current];
    tech.progress += tech.points;
    if (t && tech.progress >= techCost(world, c, t)) {
      grantTech(world, c, t);
      tech.current = null;
      tech.progress = 0;
    }
  }
  // Difusión tecnológica lenta hacia el nivel de los socios
  tech.level = clamp(tech.level + 0.004 + (c.soc.education - 60) * 0.0004, 0, 100);

  // Transición energética
  const baseGrowth = 0.5 * (1 - tech.renewables / 110);
  const rate = (baseGrowth + modSum(c, 'renewablesGrowth')) / 12;
  tech.renewables = clamp(tech.renewables + rate * (1 - tech.renewables / 100), 0, 99);
}
