/** Elecciones, golpes de Estado, revoluciones y cambios de gobierno. */
import type { Contribution, Country, World } from './types';
import { GROUPS, MINISTRIES } from './types';
import { DATA, ideologyOf, regimeOf } from './data';
import { Rng } from './rng';
import { addModifier } from './effects';
import { baseRelation, generateMinister } from './init';
import { clamp, news, rngOf, timeline, dateLabel } from './util';

function part(arr: Contribution[], label: string, value: number) {
  if (Math.abs(value) > 1e-3) arr.push({ label, value });
  return value;
}

/** Voto previsto al gobierno (% de escaños/votos del bloque gubernamental). */
export function projectedVote(world: World, c: Country): { value: number; parts: Contribution[] } {
  const p: Contribution[] = [];
  const hist = c.history.slice(-12);
  const g12 = hist.length ? hist.reduce((a, s) => a + s.growth, 0) / hist.length : c.eco.growth;
  let v = part(p, 'Base electoral (fragmentación de la oposición)', 28);
  v += part(p, 'Aprobación del gobierno', 0.56 * c.pol.approval);
  if (world.player?.country === c.id) {
    const d = world.player.difficulty;
    v += part(p, 'Dificultad', d === 'facil' ? 3 : d === 'dificil' ? -2 : 0);
  }
  v += part(p, 'Economía (crecimiento medio)', clamp((g12 - 1.5) * 1.4, -6, 5));
  v += part(p, 'Empleo', clamp(((c.base.unemployment ?? c.eco.unemployment) - c.eco.unemployment) * 0.5, -5, 4));
  v += part(p, 'Inflación', -clamp(c.eco.inflation - 5, 0, 40) * 0.3);
  v += part(p, 'Manipulación electoral', c.pol.electionManip);
  v += part(p, 'Cansancio de guerra', -c.pol.warWeariness * 0.08);
  return { value: clamp(v, 5, 92), parts: p };
}

function redistributeSeats(c: Country, govShare: number, rng: Rng) {
  const gov = c.pol.parties.filter((x) => x.gov);
  const opp = c.pol.parties.filter((x) => !x.gov);
  const govTot = gov.reduce((a, x) => a + x.seats, 0) || 1;
  const oppTot = opp.reduce((a, x) => a + x.seats, 0) || 1;
  for (const x of gov) x.seats = Math.max(1, (x.seats / govTot) * govShare * (0.9 + rng.next() * 0.2));
  for (const x of opp) x.seats = Math.max(1, (x.seats / oppTot) * (100 - govShare) * (0.8 + rng.next() * 0.4));
  const tot = c.pol.parties.reduce((a, x) => a + x.seats, 0);
  for (const x of c.pol.parties) x.seats = Math.round((x.seats / tot) * 1000) / 10;
}

