/** Demografía y sociedad: población, educación, sanidad, desigualdad, migración, satisfacción, protestas. */
import type { Contribution, Country, World } from './types';
import { GROUPS } from './types';
import { DATA } from './data';
import { modParts, modSum, occupiedShare, atWar } from './vars';
import { approach, clamp, gdppc } from './util';
import { regionalSum } from './economy';

function part(arr: Contribution[], label: string, value: number) {
  if (Math.abs(value) > 1e-4) arr.push({ label, value });
  return value;
}

export function satisfactionTarget(world: World, c: Country): { value: number; parts: Contribution[] } {
  const b = c.base, e = c.eco, s = c.soc;
  const p: Contribution[] = [];
  let v = part(p, 'Nivel inicial', b.satisfaction);
  v += part(p, 'Crecimiento', clamp((e.growth - b.growth) * 1.8, -20, 10));
  v += part(p, 'Desempleo', clamp(-(e.unemployment - b.unemployment) * 1.6, -30, 10));
  v += part(p, 'Inflación', -clamp(e.inflation - Math.max(4, b.inflation), 0, 80) * 0.5);
  v += part(p, 'Sanidad', (s.health - b.health) * 0.35);
  v += part(p, 'Educación', (s.education - b.education) * 0.2);
  v += part(p, 'Desigualdad', -(s.gini - b.gini) * 0.35);
  v += part(p, 'Calidad de vida regional', regionalSum(c, 'quality') * 0.6 + regionalSum(c, 'security') * 0.25);
  v += part(p, 'Guerra', atWar(world, c.id) ? -6 - occupiedShare(c) * 25 : 0);
  for (const m of modParts(c, 'satisfaction')) v += part(p, m.label, m.value);
  return { value: clamp(v, 0, 100), parts: p };
}

export function protestTarget(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  let groupsDiscontent = 0;
  for (const g of GROUPS) {
    const gs = c.groups[g];
    groupsDiscontent += DATA.groups[g].popWeight * Math.max(0, 45 - gs.support) * (0.6 + gs.radical / 100);
  }
  let v = part(p, 'Descontento de los grupos', groupsDiscontent * 1.8);
  v += part(p, 'Insatisfacción general', Math.max(0, 45 - c.soc.satisfaction) * 0.5);
  v += part(p, 'Inflación desbocada', clamp(c.eco.inflation - 15, 0, 100) * 0.3);
  v += part(p, 'Represión', -c.pol.repression * 0.45);
  v += part(p, 'Estado de emergencia', c.pol.emergency > 0 ? -12 : 0);
  for (const m of modParts(c, 'protest')) v += part(p, m.label, m.value);
  v += part(p, 'Conflictividad estructural', c.base.calibProtest);
  return { value: clamp(v, 0, 100), parts: p };
}

export function updateSociety(world: World, c: Country) {
  const s = c.soc, b = c.base, e = c.eco;
  const pc = gdppc(c);

  // --- Demografía ---
  const birthT = b.birth * Math.pow(b.gdppc / Math.max(200, pc), 0.18) * Math.pow(b.education / Math.max(5, s.education), 0.5) + modSum(c, 'birth');
  s.birth = clamp(approach(s.birth, birthT * (1 - world.turn / 12 * 0.004), 1 / 60), 3, 50);
  const deathT = b.death * Math.pow(b.health / Math.max(5, s.health), 1.2) * (1 + (s.medianAge - b.medianAge) * 0.035) + modSum(c, 'death');
  s.death = clamp(approach(s.death, deathT, 1 / 18), 1, 60);
  const war = atWar(world, c.id);
  const migT = b.migration + (c.pol.stability - b.stability) * 0.06 + (b.unemployment - e.unemployment) * 0.15
    + Math.log(Math.max(0.2, pc / b.gdppc)) * 4 + modSum(c, 'migration') - (war ? 2 + occupiedShare(c) * 25 : 0);
  s.migration = clamp(approach(s.migration, migT, 1 / 12), -40, 40);
  s.pop = Math.max(0.01, s.pop * (1 + (s.birth - s.death + s.migration) / 1000 / 12));
  s.medianAge = clamp(s.medianAge + 0.02 * (1 - (s.birth - 8) / 25), 14, 62);
  s.refugees = Math.max(0, s.refugees * 0.97);

  // --- Educación y sanidad ---
  const min = (m: string) => (c.pol.ministers.find((x) => x.ministry === m)?.competence ?? 50) - 50;
  const eduT = b.education + (e.budget.education - b.budget_education) * 3 + Math.log(pc / b.gdppc) * 8 + regionalSum(c, 'education')
    + modSum(c, 'education') + min('education') * 0.04;
  s.education = clamp(approach(s.education, eduT, 1 / 60), 5, 100);
  const pand = world.global.pandemic?.infected[c.id] ?? 0;
  const healthT = b.health + (e.budget.health - b.budget_health) * 2.5 + Math.log(pc / b.gdppc) * 6 + regionalSum(c, 'health')
    + modSum(c, 'health') + min('health') * 0.04 - pand * 12 - occupiedShare(c) * 15;
  s.health = clamp(approach(s.health, healthT, 1 / 36), 5, 100);
  const giniT = b.gini - (e.budget.social + e.budget.pensions - b.budget_social - b.budget_pensions) * 0.6
    - (e.taxes.income - b.tax_income) * 0.15 + (c.pol.corruption - b.corruption) * 0.1 + regionalSum(c, 'gini') + modSum(c, 'gini');
  s.gini = clamp(approach(s.gini, giniT, 1 / 48), 18, 70);

  // --- Satisfacción, confianza, protestas, huelgas ---
  const sat = satisfactionTarget(world, c);
  s.satisfaction = clamp(approach(s.satisfaction, sat.value, 0.1), 0, 100);
  c.explain.satisfaction = sat.parts;
  const trustT = b.trust - (c.pol.corruption - b.corruption) * 0.5 + (c.pol.pressFreedom - b.pressFreedom) * 0.15
    + (c.pol.stability - b.stability) * 0.2 + modSum(c, 'trust');
  s.trust = clamp(approach(s.trust, trustT, 1 / 24), 0, 100);
  const pr = protestTarget(world, c);
  s.protest = clamp(approach(s.protest, pr.value, 0.2), 0, 100);
  c.explain.protest = pr.parts;
  const strikeT = Math.max(0, (45 - c.groups.workers.support) * 1.5 + Math.max(0, e.inflation - 5) * 0.8 - e.unemployment * 0.4)
    + modSum(c, 'strikes') + b.calibStrikes;
  s.strikes = clamp(approach(s.strikes, strikeT, 0.25), 0, 100);
}
