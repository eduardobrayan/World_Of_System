import { describe, expect, it, vi } from 'vitest';
import { createWorld } from '../src/sim/init';
import { ACTIONS, ACTION_BY_ID, executeAction, previewAction } from '../src/sim/actions';
import { answerProposal, expireProposals, sendProposal } from '../src/sim/diplohandlers';
import { Rng } from '../src/sim/rng';
import { serialize } from '../src/sim/save';

describe('Acciones inválidas', () => {
  it('las acciones exteriores sin objetivo se rechazan sin lanzar errores ni modificar el mundo', () => {
    const w = createWorld({ seed: 'sin-objetivo', player: 'ESP' });
    const before = serialize(w);
    for (const def of ACTIONS.filter((a) => a.target === 'foreign')) {
      expect(previewAction(w, def, { actor: w.countries.ESP }).ok, def.id).toBe(false);
      expect(executeAction(w, def, { actor: w.countries.ESP }).ok, def.id).toBe(false);
    }
    expect(serialize(w)).toBe(before);
  });

  it.each([-1, 0.5, NaN, Infinity, 999])('rechaza el nivel de política inválido %s sin cobrar', (level) => {
    const w = createWorld({ seed: 'politica-invalida', player: 'ESP' });
    const before = serialize(w);
    const ctx = { actor: w.countries.ESP, params: { policy: 'energia', level } };
    expect(previewAction(w, ACTION_BY_ID.cambio_politica, ctx).ok).toBe(false);
    expect(executeAction(w, ACTION_BY_ID.cambio_politica, ctx).ok).toBe(false);
    expect(serialize(w)).toBe(before);
  });

  it('un candidato inexistente no consume capital político', () => {
    const w = createWorld({ seed: 'ministro-invalido', player: 'ESP' });
    const before = serialize(w);
    const ctx = { actor: w.countries.ESP, params: { ministry: 'economy', idx: 9 } };
    expect(executeAction(w, ACTION_BY_ID.cambio_ministro, ctx).ok).toBe(false);
    expect(serialize(w)).toBe(before);
  });

  it.each([0, -2, 1.5, NaN, Infinity])('rechaza una cantidad de producción inválida %s', (qty) => {
    const w = createWorld({ seed: 'produccion-invalida', player: 'ESP' });
    const before = serialize(w);
    const ctx = { actor: w.countries.ESP, params: { unit: 'tanks', qty } };
    expect(executeAction(w, ACTION_BY_ID.producir_unidades, ctx).ok).toBe(false);
    expect(serialize(w)).toBe(before);
  });

  it('un handler desconocido se rechaza antes de cobrar o fijar un cooldown', () => {
    const w = createWorld({ seed: 'handler-invalido', player: 'ESP' });
    const before = serialize(w);
    const def = { ...ACTION_BY_ID.cambio_ministro, handler: 'inexistente', cooldown: 3 };
    expect(previewAction(w, def, { actor: w.countries.ESP }).ok).toBe(false);
    expect(executeAction(w, def, { actor: w.countries.ESP }).ok).toBe(false);
    expect(serialize(w)).toBe(before);
  });
});

describe('Costes y consecuencias', () => {
  it('un plan aprobado cobra su inversión y aplica sus modificadores', () => {
    const w = createWorld({ seed: 'voto-aprobado', player: 'ESP' });
    const c = w.countries.ESP;
    const def = ACTION_BY_ID.plan_industrial;
    const p = previewAction(w, def, { actor: c });
    const debt = c.eco.debt, ap = c.pol.ap;
    const random = vi.spyOn(Rng.prototype, 'next').mockReturnValue(0);
    try {
      expect(executeAction(w, def, { actor: c }).passed).toBe(true);
    } finally {
      random.mockRestore();
    }
    expect(c.pol.ap).toBeCloseTo(ap - p.ap);
    expect(c.eco.debt).toBeCloseTo(debt + p.money);
    for (const modifier of def.modifiers ?? []) {
      expect(c.mods.some((m) => m.id === modifier.id)).toBe(true);
    }
  });

  it('los parámetros válidos permiten nombrar ministros y producir la cantidad solicitada', () => {
    const w = createWorld({ seed: 'parametros-validos', player: 'ESP' });
    const c = w.countries.ESP;
    c.pol.ap = 20;
    expect(executeAction(w, ACTION_BY_ID.cambio_ministro, {
      actor: c, params: { ministry: 'economy', idx: 0 },
    }).passed).toBe(true);
    expect(c.pol.ministers.find((m) => m.ministry === 'economy')?.profile).toBe('tecnocrata');
    expect(executeAction(w, ACTION_BY_ID.producir_unidades, {
      actor: c, params: { unit: 'tanks', qty: 3 },
    }).passed).toBe(true);
    expect(c.mil.production.at(-1)?.qty).toBe(3);
    expect(Number.isFinite(c.mil.production.at(-1)?.cost)).toBe(true);
  });

  it('un plan rechazado por el parlamento consume capital político pero no su inversión', () => {
    const w = createWorld({ seed: 'voto-rechazado', player: 'ESP' });
    const c = w.countries.ESP;
    const def = ACTION_BY_ID.plan_industrial;
    const p = previewAction(w, def, { actor: c });
    expect(p.ok).toBe(true);
    expect(p.vote).not.toBeNull();
    expect(p.money).toBeGreaterThan(0);
    const debt = c.eco.debt, ap = c.pol.ap;
    const random = vi.spyOn(Rng.prototype, 'next').mockReturnValue(1);
    try {
      expect(executeAction(w, def, { actor: c }).passed).toBe(false);
    } finally {
      random.mockRestore();
    }
    expect(c.pol.ap).toBeCloseTo(ap - p.ap);
    expect(c.eco.debt).toBe(debt);
  });

  it('rechazar un ultimátum concede el mismo casus belli que dejarlo vencer', () => {
    for (const expire of [false, true]) {
      const w = createWorld({ seed: 'ultimatum-rechazado', player: 'ESP' });
      const from = w.countries.FRA, to = w.countries.ESP;
      const p = sendProposal(w, from, to, 'ultimatum', { demand: 'compensacion' }, 'Compensación');
      w.turn += 3;
      if (expire) expireProposals(w);
      else answerProposal(w, p.id, false);
      expect(from.pol.flags.cb_ESP).toBe(w.turn);
      expect(w.proposals).toHaveLength(0);
      const before = serialize(w);
      answerProposal(w, p.id, false);
      expect(serialize(w)).toBe(before);
    }
  });
});