/** Cambio de gobierno (elecciones, golpe, revolución): nueva ideología y ajustes en cadena. */
export function changeGovernment(world: World, c: Country, ideology: string, opts: { party?: string; regime?: string; leaderTitle?: string; reason: string; honeymoon?: number }) {
  const oldBase: Record<string, number> = {};
  for (const id of world.order) if (id !== c.id) oldBase[id] = baseRelation(world, c, world.countries[id]);
  const oldIdeo = ideologyOf(c.pol.ideology), newIdeo = ideologyOf(ideology);
  c.pol.ideology = ideology;
  if (opts.regime) c.pol.regime = opts.regime;
  if (opts.leaderTitle) c.pol.leaderTitle = opts.leaderTitle;
  for (const x of c.pol.parties) x.gov = false;
  let party = c.pol.parties.find((x) => x.name === opts.party);
  if (!party) {
    party = { id: `${c.id}_p${c.pol.parties.length}`, name: opts.party ?? newIdeo.name, ideology, seats: 50, gov: true };
    c.pol.parties.push(party);
  }
  party.gov = true;
  party.ideology = ideology;
  c.pol.govParty = party.name;
  const rng = rngOf(world);
  const pool = DATA.names[c.area] ?? DATA.names.anglo;
  c.pol.leaderName = `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
  c.pol.ministers = MINISTRIES.map((m) => generateMinister(rng, c, m, rng.next() < 0.5 ? 'leal' : 'tecnocrata', world.turn));
  world.rng = rng.state;
  // Personalidad: el nuevo gobierno trae otra visión del mundo
  c.ai.aggression = clamp(c.ai.aggression + (newIdeo.nat - oldIdeo.nat) * 0.25 + (newIdeo.auth - oldIdeo.auth) * 0.15, 0.05, 0.95);
  c.ai.ideologyZeal = clamp(c.ai.ideologyZeal + (Math.abs(newIdeo.auth) - Math.abs(oldIdeo.auth)) * 0.2, 0.05, 0.95);
  c.pol.electionManip = 0;
  c.pol.repression = 0;
  // Relaciones estructurales y confianza: un gobierno nuevo hereda menos rencores
  for (const id of world.order) {
    if (id === c.id) continue;
    const delta = baseRelation(world, c, world.countries[id]) - oldBase[id];
    const a = world.rel[c.id]?.[id], b = world.rel[id]?.[c.id];
    if (a) { a.base = clamp(a.base + delta, -90, 90); a.op = clamp(a.op + delta * 0.5, -100, 100); a.trust = a.trust + (50 - a.trust) * 0.3; }
    if (b) { b.base = clamp(b.base + delta, -90, 90); b.op = clamp(b.op + delta * 0.5, -100, 100); }
  }
  c.memory = c.memory.filter((m) => world.turn - m.turn < 24 || Math.abs(m.value) > 20);
  addModifier(world, c, { id: 'luna_de_miel', name: 'Luna de miel del nuevo gobierno', duration: opts.honeymoon ?? 12, mods: { 'group.all': 6, legitimacy: 4 } }, 'gobierno');
  news(world, `🏛 Cambio de gobierno en ${c.name}: ${opts.reason}. Nuevo ${c.pol.leaderTitle.toLowerCase()}: ${c.pol.leaderName} (${party.name}, ${newIdeo.name}).`, 'gobierno', [c.id], 3);
}

export function holdElection(world: World, c: Country) {
  const reg = regimeOf(c.pol.regime);
  const rng = rngOf(world);
  const pv = projectedVote(world, c);
  const share = clamp(pv.value + rng.normal() * 3.5, 3, 95);
  world.rng = rng.state;
  const isPlayer = world.player?.country === c.id;
  c.pol.lastElection = world.turn;
  c.pol.nextElection = world.turn + reg.electionInterval;
  if (share >= 50) {
    redistributeSeats(c, share, new Rng(world.rng));
    c.pol.legitimacy = clamp(c.pol.legitimacy + 5, 0, 100);
    news(world, `🗳 Elecciones en ${c.name}: el gobierno (${c.pol.govParty}) revalida su mayoría con el ${share.toFixed(1)} %.`, 'elecciones', [c.id], isPlayer ? 3 : 1);
    if (isPlayer) {
      timeline(world, `Elecciones ganadas (${share.toFixed(1)} %)`, 'elecciones');
      addModifier(world, c, { id: 'mandato_renovado', name: 'Mandato renovado', duration: 6, mods: { 'group.all': 3 } }, 'elecciones');
    }
    c.pol.electionManip = 0;
    return;
  }
  if (isPlayer) {
    news(world, `🗳 Elecciones en ${c.name}: el gobierno pierde con el ${share.toFixed(1)} % de los votos.`, 'derrota', [c.id], 3);
    timeline(world, `Derrota electoral (${share.toFixed(1)} %)`, 'derrota');
    world.gameOver = {
      turn: world.turn, victory: false, reason: 'elecciones',
      text: `Has perdido las elecciones de ${dateLabel(world.turn)} con el ${share.toFixed(1)} % de los votos. La oposición formará gobierno.`,
    };
    return;
  }
  const opp = c.pol.parties.filter((x) => !x.gov).sort((a, b) => b.seats - a.seats)[0];
  redistributeSeats(c, share, new Rng(world.rng));
  for (const x of c.pol.parties) x.gov = false;
  const winner = opp ?? c.pol.parties[0];
  // El ganador obtiene la mayoría de escaños del antiguo bloque gubernamental
  winner.seats = Math.max(winner.seats, 100 - share);
  changeGovernment(world, c, winner.ideology, { party: winner.name, reason: `la oposición gana las elecciones (${(100 - share).toFixed(1)} %)` });
  c.pol.legitimacy = clamp(c.pol.legitimacy + 6, 0, 100);
}

/** Golpes y revoluciones: se comprueban cada mes. */
export function checkRegimeThreats(world: World, c: Country) {
  if (world.forecast) return;
  const rng = rngOf(world);
  const isPlayer = world.player?.country === c.id;
  const coupRoll = rng.next();
  const revRoll = rng.next();
  const succRoll = rng.next();
  world.rng = rng.state;
  if (coupRoll < c.pol.coupRisk / 100) {
    const success = succRoll < clamp(0.35 + (35 - c.groups.military.support) * 0.015 + (40 - c.pol.stability) * 0.01, 0.1, 0.85);
    if (success) {
      if (isPlayer) {
        news(world, `⚔ Golpe de Estado en ${c.name}: los militares toman el poder.`, 'derrota', [c.id], 3);
        timeline(world, 'Derrocado por un golpe de Estado', 'derrota');
        world.gameOver = { turn: world.turn, victory: false, reason: 'golpe', text: 'Las fuerzas armadas te han derrocado. El país queda en manos de una junta militar.' };
        return;
      }
      changeGovernment(world, c, 'nacionalismo_autoritario', { party: 'Junta militar', regime: 'junta_militar', leaderTitle: 'Presidente de la Junta', reason: 'golpe de Estado militar', honeymoon: 6 });
      c.pol.nextElection = -1;
      c.groups.military.support = clamp(c.groups.military.support + 25, 0, 100);
      c.reputation = clamp(c.reputation - 15, 0, 100);
      for (const id of world.order) {
        const o = world.countries[id];
        if (id !== c.id && regimeOf(o.pol.regime).competitive && world.rel[id]?.[c.id]) world.rel[id][c.id].op = clamp(world.rel[id][c.id].op - 15, -100, 100);
      }
    } else {
      news(world, `⚔ Fracasa un intento de golpe de Estado en ${c.name}.`, 'crisis', [c.id], isPlayer ? 3 : 2);
      c.pol.repression = clamp(c.pol.repression + 30, 0, 100);
      c.groups.military.support = clamp(c.groups.military.support - 10, 0, 100);
      c.pol.stability = clamp(c.pol.stability + 4, 0, 100);
      addModifier(world, c, { id: 'golpe_fallido', name: 'Golpe fallido: purga posterior', duration: 18, mods: { coupRisk: -1, morale: -6 } }, 'golpe');
      if (isPlayer) timeline(world, 'Sobrevives a un intento de golpe', 'crisis');
    }
    return;
  }
  if (revRoll < c.pol.revolutionRisk / 100) {
    const success = succRoll < clamp(0.4 + (c.soc.protest - 70) * 0.012 + (25 - c.pol.stability) * 0.01, 0.15, 0.85);
    if (success) {
      if (isPlayer) {
        news(world, `✊ Revolución en ${c.name}: el gobierno cae.`, 'derrota', [c.id], 3);
        timeline(world, 'Derrocado por una revolución', 'derrota');
        world.gameOver = { turn: world.turn, victory: false, reason: 'revolucion', text: 'Las protestas se han convertido en una revolución que ha derribado a tu gobierno.' };
        return;
      }
      const wasCompetitive = regimeOf(c.pol.regime).competitive;
      const newIdeo = c.groups.workers.support < c.groups.youth.support ? 'populismo_izquierda' : 'liberal';
      changeGovernment(world, c, wasCompetitive ? 'populismo_izquierda' : newIdeo, {
        party: wasCompetitive ? 'Movimiento revolucionario' : 'Gobierno de transición', regime: wasCompetitive ? 'hibrido' : 'democracia_imperfecta',
        leaderTitle: 'Presidente', reason: 'revolución popular', honeymoon: 18,
      });
      c.pol.nextElection = world.turn + 18;
      c.soc.protest = 25;
    } else {
      news(world, `✊ Sofocado un levantamiento popular en ${c.name}.`, 'crisis', [c.id], isPlayer ? 3 : 2);
      c.soc.protest = clamp(c.soc.protest * 0.7, 0, 100);
      c.pol.repression = clamp(c.pol.repression + 40, 0, 100);
      for (const g of GROUPS) c.groups[g].radical = clamp(c.groups[g].radical + 10, 0, 100);
    }
  }
}

export function updateElections(world: World, c: Country) {
  const reg = regimeOf(c.pol.regime);
  if (reg.elections && c.pol.nextElection >= 0 && world.turn >= c.pol.nextElection) holdElection(world, c);
  checkRegimeThreats(world, c);
}
