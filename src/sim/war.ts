/**
 * Guerras resueltas de forma abstracta por frentes: fuerza, logística, terreno, moral, tecnología y apoyo aéreo/naval.
 * Desgaste, ocupación regional, coste económico, cansancio, paz con términos configurables y escalada nuclear.
 */
import type { Country, Front, Id, Region, War, World } from './types';
import { UNIT_TYPES } from './types';
import { UNIT_BY_ID, personalityOf } from './data';
import { addShock, allied, neighborsLand, neighborsSea, occupiedShare } from './vars';
import { addModifier } from './effects';
import { remember, signTreaty, endTreaty, proposeResolution } from './diplomacy';
import { decideProposal, evaluateProposal, logDecision } from './ai';
import { doctrineOf, computePower } from './military';
import { centroidOf } from './market';
import { bumpRev, clamp, haversine, news, rngOf, timeline, uid } from './util';
import type { Rng } from './rng';

const TERRAIN_ATK: Record<string, number> = { llanura: 1.0, mixto: 0.9, bosque: 0.8, desierto: 0.9, montaña: 0.65, selva: 0.7, urbano: 0.75, tundra: 0.8 };

export function sideOf(w: War, id: Id): 'A' | 'D' | null {
  return w.attackers.includes(id) ? 'A' : w.defenders.includes(id) ? 'D' : null;
}

export function warsOfCountry(world: World, id: Id): War[] {
  return world.wars.filter((w) => sideOf(w, id));
}

function canFight(world: World, a: Id, d: Id): 'land' | 'sea' | null {
  if (neighborsLand(a).includes(d)) return 'land';
  const ca = world.countries[a];
  if (neighborsSea(a).includes(d) || ca.mil.navalPower > 400) return 'sea';
  return null;
}

function rebuildFronts(world: World, w: War) {
  const fronts: Front[] = [];
  for (const a of w.attackers) for (const d of w.defenders) {
    const kind = canFight(world, a, d) ?? (canFight(world, d, a) ? 'sea' : null);
    if (!kind) continue;
    const ex = w.fronts.find((f) => f.a === a && f.d === d);
    fronts.push(ex ?? { a, d, kind, control: 0, momentum: 0, calib: 1 });
  }
  w.fronts = fronts;
}

