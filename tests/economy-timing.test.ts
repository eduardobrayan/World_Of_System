import { describe, expect, it, vi } from 'vitest';
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { addModifier, schedule } from '../src/sim/effects';
import { applyFiscal, cbIndependent, draftFrom, fiscalInfo } from '../src/sim/fiscal';
import { updateEconomy } from '../src/sim/economy';
import { cloneWorld, serialize } from '../src/sim/save';
import { Rng } from '../src/sim/rng';
import { ACTION_BY_ID, executeAction, previewAction } from '../src/sim/actions';
import { POLICY_BY_ID } from '../src/sim/data';
import { setPolicy } from '../src/sim/policies';

describe('Duración de consecuencias retardadas', () => {
  it.each([1, 3])('un modificador retardado actúa durante sus %s meses completos', (duration) => {
    const w = createWorld({ seed: 'duracion-retardada', player: 'ESP' });
    w.forecast = true; // Aísla el calendario de decisiones aleatorias de la IA y eventos.
    const c = w.countries.ESP;
    schedule(w, c, 2, [], 'prueba', [{
      id: 'impulso_retardado', name: 'Impulso retardado', duration, mods: { growth: 1 },
    }]);
    advanceTurn(w);
    expect(c.mods.some((m) => m.id === 'impulso_retardado')).toBe(false);
    advanceTurn(w);
    expect(c.mods.find((m) => m.id === 'impulso_retardado')?.remaining).toBe(duration);
    for (let remaining = duration - 1; remaining >= 0; remaining--) {
      advanceTurn(w);
      expect(c.explain.growth.some((p) => p.label === 'Impulso retardado' && p.value === 1)).toBe(true);
      expect(c.mods.find((m) => m.id === 'impulso_retardado')?.remaining ?? 0).toBe(remaining);
    }
    advanceTurn(w);
    expect(c.explain.growth.some((p) => p.label === 'Impulso retardado')).toBe(false);
  });

  it('conserva la duración de los modificadores inmediatos y permanentes', () => {
    const w = createWorld({ seed: 'duracion-inmediata', player: 'ESP' });
    w.forecast = true;
    const c = w.countries.ESP;
    addModifier(w, c, { id: 'inmediato', name: 'Inmediato', duration: 1, mods: { growth: 1 } }, 'prueba');
    schedule(w, c, 1, [], 'prueba', [{ id: 'permanente', name: 'Permanente', duration: -1, mods: { growth: 1 } }]);
    advanceTurn(w);
    expect(c.explain.growth.some((p) => p.label === 'Inmediato')).toBe(true);
    expect(c.mods.some((m) => m.id === 'inmediato')).toBe(false);
    advanceTurn(w);
    expect(c.explain.growth.some((p) => p.label === 'Permanente')).toBe(true);
    expect(c.mods.find((m) => m.id === 'permanente')?.remaining).toBe(-1);
  });
});

