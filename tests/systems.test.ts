import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { ACTION_BY_ID, executeAction, previewAction } from '../src/sim/actions';
import { resolveEvent } from '../src/sim/events';
import { applyFiscal, draftFrom } from '../src/sim/fiscal';
import { forecast } from '../src/sim/forecast';
import { declareWar, offerPeace } from '../src/sim/war';
import { Rng } from '../src/sim/rng';
import { evaluateProposal } from '../src/sim/ai';
import { serialize, deserialize } from '../src/sim/save';
import { worldHealth } from '../src/sim/health';

describe('Sistemas', () => {
  it('una ley se previsualiza, cobra capital político y deja un modificador permanente al aprobarse', () => {
    const w = createWorld({ seed: 'ley', player: 'CHN' }); // sin parlamento: siempre se aprueba
    const c = w.countries.CHN;
    const def = ACTION_BY_ID.ley_anticorrupcion;
    const p = previewAction(w, def, { actor: c });
    expect(p.ok).toBe(true);
    expect(p.lines.length).toBeGreaterThan(0);
    const ap = c.pol.ap;
    const r = executeAction(w, def, { actor: c });
    expect(r.passed).toBe(true);
    expect(c.pol.ap).toBeCloseTo(ap - p.ap, 5);
    expect(c.mods.some((m) => m.id === 'ley_anticorrupcion' && m.remaining === -1)).toBe(true);
    expect(c.pol.flags.ley_anticorrupcion).toBe(1);
  });

  it('subir el gasto social mejora el apoyo de los trabajadores y empeora el déficit (previsión)', () => {
    const w = createWorld({ seed: 'prev', player: 'ESP' });
    const fr = forecast(w, 'ESP', (x) => { x.countries.ESP.eco.budget.social += 2; }, 12);
    expect(fr.delta.deficit).toBeGreaterThan(1);
    expect(fr.alt[12].approval).toBeGreaterThan(fr.base[12].approval);
  });

  it('aplicar presupuestos cambia las partidas si se aprueban', () => {
    const w = createWorld({ seed: 'pres', player: 'VNM' });
    const c = w.countries.VNM;
    const d = draftFrom(c);
    d.budget.education += 0.5;
    const r = applyFiscal(w, c, d);
    expect(r.passed).toBe(true);
    expect(c.eco.budget.education).toBeCloseTo(d.budget.education, 5);
  });

  it('los eventos del jugador quedan pendientes y se resuelven', () => {
    const w = createWorld({ seed: 'eventos', player: 'NGA' });
    let resolved = 0;
    for (let i = 0; i < 36 && !w.gameOver; i++) {
      while (w.pendingEvents.length) { resolveEvent(w, w.pendingEvents[0].uid, 0); resolved++; }
      advanceTurn(w);
    }
    expect(resolved).toBeGreaterThan(0);
  });

  it('una guerra crea frentes, ocupa regiones y puede terminar en paz', () => {
    const w = createWorld({ seed: 'guerra', player: 'IND' });
    const ind = w.countries.IND, pak = w.countries.PAK;
    const war = declareWar(w, ind, pak, 'territory', new Rng(w.rng));
    expect(war.fronts.length).toBeGreaterThan(0);
    for (let i = 0; i < 12; i++) { w.pendingEvents = []; advanceTurn(w); }
    const res = offerPeace(w, war, ind, {});
    expect(typeof res.accepted).toBe('boolean');
    expect(worldHealth(w).nan).toBe(0);
  });

  it('la IA explica por qué acepta o rechaza propuestas', () => {
    const w = createWorld({ seed: 'ia', player: 'USA' });
    const ev = evaluateProposal(w, w.countries.USA, w.countries.CHN, 'alliance');
    expect(ev.prob).toBeLessThan(0.3);
    expect(ev.reasons.length).toBeGreaterThan(0);
    const ev2 = evaluateProposal(w, w.countries.USA, w.countries.CAN, 'trade');
    expect(ev2.score).toBeGreaterThan(ev.score);
  });

  it('una partida con jugador se guarda y se recupera de forma determinista', () => {
    const a = createWorld({ seed: 'guardar', player: 'BRA' });
    for (let i = 0; i < 6; i++) { a.pendingEvents = []; advanceTurn(a); }
    const b = deserialize(serialize(a));
    for (let i = 0; i < 6; i++) {
      a.pendingEvents = []; b.pendingEvents = [];
      advanceTurn(a); advanceTurn(b);
    }
    expect(serialize(b)).toBe(serialize(a));
  });
});