/** Declara una guerra; los aliados con defensa mutua del defensor pueden unirse. */
export function declareWar(world: World, attacker: Country, defender: Country, goal: string, rng: Rng): War {
  const war: War = {
    id: uid(world, 'w'), name: `Guerra ${attacker.short}–${defender.short}`, attackers: [attacker.id], defenders: [defender.id],
    leaderA: attacker.id, leaderD: defender.id, start: world.turn, fronts: [], score: 0, exhaustionA: 0, exhaustionD: 0,
    casualtiesA: 0, casualtiesD: 0, goal, ceasefire: 0, nuclear: 0, blockade: [],
  };
  world.wars.push(war);
  bumpRev(world);
  // Romper pactos de no agresión y tratados entre ambos
  for (const t of world.treaties.filter((x) => x.parties.includes(attacker.id) && x.parties.includes(defender.id))) endTreaty(world, t, attacker);
  const cb = (attacker.pol.flags[`cb_${defender.id}`] ?? -99) >= world.turn - 12;
  attacker.reputation = clamp(attacker.reputation - (cb ? 6 : 15), 0, 100);
  remember(world, defender, attacker.id, 'agresion');
  world.incidents.push({ turn: world.turn, actor: attacker.id, target: defender.id, kind: 'guerra', magnitude: 3, text: war.name });
  news(world, `⚔ ${attacker.name} declara la guerra a ${defender.name}${cb ? ' (con casus belli)' : ''}.`, 'guerra', [attacker.id, defender.id], 3);
  // Aliados del defensor
  for (const id of world.order) {
    if (id === attacker.id || id === defender.id) continue;
    const c = world.countries[id];
    if (!c.alive || !allied(world, id, defender.id) || allied(world, id, attacker.id)) continue;
    if (world.player?.country === id) {
      // El jugador decide: se le notifica; entra si lo elige desde la pestaña Militar
      news(world, `🛡 Tu aliado ${defender.name} ha sido atacado por ${attacker.name}. Puedes intervenir desde la pestaña Militar.`, 'guerra', [id], 3);
      continue;
    }
    const p = c.ai;
    const deterred = attacker.mil.nukes > 0 && c.mil.nukes === 0 ? 0.5 : 0;
    const prob = clamp(0.25 + p.reliability * 0.6 - p.riskAversion * 0.3 - deterred + (neighborsLand(id).includes(attacker.id) ? 0.1 : 0), 0.05, 0.95);
    if (rng.next() < prob) {
      war.defenders.push(id);
      remember(world, defender, id, 'aliado_guerra');
      c.mil.mobilization = Math.max(c.mil.mobilization, 1);
      news(world, `🛡 ${c.name} entra en la guerra en defensa de ${defender.name}.`, 'guerra', [id, defender.id, attacker.id], 2);
      logDecision(world, { turn: world.turn, actor: id, action: 'entrar_guerra', target: attacker.id, score: prob, accepted: true, text: `${c.name} defiende a su aliado ${defender.name}`, reasons: [`fiabilidad (${p.reliability.toFixed(2)})`, `alianza con ${defender.short}`] });
    } else {
      remember(world, defender, id, 'abandono');
      logDecision(world, { turn: world.turn, actor: id, action: 'no_intervenir', target: attacker.id, score: prob, accepted: false, text: `${c.name} no acude en ayuda de ${defender.name}`, reasons: [`aversión al riesgo (${p.riskAversion.toFixed(2)})`, deterred ? 'disuasión nuclear del agresor' : 'coste de la guerra'] });
    }
  }
  defender.mil.mobilization = Math.max(defender.mil.mobilization, 2);
  attacker.mil.mobilization = Math.max(attacker.mil.mobilization, 1);
  rebuildFronts(world, war);
  if (world.player?.country === attacker.id || world.player?.country === defender.id) timeline(world, war.name, 'guerra');
  proposeResolution(world, 'ONU', 'condena', world.order.find((id) => id !== attacker.id && !war.attackers.includes(id) && world.player?.country !== id && (world.rel[id]?.[defender.id]?.op ?? 0) > 30) ?? defender.id, attacker.id);
  return war;
}

/** Un país entra en una guerra existente en un bando. */
export function joinWar(world: World, w: War, c: Country, side: 'A' | 'D') {
  if (sideOf(w, c.id)) return;
  (side === 'A' ? w.attackers : w.defenders).push(c.id);
  c.mil.mobilization = Math.max(c.mil.mobilization, 1);
  const leader = world.countries[side === 'A' ? w.leaderA : w.leaderD];
  const enemy = world.countries[side === 'A' ? w.leaderD : w.leaderA];
  remember(world, leader, c.id, 'aliado_guerra');
  remember(world, enemy, c.id, 'agresion', 0.6);
  rebuildFronts(world, w);
  bumpRev(world);
  news(world, `${c.name} entra en «${w.name}» del lado de ${leader.name}.`, 'guerra', [c.id, leader.id, enemy.id], 2);
}

/** Apoyo material de terceros (programas de ayuda) traducido a poder de combate. */
function supportPower(world: World, id: Id): number {
  let s = 0;
  for (const t of world.treaties) if (t.type === 'aid' && t.parties[1] === id) s += Number(t.terms?.amount ?? 0) * 3;
  return s;
}

function logisticsFactor(world: World, a: Country, d: Country, kind: 'land' | 'sea'): number {
  const dist = haversine(centroidOf(a.id), centroidOf(d.id));
  const reach = (a.mil.logistics / 100) * doctrineOf(a).logistics + a.mil.units.transport * 0.004 + a.mil.units.logistic * 0.006;
  const distPenalty = clamp(1 - Math.max(0, dist - 1200) / 9000 / Math.max(0.3, reach), 0.25, 1);
  return (kind === 'sea' ? 0.6 : 1) * distPenalty;
}

function regionsByDistance(target: Country, from: Id): Region[] {
  const fc = centroidOf(from);
  return target.regions.filter((r) => r.owner === target.id).sort((x, y) => {
    if (x.capital !== y.capital) return x.capital ? 1 : -1;
    return haversine([x.lon, x.lat], fc) - haversine([y.lon, y.lat], fc);
  });
}