describe('Coherencia fiscal', () => {
  it.each(['income', 'tariff'] as const)('la previsión del impuesto %s coincide con el déficit calculado', (tax) => {
    const w = createWorld({ seed: 'prevision-fiscal', player: 'VNM' });
    const c = w.countries.VNM;
    c.eco.tradeAccess = 0.6;
    c.regions[0].controller = 'CHN';
    addModifier(w, c, { id: 'recaudacion', name: 'Recaudación', duration: -1, mods: { taxEfficiency: 0.3 } }, 'prueba');
    const baseline = cloneWorld(w);
    const d = draftFrom(c);
    d.taxes[tax] += 2;
    d.budget.health += 0.5;
    const info = fiscalInfo(w, c, d);
    expect(applyFiscal(w, c, d).passed).toBe(true);
    updateEconomy(baseline, baseline.countries.VNM);
    updateEconomy(w, c);
    expect(c.eco.deficit - baseline.countries.VNM.eco.deficit).toBeCloseTo(info.deficitDelta, 9);
  });

  it('no cobra por un cambio de tipos que un banco central independiente no puede aplicar', () => {
    const w = createWorld({ seed: 'banco-independiente', player: 'ESP' });
    const c = w.countries.ESP;
    setPolicy(w, c, 'banco_central', 0);
    expect(cbIndependent(c)).toBe(true);
    const d = draftFrom(c);
    d.rate += 1;
    const before = serialize(w);
    expect(fiscalInfo(w, c, d).changed).toBe(false);
    expect(applyFiscal(w, c, d).ok).toBe(false);
    expect(serialize(w) === before).toBe(true);
  });

  it.each([false, true])('el cambio de tipos de un proyecto presupuestario depende de su aprobación: %s', (passed) => {
    const w = createWorld({ seed: 'tipos-y-presupuesto', player: 'ESP' });
    const c = w.countries.ESP;
    setPolicy(w, c, 'banco_central', 1);
    const d = draftFrom(c);
    const oldRate = c.eco.policyRate, oldHealth = c.eco.budget.health;
    d.rate += 1;
    d.budget.health += 0.5;
    const random = vi.spyOn(Rng.prototype, 'next').mockReturnValue(passed ? 0 : 1);
    try {
      expect(applyFiscal(w, c, d).passed).toBe(passed);
    } finally {
      random.mockRestore();
    }
    expect(c.eco.policyRate).toBe(passed ? d.rate : oldRate);
    expect(c.eco.budget.health).toBe(passed ? d.budget.health : oldHealth);
  });

  it('permite cambiar solo los tipos cuando el banco está subordinado', () => {
    const w = createWorld({ seed: 'solo-tipos', player: 'ESP' });
    const c = w.countries.ESP;
    setPolicy(w, c, 'banco_central', 1);
    const d = draftFrom(c);
    d.rate += 1;
    const ap = c.pol.ap, rng = [...w.rng];
    expect(applyFiscal(w, c, d).passed).toBe(true);
    expect(c.eco.policyRate).toBe(d.rate);
    expect(c.pol.ap).toBe(ap - 1);
    expect(w.rng).toEqual(rng);
  });

  it('permite aprobar presupuestos conservando tipos altos heredados de la simulación', () => {
    const w = createWorld({ seed: 'tipos-heredados', player: 'VNM' });
    const c = w.countries.VNM;
    c.eco.policyRate = 220;
    const d = draftFrom(c);
    d.budget.health += 0.5;
    expect(applyFiscal(w, c, d).passed).toBe(true);
    expect(c.eco.policyRate).toBe(220);
    expect(c.eco.budget.health).toBe(d.budget.health);
  });

  it.each([NaN, Infinity, -1, 1000])('rechaza importes fiscales inválidos (%s) antes de modificar la partida', (value) => {
    for (const field of ['budget', 'taxes', 'rate']) {
      const w = createWorld({ seed: 'importes-fiscales', player: 'VNM' });
      const c = w.countries.VNM;
      const d = draftFrom(c);
      d.budget.education += 0.5;
      if (field === 'budget') d.budget.health = value;
      else if (field === 'taxes') d.taxes.consumption = value;
      else d.rate = value;
      const before = serialize(w);
      expect(applyFiscal(w, c, d).ok, field).toBe(false);
      expect(serialize(w) === before, field).toBe(true);
    }
  });
});

describe('Coste de las políticas', () => {
  it.each([undefined, -10, 0, 100])('el motor cobra el coste definido aunque policyAp sea %s', (policyAp) => {
    const w = createWorld({ seed: 'coste-politica', player: 'CHN' });
    const c = w.countries.CHN;
    c.pol.ap = 20;
    const pd = POLICY_BY_ID.energia;
    const level = c.pol.policies.energia === 0 ? 1 : 0;
    const params = { policy: pd.id, level, ...(policyAp === undefined ? {} : { policyAp }) };
    const ctx = { actor: c, params };
    expect(previewAction(w, ACTION_BY_ID.cambio_politica, ctx).ap).toBe(pd.ap);
    expect(executeAction(w, ACTION_BY_ID.cambio_politica, ctx).passed).toBe(true);
    expect(c.pol.ap).toBe(20 - pd.ap);
    expect(c.pol.policies.energia).toBe(level);
  });
});
