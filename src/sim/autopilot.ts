/**
 * Gestión macroeconómica rutinaria de los gobiernos IA (presupuesto e impuestos).
 * Es la "tecnocracia" de base; la IA de utilidad (ai.ts) añade decisiones políticas encima.
 */
import type { BudgetItem, Country, World } from './types';
import { BUDGET_ITEMS } from './types';
import { ideologyOf } from './data';
import { clamp } from './util';
import { debtRatio } from './economy';
import { atWar } from './vars';

/** Déficit que el gobierno considera aceptable según deuda, ideología y personalidad. */
export function targetDeficit(c: Country): number {
  const dr = debtRatio(c);
  const ideo = ideologyOf(c.pol.ideology);
  let t = 3 + (ideo.prefs.welfare - 1) * 4 - (c.ai.pragmatism - 0.5) * 2;
  if (dr > 90) t -= (dr - 90) * 0.02;
  if (dr < 40) t += 1;
  if (c.eco.riskPremium > 4) t -= 1.5;
  if (c.eco.reserveCurrency) t += 1.5;
  if (c.eco.outputGap < -2) t += 1.5; // política contracíclica
  return clamp(t, -2, 7);
}

const DISCRETIONARY: BudgetItem[] = ['infrastructure', 'subsidies', 'administration', 'social', 'defense', 'research', 'education', 'health', 'security', 'pensions'];

export function fiscalAutopilot(world: World, c: Country) {
  const e = c.eco;
  const target = targetDeficit(c);
  const gap = e.deficit - target;
  const ideo = ideologyOf(c.pol.ideology);
  if (gap > 0.8) {
    // Consolidación gradual: recortes (más) y subidas de impuestos (menos), según ideología
    const cut = Math.min(0.12, gap * 0.03);
    const taxShare = clamp((ideo.prefs.tax - 0.85) * 1.6, 0.1, 0.6);
    const spendCut = cut * (1 - taxShare);
    const total = BUDGET_ITEMS.reduce((a, k) => a + e.budget[k], 0);
    for (const k of DISCRETIONARY) {
      const weight = k === 'pensions' ? 0.4 : k === 'defense' ? (atWar(world, c.id) ? 0 : clamp(1.4 - (c.ai.threat.max ?? 0), 0, 1.4) * 0.6) : 1;
      e.budget[k] = Math.max(0.05, e.budget[k] - (spendCut * e.budget[k] / total) * weight);
    }
    const taxUp = (cut * taxShare) / 0.35;
    e.taxes.consumption = clamp(e.taxes.consumption + taxUp * 0.6, 0, 30);
    e.taxes.income = clamp(e.taxes.income + taxUp * 0.4, 0, 55);
  } else if (gap < -1.5) {
    // Margen fiscal: más gasto en las prioridades ideológicas o rebajas fiscales
    const room = Math.min(0.25, -gap * 0.04);
    if (ideo.prefs.tax < 1) {
      e.taxes.income = clamp(e.taxes.income - room * 0.8, 0, 55);
      e.taxes.corporate = clamp(e.taxes.corporate - room * 0.8, 0, 50);
    } else {
      const prio: [BudgetItem, number][] = [
        ['social', ideo.prefs.welfare], ['education', ideo.prefs.education], ['health', ideo.prefs.health],
        ['infrastructure', ideo.prefs.infrastructure], ['research', ideo.prefs.research], ['defense', ideo.prefs.defense],
      ];
      prio.sort((a, b) => b[1] - a[1]);
      e.budget[prio[0][0]] += room * 0.6;
      e.budget[prio[1][0]] += room * 0.4;
    }
  }
  // Defensa: los gobiernos amenazados rearman de forma gradual
  const want = c.ai.targetDefense;
  if (want > 0 && e.budget.defense < want) e.budget.defense = Math.min(want, e.budget.defense + 0.05);
}