function applyOccupation(world: World, w: War, f: Front) {
  const def = world.countries[f.d], att = world.countries[f.a];
  // Avance atacante sobre el defensor
  const dRegions = regionsByDistance(def, f.a);
  const nOcc = Math.round(dRegions.length * clamp(f.control, 0, 100) / 100);
  dRegions.forEach((r, i) => {
    if (i < nOcc) { if (r.controller !== f.a) { r.controller = f.a; r.damage = clamp(r.damage + 25, 0, 100); } }
    else if (r.controller === f.a) r.controller = def.id;
  });
  // Contraofensiva sobre el atacante
  const aRegions = regionsByDistance(att, f.d);
  const nRev = Math.round(aRegions.length * clamp(-f.control, 0, 100) / 100);
  aRegions.forEach((r, i) => {
    if (i < nRev) { if (r.controller !== f.d) { r.controller = f.d; r.damage = clamp(r.damage + 25, 0, 100); } }
    else if (r.controller === f.d) r.controller = att.id;
  });
  void w;
}

function takeLosses(c: Country, frac: number): number {
  let personnel = 0;
  for (const k of UNIT_TYPES) {
    const u = UNIT_BY_ID[k];
    const f = u.domain === 'land' ? frac : frac * 0.35;
    const lost = c.mil.units[k] * f;
    c.mil.units[k] = Math.max(0, c.mil.units[k] - lost);
    personnel += lost * u.personnel;
  }
  c.mil.casualties += personnel;
  return personnel;
}

