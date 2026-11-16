import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { ACTION_BY_ID, executeAction, previewAction } from '../src/sim/actions';
import { cloneWorld, deserialize, serialize, SAVE_VERSION } from '../src/sim/save';
import { CORRUPTION_INFO, overallCorruption } from '../src/sim/security';
import { CORRUPTION_TYPES } from '../src/sim/types';
import { attributeOutbreak, designCapacity } from '../src/sim/bio';
import { designBonus, updateWeapons } from '../src/sim/weapons';
import { setSanction } from '../src/sim/diplomacy';
import { computePower } from '../src/sim/military';

const run = (w: ReturnType<typeof createWorld>, n: number) => { for (let i = 0; i < n; i++) advanceTurn(w); };

describe('F7: partidos', () => {
  it('fundar un partido nuevo: gobierna con su nombre, ideología y la mayoría del anterior', () => {
    const w = createWorld({ seed: 'partido', player: 'ESP', party: { mode: 'new', name: 'Partido del Futuro', ideology: 'liberal', leader: 'Ada' } });
    const c = w.countries.ESP;
    const mine = c.pol.parties.find((p) => p.name === 'Partido del Futuro')!;
    expect(mine.gov).toBe(true);
    expect(mine.custom).toBe(true);
    expect(c.pol.govParty).toBe('Partido del Futuro');
    expect(c.pol.ideology).toBe('liberal');
    expect(c.pol.leaderName).toBe('Ada');
    expect(c.pol.parties.filter((p) => p.gov)).toHaveLength(1);
    expect(c.pol.parties.reduce((a, p) => a + p.seats, 0)).toBeCloseTo(100, 0);
    expect(mine.seats).toBe(Math.max(...c.pol.parties.map((p) => p.seats)));
    run(w, 6);
    expect(Number.isFinite(c.pol.approval)).toBe(true);
  });

  it('elegir un partido de la oposición le da el gobierno y los escaños del partido gobernante', () => {
    const base = createWorld({ seed: 'partido2', player: 'MEX' });
    const opp = base.countries.MEX.pol.parties.find((p) => !p.gov)!;
    const govSeats = base.countries.MEX.pol.parties.find((p) => p.gov)!.seats;
    const w = createWorld({ seed: 'partido2', player: 'MEX', party: { mode: 'existing', name: opp.name } });
    const c = w.countries.MEX;
    expect(c.pol.govParty).toBe(opp.name);
    expect(c.pol.ideology).toBe(opp.ideology);
    expect(c.pol.parties.find((p) => p.name === opp.name)!.seats).toBeCloseTo(govSeats, 0);
  });
});

describe('F7: corrupción, policía y narcotráfico', () => {
  it('la corrupción general es la media ponderada de sus seis tipos', () => {
    const w = createWorld({ seed: 'corr', player: null });
    const total = CORRUPTION_TYPES.reduce((a, k) => a + CORRUPTION_INFO[k].weight, 0);
    expect(total).toBeCloseTo(1, 6);
    for (const id of ['MEX', 'DEU', 'RUS', 'NGA']) {
      const c = w.countries[id];
      expect(c.pol.corruption).toBeCloseTo(overallCorruption(c), 6);
      expect(c.pol.corruption).toBeCloseTo(c.base.corruption, 1);
    }
    expect(w.countries.MEX.corr.policial).toBeGreaterThan(w.countries.MEX.corr.administrativa);
    expect(w.countries.DEU.corr.electoral).toBeLessThan(w.countries.RUS.corr.electoral);
  });

  it('la depuración policial reduce la corrupción policial y mejora la eficacia de la policía', () => {
    const w = createWorld({ seed: 'depura', player: 'MEX' });
    const alt = cloneWorld(w);
    const r = executeAction(alt, ACTION_BY_ID.depuracion_policial, { actor: alt.countries.MEX });
    expect(r.ok).toBe(true);
    run(w, 18); run(alt, 18);
    expect(alt.countries.MEX.corr.policial).toBeLessThan(w.countries.MEX.corr.policial - 4);
    expect(alt.countries.MEX.police.effectiveness).toBeGreaterThan(w.countries.MEX.police.effectiveness);
  });

  it('una ofensiva antinarco debilita a los cárteles pero dispara la violencia a corto plazo', () => {
    const w = createWorld({ seed: 'narco', player: 'MEX' }); // sin elecciones hasta 2030
    const alt = cloneWorld(w);
    const c = alt.countries.MEX;
    c.pol.ap = 20;
    expect(previewAction(alt, ACTION_BY_ID.ofensiva_antinarco, { actor: c }).ok).toBe(true);
    executeAction(alt, ACTION_BY_ID.ofensiva_antinarco, { actor: c });
    run(w, 4); run(alt, 4);
    expect(alt.countries.MEX.narco.violence).toBeGreaterThan(w.countries.MEX.narco.violence + 5);
    run(w, 14); run(alt, 14);
    expect(alt.gameOver).toBeNull();
    expect(alt.countries.MEX.narco.cartels).toBeLessThan(w.countries.MEX.narco.cartels - 3);
  });
});

