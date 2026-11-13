import { describe, expect, it } from 'vitest';
import { validateExpr } from '../src/sim/expr';
import { ACTIONS } from '../src/sim/actions';
import { EVENTS } from '../src/sim/events';
import { DATA } from '../src/sim/data';
import { OBJECTIVES } from '../src/sim/goals';
import { ensureHandlers } from '../src/sim/registry';
import { createWorld } from '../src/sim/init';
import { previewAction } from '../src/sim/actions';

function exprsOf(obj: unknown, out: string[] = []): string[] {
  if (Array.isArray(obj)) obj.forEach((x) => exprsOf(x, out));
  else if (obj && typeof obj === 'object') {
    for (const [k, v] of Object.entries(obj)) {
      if (typeof v === 'string' && ['expr', 'add', 'mul', 'set', 'value', 'utility', 'weight', 'condition', 'ai', 'requires', 'money', 'default'].includes(k)) out.push(v);
      else exprsOf(v, out);
    }
  }
  return out;
}

describe('Validación de datos', () => {
  it('todas las expresiones de acciones, eventos y políticas compilan', () => {
    const all = [...exprsOf(ACTIONS), ...exprsOf(EVENTS), ...exprsOf(DATA.policies)];
    expect(all.length).toBeGreaterThan(200);
    for (const e of all) expect(validateExpr(e), e).toBeNull();
  });

  it('cada acción con mecánica especial tiene su handler registrado', () => {
    ensureHandlers();
    const w = createWorld({ seed: 'datos', player: 'ESP' });
    const c = w.countries.ESP, t = w.countries.FRA;
    for (const a of ACTIONS) {
      const p = previewAction(w, a, { actor: c, target: a.target === 'foreign' ? t : undefined, params: { policy: 'regulacion', level: 2, policyAp: 2, ministry: 'economy', idx: 0, org: 'ASEAN', unit: 'tanks', qty: 1, doctrine: 'masa', level2: 1 } });
      expect(p.unmet.some((u) => u.startsWith('Mecánica desconocida')), a.id).toBe(false);
    }
  });

  it('los ids de eventos y acciones son únicos', () => {
    expect(new Set(ACTIONS.map((a) => a.id)).size).toBe(ACTIONS.length);
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
  });

  it('hay seis objetivos y todos los eventos tienen al menos una opción', () => {
    expect(OBJECTIVES.length).toBe(6);
    for (const e of EVENTS) expect(e.options.length).toBeGreaterThan(0);
  });
});
