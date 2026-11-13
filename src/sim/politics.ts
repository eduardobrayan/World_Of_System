/** Política interna: apoyo de grupos, aprobación, estabilidad, capital político y riesgos. */
import type { Contribution, Country, GroupId, World } from './types';
import { GROUPS } from './types';
import { DATA, ideologyOf, regimeOf } from './data';
import { evalExpr } from './expr';
import { modParts, modSum, occupiedShare, resolver } from './vars';
import { approach, clamp } from './util';
import { regionalSum } from './economy';

function part(arr: Contribution[], label: string, value: number) {
  if (Math.abs(value) > 1e-4) arr.push({ label, value });
  return value;
}

/** Apoyo objetivo de un grupo según los factores definidos en groups.json. */
export function groupTarget(world: World, c: Country, g: GroupId, withCalib = true): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  const r = resolver(world, c);
  let v = 50;
  for (const f of DATA.groups[g].factors) v += part(p, f.label, evalExpr(f.expr, r));
  v += part(p, `Afinidad con el gobierno (${ideologyOf(c.pol.ideology).name})`, ideologyOf(c.pol.ideology).groups[g] ?? 0);
  for (const m of modParts(c, `group.${g}`)) v += part(p, m.label, m.value);
  for (const m of modParts(c, 'group.all')) v += part(p, m.label, m.value);
  if (withCalib) v += part(p, 'Situación de partida', c.groups[g].calib);
  return { value: clamp(v, 0, 100), parts: p };
}

export function approvalOf(c: Country): number {
  let s = 0, w = 0;
  for (const g of GROUPS) {
    s += DATA.groups[g].popWeight * c.groups[g].support;
    w += DATA.groups[g].popWeight;
  }
  return s / w;
}

export function powerBaseOf(c: Country): number {
  const inf = regimeOf(c.pol.regime).influence;
  let s = 0, w = 0;
  for (const g of GROUPS) {
    s += inf[g] * c.groups[g].support;
    w += inf[g];
  }
  return s / w;
}

export function stabilityTarget(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  const pol = c.pol;
  let v = part(p, 'Base de poder (grupos influyentes)', 0.35 * pol.powerBase);
  v += part(p, 'Aprobación popular', 0.25 * pol.approval);
  v += part(p, 'Legitimidad', 0.2 * pol.legitimacy);
  v += part(p, 'Confianza institucional', 0.2 * c.soc.trust);
  v += part(p, 'Protestas', -0.3 * c.soc.protest);
  v += part(p, 'Cansancio de guerra', -0.2 * pol.warWeariness);
  v += part(p, 'Inflación', -clamp(c.eco.inflation - 10, 0, 100) * 0.2);
  v += part(p, 'Territorio ocupado', -occupiedShare(c) * 30);
  v += part(p, 'Seguridad regional', regionalSum(c, 'security') * 0.3);
  v += part(p, `Régimen (${regimeOf(pol.regime).name})`, regimeOf(pol.regime).stabilityBase);
  for (const m of modParts(c, 'stability')) v += part(p, m.label, m.value);
  v += part(p, 'Factores históricos', pol.calibStab);
  return { value: clamp(v, 0, 100), parts: p };
}

export function apIncome(world: World, c: Country): number {
  let v = 3 + (c.pol.approval - 50) / 25 + regimeOf(c.pol.regime).apBonus + modSum(c, 'ap');
  if (world.player?.country === c.id) {
    if (world.player.difficulty === 'facil') v += 1;
    if (world.player.difficulty === 'dificil') v -= 0.5;
  }
  return clamp(v, 1, 7);
}

export function updatePolitics(world: World, c: Country) {
  const pol = c.pol;
  const reg = regimeOf(pol.regime);

  for (const g of GROUPS) {
    const t = groupTarget(world, c, g);
    const gs = c.groups[g];
    gs.support = clamp(approach(gs.support, t.value, 0.1), 0, 100);
    gs.radical = clamp(approach(gs.radical, Math.max(0, (50 - gs.support) * 1.4), 0.05), 0, 100);
    c.explain[`group.${g}`] = t.parts;
  }
  pol.approval = approvalOf(c);
  pol.powerBase = powerBaseOf(c);

  const legT = reg.legitimacy + (pol.approval - 50) * 0.2 + (c.soc.trust - 50) * 0.2 + modSum(c, 'legitimacy');
  pol.legitimacy = clamp(approach(pol.legitimacy, legT, 1 / 24), 0, 100);

  const st = stabilityTarget(world, c);
  pol.stability = clamp(approach(pol.stability, st.value, 0.08), 0, 100);
  c.explain.stability = st.parts;
  pol.calibStab *= 0.998;

  const interior = (pol.ministers.find((m) => m.ministry === 'interior')?.competence ?? 50) - 50;
  const corrT = c.base.corruption + modSum(c, 'corruption') + regionalSum(c, 'corruption') - interior * 0.04;
  pol.corruption = clamp(approach(pol.corruption, corrT, 1 / 36), 0, 100);
  const pressT = Math.min(reg.pressCap, c.base.pressFreedom + modSum(c, 'pressFreedom'));
  pol.pressFreedom = clamp(approach(pol.pressFreedom, pressT, 1 / 12), 0, 100);

  pol.repression = Math.max(0, pol.repression * 0.9 - 0.2);
  if (pol.emergency > 0) pol.emergency -= 1;

  const mil = c.groups.military.support;
  pol.coupRisk = clamp(
    (Math.max(0, 0.03 * (40 - mil)) + Math.max(0, 0.025 * (45 - pol.stability))) * reg.coupFactor + modSum(c, 'coupRisk'),
    0, 25,
  );
  pol.revolutionRisk = c.soc.protest > 60 && pol.stability < 30
    ? clamp(((c.soc.protest - 60) * 0.08 + (30 - pol.stability) * 0.08) * (1 - pol.repression / 200) + modSum(c, 'revolutionRisk'), 0, 25)
    : 0;

  pol.apIncome = apIncome(world, c);
  pol.ap = clamp(pol.ap + pol.apIncome, 0, 12);
}
