import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { worldHealth } from '../src/sim/health';
import { serialize, deserialize } from '../src/sim/save';
import { Rng, seedRng } from '../src/sim/rng';
import { evalExpr, validateExpr } from '../src/sim/expr';
import { DATA } from '../src/sim/data';

describe('RNG', () => {
  it('es determinista con la misma semilla', () => {
    const a = new Rng(seedRng('abc')), b = new Rng(seedRng('abc'));
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });
  it('produce valores en [0,1)', () => {
    const r = new Rng(seedRng(42));
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('Expresiones', () => {
  const res = (p: string) => ({ 'eco.inflation': 5, x: 2, y: 3 } as Record<string, number>)[p] ?? 0;
  it('evalúa aritmética, comparaciones, funciones y ternario', () => {
    expect(evalExpr('1 + 2 * 3', res)).toBe(7);
    expect(evalExpr('(1 + 2) * 3', res)).toBe(9);
    expect(evalExpr('2 ^ 3', res)).toBe(8);
    expect(evalExpr('eco.inflation > 4 ? 10 : 20', res)).toBe(10);
    expect(evalExpr('clamp(x * 100, 0, 50)', res)).toBe(50);
    expect(evalExpr('max(x, y) - min(x, y)', res)).toBe(1);
    expect(evalExpr('x < y && !(y < x)', res)).toBe(1);
    expect(evalExpr('-x + 5', res)).toBe(3);
  });
  it('rechaza expresiones inválidas', () => {
    expect(validateExpr('1 +')).not.toBeNull();
    expect(validateExpr('foo(1)')).not.toBeNull();
  });
});

describe('Datos', () => {
  it('todas las expresiones de los grupos compilan', () => {
    for (const g of Object.values(DATA.groups)) for (const f of g.factors) expect(validateExpr(f.expr)).toBeNull();
  });
  it('hay 43 países jugables y 17 bloques con geometría y vecindad', () => {
    expect(DATA.countries.length).toBe(43);
    expect(DATA.blocks.length).toBe(17);
    for (const c of [...DATA.countries, ...DATA.blocks]) expect(DATA.adjacency[c.id]).toBeDefined();
  });
  it('los requisitos del árbol tecnológico existen', () => {
    const ids = new Set(DATA.techs.map((t) => t.id));
    for (const t of DATA.techs) for (const r of t.req) expect(ids.has(r)).toBe(true);
  });
  it('cada país jugable tiene regiones con una capital', () => {
    for (const c of DATA.countries) {
      const regs = DATA.regions[c.id];
      expect(regs?.length ?? 0).toBeGreaterThanOrEqual(3);
      expect(regs.some((r) => r.cap)).toBe(true);
    }
  });
});

describe('Mundo', () => {
  it('se crea calibrado: el estado inicial coincide con los datos', () => {
    const w = createWorld({ seed: 't', player: 'ESP' });
    const esp = w.countries.ESP;
    expect(esp.eco.growth).toBeCloseTo(2.2, 5);
    expect(Math.abs(esp.eco.deficit - 2.5)).toBeLessThan(0.6);
    expect(w.player?.country).toBe('ESP');
    expect(w.order.length).toBe(60);
  });

  it('es determinista: misma semilla, mismo futuro', () => {
    const a = createWorld({ seed: 'det', player: null });
    const b = createWorld({ seed: 'det', player: null });
    for (let i = 0; i < 24; i++) { advanceTurn(a); advanceTurn(b); }
    expect(serialize(a)).toBe(serialize(b));
  });

  it('guardar y cargar reproduce exactamente la partida', () => {
    const a = createWorld({ seed: 'save', player: 'FRA' });
    for (let i = 0; i < 6; i++) advanceTurn(a);
    const b = deserialize(serialize(a));
    for (let i = 0; i < 12; i++) { advanceTurn(a); advanceTurn(b); }
    expect(serialize(b)).toBe(serialize(a));
  });

  it('simula 200 turnos sin colapsar ni quedarse estático', () => {
    const w = createWorld({ seed: 'larga', player: null });
    for (let i = 0; i < 200; i++) advanceTurn(w);
    const h = worldHealth(w);
    expect(h.nan).toBe(0);
    expect(h.problems).toEqual([]);
  });
});