/** Resolución mensual de todas las guerras. */
export function updateWars(world: World) {
  if (!world.wars.length) return;
  const rng = rngOf(world);
  for (const w of [...world.wars]) {
    if (w.ceasefire > 0) continue;
    if (w.ceasefire === 0 && w.fronts.length === 0) rebuildFronts(world, w);
    // Fuerza disponible por país, repartida entre sus frentes
    const frontsOf: Record<Id, number> = {};
    for (const f of w.fronts) { frontsOf[f.a] = (frontsOf[f.a] ?? 0) + 1; frontsOf[f.d] = (frontsOf[f.d] ?? 0) + 1; }
    let lossA = 0, lossD = 0;
    for (const f of w.fronts) {
      const a = world.countries[f.a], d = world.countries[f.d];
      if (!a?.alive || !d?.alive) continue;
      const nA = frontsOf[f.a] ?? 1, nD = frontsOf[f.d] ?? 1;
      const allyBoost = (side: 'A' | 'D') => {
        let p = 0;
        for (const id of side === 'A' ? w.attackers : w.defenders) {
          if (id === f.a || id === f.d) continue;
          const c = world.countries[id];
          if (c?.alive) p += (c.mil.landPower * 0.15 + c.mil.airPower * 0.25) * (c.mil.logistics / 100);
        }
        return p / Math.max(1, w.fronts.length);
      };
      const airA = a.mil.airPower / Math.max(1, a.mil.airPower + d.mil.airPower);
      const atkBase = (a.mil.landPower / nA + allyBoost('A') + supportPower(world, a.id) + deployedTo(world, a.id)) * (0.8 + airA * 0.4) * (0.7 + a.mil.morale / 333);
      const defBase = (d.mil.landPower / nD + allyBoost('D') + supportPower(world, d.id) + deployedTo(world, d.id)) * (0.8 + (1 - airA) * 0.4) * (0.7 + d.mil.morale / 333);
      // Quien combate en su propio territorio tiene la ventaja defensiva; quien avanza sufre logística y terreno
      let ratio: number;
      if (f.control >= 0) {
        ratio = (atkBase * logisticsFactor(world, a, d, f.kind) * (TERRAIN_ATK[d.terrain] ?? 0.85)) / Math.max(1, defBase * 1.3 * doctrineOf(d).defense * (1 + f.control / 200));
      } else {
        ratio = (atkBase * 1.3 * doctrineOf(a).defense) / Math.max(1, defBase * logisticsFactor(world, d, a, f.kind) * (TERRAIN_ATK[a.terrain] ?? 0.85));
        ratio = Math.max(ratio, 0.05);
      }
      if (f.calib === undefined) {
        // Frente heredado de 2026: arranca casi estancado con ligera ventaja del atacante
        f.calib = w.start < 0 ? clamp(1.04 / Math.max(0.05, ratio), 0.4, 2.5) : 1;
      }
      ratio *= f.calib;
      if (f.kind === 'sea') {
        const nav = a.mil.navalPower / Math.max(1, d.mil.navalPower);
        ratio *= clamp(nav / 1.5, 0.15, 1);
      }
      const delta = 2.2 * Math.tanh(1.2 * Math.log(Math.max(0.05, ratio))) + rng.normal() * 0.8 + f.momentum * 0.25;
      f.momentum = clamp(f.momentum * 0.7 + Math.sign(delta) * 0.3, -2, 2);
      f.control = clamp(f.control + delta, -40, 100);
      applyOccupation(world, w, f);
      const intensity = 0.006 * (1 + Math.min(2, Math.abs(delta) / 3));
      lossA += takeLosses(a, intensity * Math.sqrt(1 / Math.max(0.3, ratio)) / nA);
      lossD += takeLosses(d, intensity * Math.sqrt(Math.max(0.3, ratio)) / nD);
    }
    w.casualtiesA += lossA;
    w.casualtiesD += lossD;
    // Puntuación, cansancio, economía de guerra
    const avg = w.fronts.length ? w.fronts.reduce((s, f) => s + f.control, 0) / w.fronts.length : 0;
    w.score = clamp(avg * 0.9 + (w.exhaustionD - w.exhaustionA) * 0.3, -100, 100);
    const leadA = world.countries[w.leaderA], leadD = world.countries[w.leaderD];
    w.exhaustionA = clamp(w.exhaustionA + 0.45 + lossA / Math.max(1, leadA.soc.pop) * 0.6 + occupiedShare(leadA) * 3 - (avg > 20 ? 0.15 : 0), 0, 100);
    w.exhaustionD = clamp(w.exhaustionD + 0.4 + lossD / Math.max(1, leadD.soc.pop) * 0.6 + occupiedShare(leadD) * 2, 0, 100);
    for (const id of [...w.attackers, ...w.defenders]) {
      const c = world.countries[id];
      if (!c?.alive) continue;
      const exh = sideOf(w, id) === 'A' ? w.exhaustionA : w.exhaustionD;
      c.pol.warWeariness = clamp(c.pol.warWeariness + (exh * 0.8 - c.pol.warWeariness) * 0.1, 0, 100);
      c.eco.extraSpending += c.eco.gdp * 0.015;
      const front = occupiedShare(c);
      addShock(c, 'growth', 'Guerra', -0.6 - front * 6 - (w.blockade.includes(id) ? 1.5 : 0));
      addShock(c, 'inflation', 'Economía de guerra', 0.8 + front * 4);
      const s = sideOf(w, id) === 'A' ? w.score : -w.score;
      addShock(c, 'morale', 'Marcha de la guerra', s * 0.05);
    }
    escalation(world, w, rng);
    aiPeace(world, w, rng);
    checkCapitulation(world, w);
  }
  // Fin de altos el fuego
  for (const w of [...world.wars]) {
    if (w.ceasefire === 1) {
      const exh = (w.exhaustionA + w.exhaustionD) / 2;
      if (exh > 45 || rng.next() < 0.5) makePeace(world, w, { cede: 1 }, 'alto el fuego consolidado');
      else news(world, `⚔ Expira el alto el fuego en «${w.name}»: se reanudan los combates.`, 'guerra', [w.leaderA, w.leaderD], 2);
    }
  }
  world.rng = rng.state;
}

function deployedTo(world: World, id: Id): number {
  let p = 0;
  for (const oid of world.order) {
    const c = world.countries[oid];
    const share = c.mil.deployments[id];
    if (share) p += c.mil.landPower * share;
  }
  return p;
}

// ---------- Escalada nuclear ----------
export const NUCLEAR_LEVELS = ['Sin alerta', 'Alerta nuclear', 'Amenaza explícita', 'Uso táctico', 'Intercambio estratégico'];

