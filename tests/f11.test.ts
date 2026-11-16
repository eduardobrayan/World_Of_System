import { describe, expect, it } from 'vitest';
import { createWorld } from '../src/sim/init';
import { advanceTurn } from '../src/sim/turn';
import { ACTION_BY_ID, executeAction, previewAction } from '../src/sim/actions';
import { ensureHandlers } from '../src/sim/registry';
import { serialize, deserialize, SAVE_VERSION } from '../src/sim/save';
import { MISSIONS, MISSION_BY_ID, INTRO_COUNT, RANKS, missionCandidates, missionProgress, missionsOf, rankOf, recordPlayerAction, swapMission, updateMissions } from '../src/sim/missions';
import { ACTIONS } from '../src/sim/actions';
import type { World } from '../src/sim/types';

const act = (w: World, id: string, target?: string) => {
  ensureHandlers();
  const c = w.countries[w.player!.country];
  c.pol.ap = 12;
  const res = executeAction(w, ACTION_BY_ID[id], { actor: c, target: target ? w.countries[target] : undefined });
  updateMissions(w);
  return res;
};

describe('F11: misiones', () => {
  it('los datos de misiones son coherentes (acciones recomendadas existentes, premios positivos)', () => {
    const ids = new Set(ACTIONS.map((a) => a.id));
    expect(INTRO_COUNT).toBeGreaterThanOrEqual(3);
    for (const m of MISSIONS) {
      for (const r of m.rec ?? []) expect(ids.has(r), `${m.id}: ${r}`).toBe(true);
      if (m.check.kind === 'acts') for (const r of m.check.ids ?? []) expect(ids.has(r), `${m.id}: ${r}`).toBe(true);
      expect(m.reward.ap).toBeGreaterThan(0);
      expect(m.reward.prestige).toBeGreaterThan(0);
      expect(m.name.length).toBeLessThan(60);
    }
  });

  it('la partida empieza con una misión y los «Primeros pasos» se cumplen actuando, con premio y misión siguiente', () => {
    const w = createWorld({ seed: 'mision', player: 'ESP' });
    const st = missionsOf(w)!;
    expect(st.current?.id).toBe('primera_decision');
    const c = w.countries.ESP;

    expect(act(w, 'campana_comunicacion').passed).toBe(true);
    expect(st.done).toBe(1);
    expect(st.prestige).toBe(MISSION_BY_ID.primera_decision.reward.prestige);
    expect(c.pol.ap).toBeGreaterThan(12 - 2); // se cobra el premio en capital político
    expect(st.current?.id).toBe('mira_el_mundo');

    // Una medida interior no vale para «Habla con otro país»; una visita sí
    act(w, 'lucha_fraude');
    expect(st.current?.id).toBe('mira_el_mundo');
    act(w, 'visita_diplomatica', 'FRA');
    expect(st.current?.id).toBe('escucha_gente');
    act(w, 'refuerzo_sanitario');
    expect(st.done).toBe(3);

    // Después llegan misiones adaptadas al país, con una meta distinta del punto de partida
    const run = st.current!;
    const def = MISSION_BY_ID[run.id];
    expect(def.stage).toBe('pool');
    if (def.check.kind === 'metric') expect(run.target).not.toBe(run.from);
    expect(missionProgress(w, run).done).toBe(false);
    expect(w.news.some((n) => n.type === 'mision')).toBe(true);
  });

  it('un intento tumbado por el parlamento basta para las dos primeras misiones, pero no para las siguientes', () => {
    const w = createWorld({ seed: 'intento', player: 'ESP' });
    const st = missionsOf(w)!;
    recordPlayerAction(w, ACTION_BY_ID.estimulo, false, false);
    updateMissions(w);
    expect(st.done).toBe(1);
    expect(st.current?.id).toBe('mira_el_mundo');
    recordPlayerAction(w, ACTION_BY_ID.estimulo, false, false); // una medida interior no cuenta como hablar con otro país
    updateMissions(w);
    expect(st.current?.id).toBe('mira_el_mundo');
    recordPlayerAction(w, ACTION_BY_ID.acuerdo_comercial, true, false);
    updateMissions(w);
    expect(st.current?.id).toBe('escucha_gente');
    recordPlayerAction(w, ACTION_BY_ID.ley_vivienda, false, false);
    updateMissions(w);
    expect(st.current?.id).toBe('escucha_gente');
  });

  it('una misión de medidor se cumple al llegar a la meta y caduca si pasa el plazo', () => {
    const w = createWorld({ seed: 'meta', player: 'MEX' });
    const st = missionsOf(w)!;
    const c = w.countries.MEX;
    for (let i = 0; i < INTRO_COUNT; i++) swapMission(w); // salta el aprendizaje
    expect(st.done).toBe(0);
    expect(MISSION_BY_ID[st.current!.id].stage).toBe('pool');

    expect(swapMission(w, 'bajar_delito')).toContain('Nueva misión');
    const run = st.current!;
    expect(run.target).toBeLessThan(run.from);
    c.police.crime = run.target - 1;
    const before = st.prestige;
    updateMissions(w);
    expect(st.prestige).toBe(before + MISSION_BY_ID.bajar_delito.reward.prestige);
    expect(st.log[st.log.length - 1]).toMatchObject({ id: 'bajar_delito', ok: true });
    expect(st.current!.id).not.toBe('bajar_delito');

    // Caducidad: sin premio y con otra misión distinta
    const cur = st.current!;
    if (cur.deadline < 0) cur.deadline = w.turn + 1;
    const p2 = st.prestige;
    w.turn = cur.deadline;
    updateMissions(w);
    expect(st.prestige).toBe(p2);
    expect(st.log[st.log.length - 1]).toMatchObject({ id: cur.id, ok: false });
    expect(st.current!.id).not.toBe(cur.id);
  });

  it('las misiones candidatas son posibles ahora y no incluyen la que está en curso', () => {
    const w = createWorld({ seed: 'cand', player: 'COL' });
    const st = missionsOf(w)!;
    for (let i = 0; i < INTRO_COUNT; i++) swapMission(w);
    const cands = missionCandidates(w);
    expect(cands.length).toBeGreaterThan(3);
    expect(cands.some((m) => m.id === st.current!.id)).toBe(false);
    expect(cands.some((m) => m.id === 'golpe_narco')).toBe(true); // Colombia tiene cárteles fuertes
    expect(cands.some((m) => m.id === 'firmar_paz')).toBe(false); // no está en guerra
  });

  it('un jugador que no hace nada conserva su misión y el mundo evoluciona igual que con otra semilla idéntica', () => {
    const a = createWorld({ seed: 'quieto', player: 'JPN' });
    const b = createWorld({ seed: 'quieto', player: 'JPN' });
    for (let i = 0; i < 6; i++) { advanceTurn(a); advanceTurn(b); }
    expect(missionsOf(a)!.current?.id).toBe('primera_decision');
    expect(serialize(a)).toBe(serialize(b));
  });

  it('el prestigio da rangos crecientes y las partidas antiguas reciben misiones al cargarse', () => {
    expect(rankOf(0).index).toBe(0);
    expect(rankOf(RANKS[1].min - 1).next?.min).toBe(RANKS[1].min);
    expect(rankOf(RANKS[1].min).index).toBe(1);
    expect(rankOf(10000).next).toBeNull();
    const w = createWorld({ seed: 'viejo', player: 'FRA' });
    const raw = JSON.parse(serialize(w));
    raw.version = 2;
    delete raw.player.missions;
    const m = deserialize(JSON.stringify(raw));
    expect(m.version).toBe(SAVE_VERSION);
    advanceTurn(m);
    expect(m.player!.missions.current?.id).toBe('primera_decision');
  });

  it('las acciones recomendadas de las primeras misiones están disponibles al empezar en varios países', () => {
    ensureHandlers();
    for (const id of ['ESP', 'USA', 'CHN', 'BRA', 'NGA']) {
      const w = createWorld({ seed: 'rec', player: id });
      const c = w.countries[id];
      const rec = MISSION_BY_ID.escucha_gente.rec!.map((r) => ACTION_BY_ID[r]).filter((d) => !d.regimes || d.regimes.includes(c.pol.regime));
      c.pol.ap = 8;
      expect(rec.some((d) => previewAction(w, d, { actor: c }).ok), id).toBe(true);
    }
  });
});
