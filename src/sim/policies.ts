/** Políticas por niveles (migración, regulación, prensa, banco central…), definidas en policies.json. */
import type { Country, ModifierDef, World } from './types';
import { GROUPS } from './types';
import { DATA, POLICY_BY_ID, ideologyOf } from './data';
import type { PolicyData } from './data';
import { evalExpr } from './expr';
import { resolver } from './vars';
import { addModifier } from './effects';
import { clamp } from './util';

export function policyModifier(def: PolicyData, level: number): ModifierDef {
  const lv = def.levels[level];
  const mods: Record<string, number> = { ...lv.mods };
  for (const g of GROUPS) if (lv.groups[g]) mods[`group.${g}`] = lv.groups[g]!;
  return { id: `pol_${def.id}`, name: `${def.name}: ${lv.name}`, duration: -1, mods };
}

export function initPolicies(world: World) {
  for (const id of world.order) {
    const c = world.countries[id];
    const ideo = ideologyOf(c.pol.ideology);
    const extra: Record<string, number> = {
      'ideo.prefs_migration': ideo.prefs.migration,
      'ideo.prefs_regulation': ideo.prefs.regulation,
      'ideo.prefs_green': ideo.prefs.green,
      soc_press: c.pol.pressFreedom,
      eco_energyShare: c.eco.sectors.energy,
    };
    const r = resolver(world, c, undefined, extra);
    for (const def of DATA.policies) {
      let lv = def.overrides?.[c.id] ?? Math.round(evalExpr(def.default, r));
      lv = clamp(lv, 0, def.levels.length - 1);
      c.pol.policies[def.id] = lv;
      addModifier(world, c, policyModifier(def, lv), 'politica');
    }
  }
}

/** Cambia el nivel de una política (los costes y el parlamento se gestionan en actions.ts). */
export function setPolicy(world: World, c: Country, id: string, level: number) {
  const def = POLICY_BY_ID[id];
  if (!def) return;
  const old = c.pol.policies[id] ?? 0;
  level = clamp(level, 0, def.levels.length - 1);
  c.pol.policies[id] = level;
  addModifier(world, c, policyModifier(def, level), 'politica');
  // Reacción inmediata (además del cambio permanente de objetivo): sobrerreacción a corto plazo
  for (const g of GROUPS) {
    const d = (def.levels[level].groups[g] ?? 0) - (def.levels[old].groups[g] ?? 0);
    if (d) c.groups[g].support = clamp(c.groups[g].support + d * 0.5, 0, 100);
  }
}