function escalation(world: World, w: War, rng: Rng) {
  for (const id of [...w.attackers, ...w.defenders]) {
    const c = world.countries[id];
    if (!c?.alive || c.mil.nukes <= 0 || world.player?.country === id) continue;
    const s = sideOf(w, id) === 'A' ? w.score : -w.score;
    const occ = occupiedShare(c);
    const capitalLost = c.regions.some((r) => r.capital && r.owner === c.id && r.controller !== c.id);
    const desperate = occ > 0.25 || s < -55 || capitalLost;
    const p = c.ai;
    const lv = c.mil.nuclearPosture;
    const temper = p.aggression * (1 - p.riskAversion);
    let want = 0;
    if (desperate) {
      if (lv === 0) want = 0.06 + temper * 0.1;
      else if (lv === 1) want = 0.03 + temper * 0.06;
      else if (lv === 2 && (occ > 0.4 || capitalLost)) want = 0.01 + temper * 0.03;
    }
    // Represalia estratégica solo si el enemigo ya ha usado armas nucleares
    const enemyUsed = (sideOf(w, id) === 'A' ? w.defenders : w.attackers).some((x) => (world.countries[x]?.mil.nuclearPosture ?? 0) >= 3);
    if (lv === 3 && enemyUsed) want = 0.04 * (1 - p.riskAversion);
    if (want > 0 && rng.next() < want && lv < 4) raisePosture(world, c, w);
    else if (!desperate && lv > 0 && lv < 3 && rng.next() < 0.12) c.mil.nuclearPosture -= 1;
  }
}

export function raisePosture(world: World, c: Country, w?: War) {
  c.mil.nuclearPosture = Math.min(4, c.mil.nuclearPosture + 1);
  bumpRev(world);
  const lv = c.mil.nuclearPosture;
  world.global.tension = clamp(world.global.tension + 8 * lv, 0, 100);
  news(world, `☢ ${c.name}: ${NUCLEAR_LEVELS[lv]}.`, 'nuclear', [c.id], 3);
  for (const id of world.order) if (id !== c.id && world.rel[id]?.[c.id]) world.rel[id][c.id].op = clamp(world.rel[id][c.id].op - 4 * lv, -100, 100);
  if (lv === 3 && w) {
    w.nuclear = Math.max(w.nuclear, 3);
    const enemies = (sideOf(w, c.id) === 'A' ? w.defenders : w.attackers).map((x) => world.countries[x]).filter(Boolean);
    for (const e of enemies) {
      takeLosses(e, 0.08);
      e.soc.pop *= 0.997;
      for (const r of e.regions) r.damage = clamp(r.damage + 20, 0, 100);
      for (const f of w.fronts) if (f.d === e.id || f.a === e.id) f.control = clamp(f.control + (f.a === c.id ? 15 : -15), -60, 100);
    }
    c.reputation = 0;
    news(world, `☢☢ ${c.name} emplea armas nucleares tácticas en «${w.name}». El mundo contiene la respiración.`, 'nuclear', [c.id, ...enemies.map((e) => e.id)], 3);
  }
  if (lv === 4) {
    w && (w.nuclear = 4);
    world.gameOver = {
      turn: world.turn, victory: false, reason: 'nuclear',
      text: `${c.name} ha iniciado un intercambio nuclear estratégico. La civilización tal y como la conocíamos ha terminado.`,
    };
    news(world, '☢☢☢ Guerra nuclear global.', 'nuclear', world.order, 3);
  }
}

// ---------- Paz ----------
export interface PeaceTerms { cede?: number; reparations?: number; demilitarize?: number; leaveAlliances?: number; regime?: number }

/** Dureza de los términos para el perdedor (0..3). */
export function termsCost(world: World, w: War, terms: PeaceTerms, loserId: Id): number {
  const loser = world.countries[loserId];
  let c = 0;
  if (terms.cede) c += occupiedShare(loser) * 4;
  if (terms.reparations) c += terms.reparations * 0.5;
  if (terms.demilitarize) c += 0.6;
  if (terms.leaveAlliances) c += 0.5;
  if (terms.regime) c += 1.5;
  return c;
}