describe('F7: necesidades civiles', () => {
  it('parten sin presión y un encarecimiento de los alimentos crea presión social y protestas', () => {
    const w = createWorld({ seed: 'necesidades', player: 'EGY' });
    expect(w.countries.EGY.soc.pressure).toBe(0);
    expect(Object.keys(w.countries.EGY.soc.needs)).toHaveLength(9);
    const alt = cloneWorld(w);
    const shock = () => { alt.market.price.food = alt.market.base.food * 2.2; };
    for (let i = 0; i < 6; i++) { shock(); advanceTurn(alt); advanceTurn(w); }
    const a = alt.countries.EGY, b = w.countries.EGY;
    expect(a.soc.needs.alimentacion).toBeLessThan(b.soc.needs.alimentacion - 5);
    expect(a.soc.pressure).toBeGreaterThan(b.soc.pressure + 3);
    expect(a.soc.protest).toBeGreaterThan(b.soc.protest);
  });
});

describe('F7: armas biológicas', () => {
  it('programa → diseño con puntos limitados → liberación: brote en el objetivo, protegido el creador con vacuna', () => {
    const w = createWorld({ seed: 'bio', player: 'IRN' });
    const c = w.countries.IRN;
    c.pol.ap = 20;
    expect(executeAction(w, ACTION_BY_ID.programa_biologico, { actor: c }).ok).toBe(true);
    c.bio.program = 60;
    const cap = designCapacity(c);
    const tooMuch = { kind: 'humano', transmission: 5, lethality: 5, stealth: 5, resistance: 5, vaccine: 1, name: 'X' };
    expect(cap).toBeLessThan(20);
    expect(previewAction(w, ACTION_BY_ID.disenar_patogeno, { actor: c, params: tooMuch }).ok).toBe(false);
    const params = { kind: 'humano', transmission: 4, lethality: 3, stealth: 3, resistance: 2, vaccine: 1, name: 'Quimera' };
    expect(executeAction(w, ACTION_BY_ID.disenar_patogeno, { actor: c, params }).ok).toBe(true);
    const d = c.bio.designs[0];
    c.bio.exposed = 0; // evita la filtración aleatoria en la prueba
    while (w.turn < d.ready) advanceTurn(w);
    c.pol.ap = 20;
    const t = w.countries.ISR;
    expect(executeAction(w, ACTION_BY_ID.liberar_patogeno, { actor: c, target: t, params: { design: d.id } }).ok).toBe(true);
    const ob = w.global.outbreaks.find((o) => o.creator === 'IRN')!;
    expect(ob.vaccineFor).toBe('IRN');
    run(w, 5);
    expect(ob.infected.ISR).toBeGreaterThan(0.01);
    expect(ob.detected).toBe(true);
    expect(ob.deaths).toBeGreaterThan(0);
  });

  it('si se atribuye un ataque, el creador pierde reputación, recibe sanciones y da casus belli a la víctima', () => {
    const w = createWorld({ seed: 'bio2', player: null });
    const c = w.countries.PAK, t = w.countries.IND;
    const rep = c.reputation;
    const sancBefore = w.sanctions.filter((s) => s.target === 'PAK').length;
    w.global.outbreaks.push({ id: 'x', name: 'Prueba', kind: 'cultivos', transmission: 3, lethality: 3, stealth: 2, resistance: 2, infected: { IND: 0.1 }, months: 3, origin: 'IND', creator: 'PAK', attributed: false, detected: true, vaccineFor: null, deaths: 0 });
    attributeOutbreak(w, w.global.outbreaks[0]);
    expect(c.reputation).toBeLessThan(rep - 30);
    expect(w.sanctions.filter((s) => s.target === 'PAK').length).toBeGreaterThan(sancBefore);
    expect(t.pol.flags.cb_PAK).toBe(w.turn);
  });
});

