import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { modSum } from '../src/sim/vars';
import { addModifier } from '../src/sim/effects';
import { EVENT_BY_ID, triggerEvent } from '../src/sim/events';
import { rngOf } from '../src/sim/util';
import type { Country } from '../src/sim/types';

const naive = (c: Country, key: string) => {
  let s = 0;
  for (const m of c.mods) { const v = m.mods[key]; if (typeof v === 'number') s += v; }
  for (const sh of c.shocks) if (sh.key === key) s += sh.value;
  return s;
};

describe('F8: pulido', () => {
  it('modSum con caché da exactamente lo mismo que la suma directa, también tras añadir o sustituir modificadores', () => {
    const w = createWorld({ seed: 'cache', player: null });
    for (let i = 0; i < 8; i++) advanceTurn(w);
    const c = w.countries.FRA;
    const keys = ['growth', 'stability', 'corruption', 'narco.cartels', 'protest', 'trust'];
    for (const k of keys) expect(modSum(c, k)).toBe(naive(c, k));
    addModifier(w, c, { id: 'test_mod', name: 'Prueba', duration: 3, mods: { growth: 0.7 } }, 'test');
    expect(modSum(c, 'growth')).toBe(naive(c, 'growth'));
    addModifier(w, c, { id: 'test_mod', name: 'Prueba', duration: 3, mods: { growth: -1.3 } }, 'test');
    expect(modSum(c, 'growth')).toBe(naive(c, 'growth'));
    c.mods.push({ id: 'x', name: 'x', source: 't', remaining: 2, mods: { stability: 2 } });
    expect(modSum(c, 'stability')).toBe(naive(c, 'stability'));
  });

  it('desmantelar el programa biológico por el científico arrepentido destruye las cepas y la IA no lo publica', () => {
    const w = createWorld({ seed: 'bio8', player: 'ESP' });
    const c = w.countries.RUS;
    c.bio.program = 40;
    c.bio.designs.push({ id: 'd1', name: 'Cepa', kind: 'humano', transmission: 2, lethality: 2, stealth: 2, resistance: 2, vaccine: false, ready: 0, cost: 1, used: 0 });
    const def = EVENT_BY_ID.cientifico_arrepentido;
    expect(def.secret).toBe(true);
    // Fuerza la opción de desmantelar: la IA de Rusia la elegirá si su aversión al riesgo es máxima
    c.ai.riskAversion = 50;
    const before = w.news.length;
    triggerEvent(w, c, def, rngOf(w));
    expect(c.bio.program).toBe(0);
    expect(c.bio.designs).toHaveLength(0);
    expect(w.news.slice(before).some((n) => n.text.includes('científico'))).toBe(false);
  });

  it('cargo genérico con nombre de líder aleatorio y policía mexicana dura pero no nula', () => {
    const w = createWorld({ seed: '1', player: 'MEX', party: { mode: 'new', name: 'Nuevo', ideology: 'liberal', leader: 'Eduardo' } });
    for (const id of w.order) expect(['Presidenta', 'Primera ministra', 'Presidenta del Consejo']).not.toContain(w.countries[id].pol.leaderTitle);
    const m = w.countries.MEX;
    expect(m.police.integrity).toBeGreaterThan(12);
    expect(m.police.integrity).toBeLessThan(35);
  });
});