export function peaceAcceptance(world: World, w: War, proposer: Country, terms: PeaceTerms) {
  const proposerSide = sideOf(w, proposer.id);
  const otherId = proposerSide === 'A' ? w.leaderD : w.leaderA;
  const other = world.countries[otherId];
  const score = proposerSide === 'A' ? -w.score : w.score; // desde el punto de vista del receptor
  const exhaustion = proposerSide === 'A' ? w.exhaustionD : w.exhaustionA;
  // Los términos castigan al receptor solo si el que propone es el que impone condiciones
  const cost = termsCost(world, w, terms, otherId);
  return { other, ev: evaluateProposal(world, proposer, other, 'peace', { score, exhaustion, cost }) };
}

export function makePeace(world: World, w: War, terms: PeaceTerms, reason: string, winnerSide?: 'A' | 'D') {
  const winSide = winnerSide ?? (w.score >= 0 ? 'A' : 'D');
  const winners = (winSide === 'A' ? w.attackers : w.defenders).map((id) => world.countries[id]).filter(Boolean);
  const losers = (winSide === 'A' ? w.defenders : w.attackers).map((id) => world.countries[id]).filter(Boolean);
  const lead = winners[0];
  const parts: string[] = [];
  // Cesión de regiones ocupadas (o devolución si no se ceden)
  for (const id of [...w.attackers, ...w.defenders]) {
    const c = world.countries[id];
    if (!c) continue;
    let ceded = 0;
    const occList = c.regions.filter((x) => x.owner === c.id && x.controller !== c.id && !x.capital).sort((x, y) => x.popShare - y.popShare);
    for (const r of c.regions.filter((x) => x.owner === c.id && x.controller !== c.id)) {
      const occupier = world.countries[r.controller];
      const withinLimit = occList.includes(r) && ceded + r.popShare <= 0.35;
      const cede = terms.cede && losers.includes(c) && occupier && winners.includes(occupier) && withinLimit;
      if (cede) ceded += r.popShare;
      if (cede) {
        r.owner = occupier.id;
        c.regions = c.regions.filter((x) => x !== r);
        occupier.regions.push(r);
        parts.push(`${r.name} pasa a ${occupier.short}`);
        c.soc.pop *= 1 - r.popShare;
        occupier.soc.pop += r.pop;
        c.eco.gdp *= 1 - r.popShare * r.dev * 0.8;
        occupier.eco.gdp += r.production * 0.6;
        r.popShare = 0;
      } else r.controller = c.id;
    }
    renormalizeRegions(world, c);
  }
  if (terms.reparations && lead) for (const l of losers) {
    signTreaty(world, 'aid', l, lead, 60, { amount: l.eco.gdp * 0.01 * terms.reparations });
    parts.push(`${l.short} paga reparaciones`);
  }
  if (terms.demilitarize) for (const l of losers) {
    addModifier(world, l, { id: 'desmilitarizacion', name: 'Desmilitarización impuesta', duration: 120, mods: { militaryPower: -0.3, 'group.military': -10 } }, 'paz');
    l.eco.budget.defense *= 0.6;
    parts.push(`${l.short} se desmilitariza`);
  }
  if (terms.leaveAlliances) for (const l of losers) {
    for (const t of world.treaties.filter((x) => (x.type === 'alliance' || x.type === 'defense') && x.parties.includes(l.id))) endTreaty(world, t);
    for (const o of Object.values(world.orgs)) if (o.mutualDefense) o.members = o.members.filter((m) => m !== l.id);
    parts.push(`${l.short} abandona sus alianzas`);
  }
  for (const id of [...w.attackers, ...w.defenders]) {
    const c = world.countries[id];
    if (!c) continue;
    c.mil.mobilization = Math.min(c.mil.mobilization, 1);
    c.pol.warWeariness *= 0.5;
    const won = winners.includes(c);
    if (won) c.pol.flags.guerras_ganadas = (c.pol.flags.guerras_ganadas ?? 0) + 1;
    addModifier(world, c, { id: `fin_guerra_${w.id}`, name: won ? 'Victoria en la guerra' : 'Derrota en la guerra', duration: 24, mods: won ? { 'group.military': 8, 'group.all': 3, legitimacy: 4 } : { 'group.military': -10, 'group.all': -4, legitimacy: -6 } }, 'paz');
  }
  if (terms.regime) for (const l of losers) {
    l.pol.stability = clamp(l.pol.stability - 25, 0, 100);
    l.pol.legitimacy = clamp(l.pol.legitimacy - 20, 0, 100);
    parts.push(`cambio de régimen impuesto en ${l.short}`);
  }
  world.wars = world.wars.filter((x) => x !== w);
  bumpRev(world);
  for (const x of [...w.attackers, ...w.defenders]) for (const y of [...w.attackers, ...w.defenders]) {
    if (x !== y && world.countries[x]) world.countries[x].pol.cooldowns[`declarar_guerra:${y}`] = world.turn + 60;
  }
  if (winners[0] && losers[0]) signTreaty(world, 'nonaggression', winners[0], losers[0], 60);
  news(world, `🕊 Paz en «${w.name}» (${reason})${parts.length ? ': ' + parts.join('; ') : ''}.`, 'guerra', [w.leaderA, w.leaderD], 3);
  if (world.player && [...w.attackers, ...w.defenders].includes(world.player.country)) timeline(world, `Paz en «${w.name}»: ${parts.join('; ') || 'sin cambios territoriales'}`, 'guerra');
}