describe('F7: armamento', () => {
  it('un diseño propio, al terminar, aumenta el poder de ese tipo de unidad', () => {
    const w = createWorld({ seed: 'armas', player: 'KOR' });
    const c = w.countries.KOR;
    c.pol.ap = 20;
    const p0 = c.mil.power;
    const r = executeAction(w, ACTION_BY_ID.disenar_arma, { actor: c, params: { base: 'carro', power: 4, armor: 3, economy: 2, name: 'K-3' } });
    expect(r.ok).toBe(true);
    const d = c.mil.designs[0];
    expect(d.name).toBe('K-3');
    for (let i = 0; i < d.total; i++) advanceTurn(w);
    expect(d.done).toBe(true);
    expect(designBonus(c, 'tanks')).toBeGreaterThan(0.05);
    const withBonus = c.mil.power;
    c.mil.designs = [];
    computePower(c);
    expect(withBonus).toBeGreaterThan(c.mil.power);
    expect(p0).toBeGreaterThan(0);
  });

  it('las armas compradas pierden la mitad de su eficacia si el proveedor te sanciona', () => {
    const w = createWorld({ seed: 'compra', player: 'POL' });
    const c = w.countries.POL, s = w.countries.USA;
    c.pol.ap = 20;
    expect(executeAction(w, ACTION_BY_ID.comprar_armamento, { actor: c, target: s, params: { base: 'caza' } }).ok).toBe(true);
    const d = c.mil.designs[0];
    for (let i = 0; i < d.total; i++) advanceTurn(w);
    const full = designBonus(c, 'fighters');
    expect(full).toBeGreaterThan(0);
    setSanction(w, s, c, 3);
    updateWeapons(w, c);
    expect(designBonus(c, 'fighters')).toBeCloseTo(full / 2, 6);
  });
});

describe('F7: partidas antiguas', () => {
  it('una partida sin los sistemas nuevos se migra al cargarla y sigue simulándose', () => {
    const w = createWorld({ seed: 'migra', player: 'FRA' });
    const raw = JSON.parse(serialize(w));
    raw.version = 1;
    delete raw.global.outbreaks;
    for (const id of raw.order) { const c = raw.countries[id]; delete c.police; delete c.corr; delete c.narco; delete c.bio; delete c.mil.designs; delete c.soc.needs; }
    const m = deserialize(JSON.stringify(raw));
    expect(m.version).toBe(SAVE_VERSION);
    expect(m.countries.FRA.police.size).toBeGreaterThan(0);
    expect(m.countries.FRA.soc.needs.alimentacion).toBeGreaterThan(0);
    run(m, 3);
    expect(Number.isFinite(m.countries.FRA.pol.corruption)).toBe(true);
  });
});