function renormalizeRegions(world: World, c: Country) {
  const own = c.regions.filter((r) => r.owner === c.id);
  const tot = own.reduce((a, r) => a + (r.popShare || r.pop / Math.max(0.01, c.soc.pop)), 0) || 1;
  for (const r of own) r.popShare = (r.popShare || r.pop / Math.max(0.01, c.soc.pop)) / tot;
  if (!own.length) {
    c.alive = false;
    c.annexedBy = world.countries[c.regions[0]?.owner ?? '']?.id;
    news(world, `${c.name} deja de existir como Estado independiente.`, 'guerra', [c.id], 3);
  }
}
function checkCapitulation(world: World, w: War) {
  if (!world.wars.includes(w)) return;
  for (const side of ['A', 'D'] as const) {
    const lid = side === 'A' ? w.leaderA : w.leaderD;
    const l = world.countries[lid];
    const capitalLost = l.regions.some((r) => r.capital && r.owner === l.id && r.controller !== l.id);
    const exh = side === 'A' ? w.exhaustionA : w.exhaustionD;
    if ((capitalLost && occupiedShare(l) > 0.5) || exh >= 99) {
      const winnerSide = side === 'A' ? 'D' : 'A';
      if (world.player?.country === lid) {
        world.gameOver = { turn: world.turn, victory: false, reason: 'militar', text: `${l.name} ha capitulado en «${w.name}». El enemigo dicta las condiciones de la paz.` };
      }
      makePeace(world, w, { cede: 1, reparations: 1, demilitarize: 1 }, `capitulación de ${l.name}`, winnerSide);
      return;
    }
  }
}

function aiPeace(world: World, w: War, rng: Rng) {
  if (world.turn - w.start < 4 || !world.wars.includes(w)) return;
  for (const side of ['A', 'D'] as const) {
    const lid = side === 'A' ? w.leaderA : w.leaderD;
    if (world.player?.country === lid) continue;
    const me = world.countries[lid];
    const myScore = side === 'A' ? w.score : -w.score;
    const exh = side === 'A' ? w.exhaustionA : w.exhaustionD;
    const want = (exh - 45) / 30 - myScore / 50 + me.ai.riskAversion * 0.4 - me.ai.aggression * 0.5;
    if (want < 0.4 || rng.next() > 0.3) continue;
    const winning = myScore > 15;
    const terms: PeaceTerms = winning ? { cede: 1, reparations: myScore > 50 ? 1 : 0 } : {};
    const otherId = side === 'A' ? w.leaderD : w.leaderA;
    if (world.player?.country === otherId) {
      if (!world.proposals.some((p) => p.kind === 'peace' && p.terms.war === w.id)) {
        world.proposals.push({ id: uid(world, 'pr'), from: lid, to: otherId, kind: 'peace', terms: { war: w.id, ...terms as Record<string, number> }, turn: world.turn, text: `paz en «${w.name}»${winning ? ' (exige cesiones)' : ''}` });
        news(world, `✉ ${me.name} ofrece la paz en «${w.name}».`, 'guerra', [lid, otherId], 3);
      }
      continue;
    }
    const { ev } = peaceAcceptance(world, w, me, terms);
    const accepted = rng.next() < ev.prob;
    logDecision(world, { turn: world.turn, actor: otherId, action: 'respuesta:paz', target: lid, score: ev.score, accepted, text: `${world.countries[otherId].name} ${accepted ? 'acepta' : 'rechaza'} la paz ofrecida por ${me.name}`, reasons: ev.reasons });
    if (accepted) { makePeace(world, w, terms, 'acuerdo negociado', winning ? side : (side === 'A' ? 'D' : 'A')); return; }
  }
}

/** El jugador ofrece la paz con términos configurables. */
export function offerPeace(world: World, w: War, player: Country, terms: PeaceTerms): { accepted: boolean; text: string } {
  const rng = rngOf(world);
  const { other, ev } = peaceAcceptance(world, w, player, terms);
  const accepted = rng.next() < ev.prob;
  world.rng = rng.state;
  logDecision(world, { turn: world.turn, actor: other.id, action: 'respuesta:paz', target: player.id, score: ev.score, accepted, text: `${other.name} ${accepted ? 'acepta' : 'rechaza'} tu oferta de paz`, reasons: ev.reasons });
  if (accepted) {
    const imposing = !!(terms.cede || terms.reparations || terms.demilitarize || terms.leaveAlliances || terms.regime);
    const mySide = sideOf(w, player.id)!;
    makePeace(world, w, terms, 'acuerdo negociado', imposing ? mySide : (w.score >= 0 ? 'A' : 'D'));
    return { accepted, text: `${other.name} acepta la paz.` };
  }
  return { accepted, text: `${other.name} rechaza la paz: ${ev.reasons.join(', ')}.` };
}

export function acceptPeaceProposal(world: World, proposalId: string, accept: boolean): string {
  const p = world.proposals.find((x) => x.id === proposalId);
  if (!p) return '';
  world.proposals = world.proposals.filter((x) => x !== p);
  const w = world.wars.find((x) => x.id === p.terms.war);
  if (!w) return 'La guerra ya ha terminado.';
  if (!accept) { news(world, `${world.countries[p.to].name} rechaza la oferta de paz de ${world.countries[p.from].name}.`, 'guerra', [p.from, p.to], 2); return 'Oferta rechazada.'; }
  const fromSide = sideOf(w, p.from)!;
  const imposing = !!(p.terms.cede || p.terms.reparations);
  makePeace(world, w, p.terms as PeaceTerms, 'acuerdo negociado', imposing ? fromSide : (fromSide === 'A' ? 'D' : 'A'));
  return 'Paz firmada.';
}

export function proposeCeasefire(world: World, w: War, from: Country): { accepted: boolean; text: string } {
  const rng = rngOf(world);
  const side = sideOf(w, from.id);
  const other = world.countries[side === 'A' ? w.leaderD : w.leaderA];
  const { accepted, ev } = decideProposal(world, from, other, 'ceasefire', rng, { score: side === 'A' ? -w.score : w.score, exhaustion: side === 'A' ? w.exhaustionD : w.exhaustionA, pressure: 0 });
  world.rng = rng.state;
  logDecision(world, { turn: world.turn, actor: other.id, action: 'respuesta:alto_fuego', target: from.id, score: ev.score, accepted, text: `${other.name} ${accepted ? 'acepta' : 'rechaza'} el alto el fuego`, reasons: ev.reasons });
  if (accepted) {
    w.ceasefire = 12;
    bumpRev(world);
    news(world, `🕊 Alto el fuego de 12 meses en «${w.name}».`, 'guerra', [w.leaderA, w.leaderD], 3);
    return { accepted, text: 'Alto el fuego aceptado (12 meses).' };
  }
  return { accepted, text: `Rechazado: ${ev.reasons.join(', ')}.` };
}

export function initWarsRegistry(world: World) {
  for (const w of world.wars) if (!w.fronts.length) rebuildFronts(world, w);
  for (const id of world.order) computePower(world.countries[id]);
}

export function personalityRedLines(c: Country): string[] {
  return personalityOf(c.ai.personality).redLines;
}
