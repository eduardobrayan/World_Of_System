/**
 * Diplomacia: relaciones dirigidas, confianza, memoria, tratados, sanciones, organismos y votaciones.
 */
import type { Country, Id, Resolution, Treaty, World } from './types';
import { addMemory } from './effects';
import { allied, atWar, hasTreaty, sanctionLevelOn, tradeShare } from './vars';
import { regimeOf } from './data';
import { bumpRev, clamp, news, rngOf, timeline, uid } from './util';

/** Tipos de recuerdo: impacto en opinión, semivida (meses) y factor sobre la confianza. */
export const MEMORY: Record<string, { value: number; halfLife: number; trust: number; text: string }> = {
  visita: { value: 5, halfLife: 18, trust: 0.3, text: 'Visita diplomática' },
  cumbre: { value: 10, halfLife: 24, trust: 0.5, text: 'Cumbre bilateral' },
  ayuda: { value: 15, halfLife: 36, trust: 0.7, text: 'Ayuda recibida' },
  acuerdo: { value: 10, halfLife: 48, trust: 0.8, text: 'Tratado firmado' },
  alianza: { value: 15, halfLife: 60, trust: 1, text: 'Alianza firmada' },
  tratado_roto: { value: -35, halfLife: 120, trust: 1.6, text: 'Rompió un tratado con nosotros' },
  traicion: { value: -45, halfLife: 150, trust: 1.8, text: 'Traición' },
  sancion: { value: -18, halfLife: 48, trust: 0.6, text: 'Nos impuso sanciones' },
  amenaza: { value: -22, halfLife: 60, trust: 1, text: 'Nos amenazó' },
  agresion: { value: -60, halfLife: 240, trust: 1.5, text: 'Nos atacó militarmente' },
  aliado_guerra: { value: 25, halfLife: 120, trust: 1.2, text: 'Luchó a nuestro lado' },
  abandono: { value: -30, halfLife: 120, trust: 1.6, text: 'No nos defendió en la guerra' },
  espionaje: { value: -20, halfLife: 48, trust: 1, text: 'Espionaje descubierto' },
  mediacion: { value: 10, halfLife: 36, trust: 0.6, text: 'Medió en nuestro conflicto' },
  insulto: { value: -12, halfLife: 24, trust: 0.4, text: 'Expulsó a nuestros diplomáticos' },
  voto_favor: { value: 4, halfLife: 24, trust: 0.3, text: 'Votó a nuestro favor' },
  voto_contra: { value: -6, halfLife: 24, trust: 0.3, text: 'Votó contra nosotros' },
  rechazo: { value: -3, halfLife: 12, trust: 0, text: 'Rechazó nuestra propuesta' },
  cesion: { value: 8, halfLife: 36, trust: 0.4, text: 'Cedió ante nuestras demandas' },
  aranceles: { value: -10, halfLife: 36, trust: 0.3, text: 'Nos impuso aranceles' },
  ruptura: { value: -30, halfLife: 60, trust: 0.8, text: 'Rompió relaciones con nosotros' },
  armas_bio: { value: -25, halfLife: 120, trust: 1, text: 'Programa de armas biológicas' },
  bioataque: { value: -80, halfLife: 300, trust: 2, text: 'Lanzó un ataque biológico' },
  antidroga: { value: 8, halfLife: 36, trust: 0.5, text: 'Cooperación antidroga' },
  narco: { value: -25, halfLife: 60, trust: 1, text: 'Financió a los cárteles' },
};

export function remember(world: World, holder: Country, about: Id, kind: string, scale = 1) {
  const m = MEMORY[kind];
  if (!m) return;
  addMemory(world, holder, about, kind, m.value * scale, m.text, m.halfLife);
  const r = world.rel[holder.id]?.[about];
  if (r) {
    r.op = clamp(r.op + m.value * scale * 0.5, -100, 100);
    r.trust = clamp(r.trust + m.value * scale * m.trust * 0.4, 0, 100);
  }
}

export function treatiesBetween(world: World, a: Id, b: Id): Treaty[] {
  return world.treaties.filter((t) => t.parties.includes(a) && t.parties.includes(b));
}

interface RelIndex { treaties: Map<string, number>; sanc: Map<string, number>; war: Set<string>; hostile: Map<Id, Set<Id>>; mem: Map<string, number> }
let relIndex: RelIndex | null = null;

function buildRelIndex(world: World): RelIndex {
  const treaties = new Map<string, number>();
  for (const t of world.treaties) {
    if (t.type === 'aid') continue;
    const [x, y] = t.parties;
    treaties.set(`${x}|${y}`, (treaties.get(`${x}|${y}`) ?? 0) + 1);
    treaties.set(`${y}|${x}`, (treaties.get(`${y}|${x}`) ?? 0) + 1);
  }
  const sanc = new Map<string, number>();
  for (const s of world.sanctions) sanc.set(`${s.by}|${s.target}`, s.level);
  const war = new Set<string>();
  for (const w of world.wars) {
    if (w.ceasefire > 0) continue;
    for (const x of w.attackers) for (const y of w.defenders) { war.add(`${x}|${y}`); war.add(`${y}|${x}`); }
  }
  const hostile = new Map<Id, Set<Id>>();
  for (const a of world.order) {
    const set = new Set<Id>();
    for (const b of world.order) if (a !== b && (world.rel[a]?.[b]?.op ?? 0) < -45) set.add(b);
    hostile.set(a, set);
  }
  const mem = new Map<string, number>();
  for (const a of world.order) {
    for (const m of world.countries[a].memory) {
      const k = `${a}|${m.about}`;
      mem.set(k, (mem.get(k) ?? 0) + m.value * Math.pow(0.5, (world.turn - m.turn) / Math.max(1, m.halfLife)));
    }
  }
  return { treaties, sanc, war, hostile, mem };
}

/** Opinión hacia la que deriva la relación de a hacia b (y sus causas, para la explicabilidad). */
export function relationTarget(world: World, a: Country, b: Country, idx?: RelIndex): { value: number; parts: { label: string; value: number }[] } {
  const ix = idx ?? buildRelIndex(world);
  const parts: { label: string; value: number }[] = [];
  const add = (label: string, v: number) => { if (Math.abs(v) > 0.5) parts.push({ label, value: v }); return v; };
  const r = world.rel[a.id][b.id];
  let v = add('Afinidad estructural (ideología, bloques, rivalidades)', r.base);
  v += add('Memoria de lo ocurrido', clamp((ix.mem.get(`${a.id}|${b.id}`) ?? 0) * 0.8, -80, 60));
  let ce = 0;
  const ha = ix.hostile.get(a.id), hb = ix.hostile.get(b.id);
  if (ha && hb) for (const x of ha) if (x !== b.id && hb.has(x)) ce++;
  v += add('Enemigos comunes', Math.min(3, ce) * 6);
  v += add('Tratados en vigor', Math.min(20, (ix.treaties.get(`${a.id}|${b.id}`) ?? 0) * 5));
  v += add('Interdependencia comercial', Math.min(10, tradeShare(world, a.id, b.id) * 60));
  const sl = ix.sanc.get(`${b.id}|${a.id}`);
  if (sl) v += add('Sanciones que nos impone', -sl * 8);
  if (ix.war.has(`${a.id}|${b.id}`)) v += add('Estamos en guerra', -60);
  v += add('Reputación internacional', (b.reputation - 60) * 0.15);
  return { value: clamp(v, -100, 100), parts };
}

export function updateRelations(world: World) {
  relIndex = buildRelIndex(world);
  for (const a of world.order) {
    const ca = world.countries[a];
    if (!ca.alive) continue;
    for (const b of world.order) {
      if (a === b) continue;
      const cb = world.countries[b];
      if (!cb.alive) continue;
      const r = world.rel[a][b];
      const t = relationTarget(world, ca, cb, relIndex).value;
      r.op = clamp(r.op + (t - r.op) * 0.03, -100, 100);
      const trustT = clamp(50 + (relIndex.mem.get(`${a}|${b}`) ?? 0) * 0.7 + (allied(world, a, b) ? 12 : 0) + r.op * 0.15, 0, 100);
      r.trust = clamp(r.trust + (trustT - r.trust) * 0.04, 0, 100);
    }
    ca.reputation = clamp(ca.reputation + (60 - ca.reputation) * 0.01, 0, 100);
  }
}

// ---------- Tratados ----------
export const TREATY_NAMES: Record<string, string> = {
  trade: 'Acuerdo de libre comercio', alliance: 'Alianza defensiva', defense: 'Garantía de seguridad', nonaggression: 'Pacto de no agresión',
  cooperation: 'Cooperación tecnológica', energy: 'Acuerdo energético', aid: 'Programa de ayuda', ceasefire: 'Alto el fuego',
};

export function signTreaty(world: World, type: string, a: Country, b: Country, duration = -1, terms?: Treaty['terms']): Treaty {
  const t: Treaty = { id: uid(world, 't'), type, parties: [a.id, b.id], start: Math.max(1, world.turn), end: duration > 0 ? world.turn + duration : -1, name: `${TREATY_NAMES[type] ?? type} ${a.short}–${b.short}`, terms };
  world.treaties.push(t);
  bumpRev(world);
  remember(world, a, b.id, type === 'alliance' || type === 'defense' ? 'alianza' : 'acuerdo');
  remember(world, b, a.id, type === 'alliance' || type === 'defense' ? 'alianza' : 'acuerdo');
  if (type === 'cooperation') {
    for (const c of [a, b]) c.mods.push({ id: `coop_${t.id}`, name: `Cooperación tecnológica con ${(c === a ? b : a).short}`, source: 'tratado', remaining: -1, mods: { research: 0.05 } });
  }
  news(world, `🤝 ${a.name} y ${b.name} firman: ${TREATY_NAMES[type] ?? type}.`, 'diplomacia', [a.id, b.id], type === 'alliance' ? 2 : 1);
  return t;
}

export function endTreaty(world: World, t: Treaty, breaker?: Country) {
  world.treaties = world.treaties.filter((x) => x.id !== t.id);
  bumpRev(world);
  for (const id of t.parties) {
    const c = world.countries[id];
    if (c) c.mods = c.mods.filter((m) => m.id !== `coop_${t.id}`);
  }
  if (breaker) {
    breaker.reputation = clamp(breaker.reputation - (t.type === 'alliance' || t.type === 'defense' ? 12 : 6), 0, 100);
    for (const id of t.parties) if (id !== breaker.id && world.countries[id]) remember(world, world.countries[id], breaker.id, 'tratado_roto');
    news(world, `💔 ${breaker.name} rompe el tratado «${t.name}».`, 'diplomacia', t.parties, 2);
  }
}

export function updateTreaties(world: World) {
  for (const t of [...world.treaties]) {
    if (t.end > 0 && world.turn >= t.end) {
      endTreaty(world, t);
      news(world, `El tratado «${t.name}» expira.`, 'diplomacia', t.parties, 0);
      continue;
    }
    if (!t.parties.every((p) => world.countries[p]?.alive)) endTreaty(world, t);
  }
  // Cada año, los tratados cumplidos refuerzan la confianza
  if (world.turn % 12 === 0) {
    for (const t of world.treaties) {
      if (t.type === 'aid' || t.start <= 0) continue;
      const [a, b] = t.parties.map((p) => world.countries[p]);
      if (!a || !b) continue;
      world.rel[a.id][b.id].trust = clamp(world.rel[a.id][b.id].trust + 2, 0, 100);
      world.rel[b.id][a.id].trust = clamp(world.rel[b.id][a.id].trust + 2, 0, 100);
    }
  }
}

// ---------- Sanciones ----------
export function setSanction(world: World, by: Country, target: Country, level: number, multilateral?: string) {
  bumpRev(world);
  const ex = world.sanctions.find((s) => s.by === by.id && s.target === target.id);
  if (level <= 0) {
    if (ex) {
      world.sanctions = world.sanctions.filter((s) => s !== ex);
      news(world, `${by.name} levanta sus sanciones a ${target.name}.`, 'diplomacia', [by.id, target.id], 1);
    }
    return;
  }
  const prev = ex?.level ?? 0;
  if (ex) ex.level = level;
  else world.sanctions.push({ by: by.id, target: target.id, level, start: world.turn, multilateral });
  if (level > prev) {
    remember(world, target, by.id, 'sancion', level - prev);
    world.incidents.push({ turn: world.turn, actor: by.id, target: target.id, kind: 'sancion', magnitude: level - prev, text: 'Sanciones' });
  }
  if (!multilateral) news(world, `🚫 ${by.name} ${prev ? 'endurece sus' : 'impone'} sanciones a ${target.name} (nivel ${level}${level === 3 ? ', embargo' : ''}).`, 'diplomacia', [by.id, target.id], level >= 2 ? 2 : 1);
}

// ---------- Organismos y votaciones ----------
export const RESOLUTION_KINDS: Record<string, string> = {
  condena: 'Condena', sanciones: 'Sanciones multilaterales', clima: 'Acuerdo climático', ayuda: 'Ayuda humanitaria', alto_fuego: 'Exigencia de alto el fuego',
};

export function proposeResolution(world: World, org: string, kind: string, proposer: Id, target?: Id): Resolution | null {
  const o = world.orgs[org];
  if (!o) return null;
  if (world.resolutions.some((r) => r.org === org && r.kind === kind && r.target === target && r.passed === undefined)) return null;
  const tName = target ? world.countries[target]?.name : '';
  const text = kind === 'condena' ? `Condena de ${tName}` : kind === 'sanciones' ? `Sanciones contra ${tName}` : kind === 'alto_fuego' ? `Alto el fuego inmediato de ${tName}` : kind === 'ayuda' ? `Ayuda humanitaria a ${tName}` : 'Acuerdo climático global';
  const r: Resolution = { id: uid(world, 'r'), org, turn: world.turn + 1, kind, target, proposer, text, votes: {} };
  world.resolutions.push(r);
  return r;
}

/** Inclinación de voto de un miembro (−1 en contra … +1 a favor). */
export function voteScore(world: World, voter: Country, r: Resolution): number {
  if (world.player?.country === voter.id) return 0;
  const t = r.target ? world.countries[r.target] : null;
  const prop = world.countries[r.proposer];
  let s = 0;
  const opP = prop ? world.rel[voter.id]?.[prop.id]?.op ?? 0 : 0;
  s += opP / 250;
  if (t) {
    if (voter.id === t.id) return -1;
    const opT = world.rel[voter.id]?.[t.id]?.op ?? 0;
    const friendly = allied(world, voter.id, t.id) ? 0.8 : 0;
    if (r.kind === 'ayuda') s += 0.4 + opT / 300;
    else s += -opT / 120 - friendly - (voter.ai.pragmatism - 0.5) * 0.3 * tradeShare(world, voter.id, t.id) * 10;
    if (r.kind === 'sanciones') s -= 0.15;
    if (r.kind === 'condena' || r.kind === 'alto_fuego') s += regimeOf(voter.pol.regime).competitive ? 0.15 : -0.1;
  } else if (r.kind === 'clima') {
    s += (voter.tech.renewables - 30) / 100 + (voter.hazards.drought ?? 0) * 0.1 - voter.eco.sectors.energy / 60;
  }
  return clamp(s, -1, 1);
}

export function resolveResolutions(world: World) {
  for (const r of world.resolutions) {
    if (r.passed !== undefined || r.turn > world.turn) continue;
    const o = world.orgs[r.org];
    if (!o) { r.passed = false; continue; }
    const universal = o.type === 'universal';
    const voters = universal && r.kind === 'sanciones' ? o.council : o.members;
    let yes = 0, no = 0;
    for (const id of voters) {
      const c = world.countries[id];
      if (!c?.alive) continue;
      let v: 'si' | 'no' | 'abs';
      if (world.player?.country === id) v = r.votes[id] ?? 'abs';
      else {
        const s = voteScore(world, c, r);
        v = s > 0.2 ? 'si' : s < -0.2 ? 'no' : 'abs';
      }
      r.votes[id] = v;
      if (v === 'si') yes++; else if (v === 'no') no++;
    }
    let passed = yes > no && yes >= Math.ceil(voters.length * (universal && r.kind === 'sanciones' ? 0.6 : 0.34));
    if (passed && universal && r.kind === 'sanciones') {
      const vetoer = o.veto.find((v) => r.votes[v] === 'no');
      if (vetoer) { passed = false; r.vetoedBy = vetoer; }
    }
    r.passed = passed;
    applyResolution(world, r);
  }
  if (world.resolutions.length > 120) world.resolutions = world.resolutions.slice(-120);
}

function applyResolution(world: World, r: Resolution) {
  const o = world.orgs[r.org];
  const t = r.target ? world.countries[r.target] : null;
  const ystr = Object.values(r.votes).filter((v) => v === 'si').length;
  const nstr = Object.values(r.votes).filter((v) => v === 'no').length;
  const veto = r.vetoedBy ? ` (veto de ${world.countries[r.vetoedBy]?.short})` : '';
  news(world, `🗳 ${o.short}: «${r.text}» ${r.passed ? 'APROBADA' : 'RECHAZADA'} (${ystr} a favor, ${nstr} en contra)${veto}.`, 'organismos',
    [r.proposer, ...(t ? [t.id] : [])], t && world.player && (t.id === world.player.country || r.proposer === world.player.country) ? 2 : 1);
  if (t) {
    for (const [id, v] of Object.entries(r.votes)) {
      const c = world.countries[id];
      if (!c || id === t.id) continue;
      if (r.kind === 'ayuda') { if (v === 'si') remember(world, t, id, 'voto_favor'); }
      else if (v === 'si') remember(world, t, id, 'voto_contra', 0.7);
      else if (v === 'no') remember(world, t, id, 'voto_favor', 0.7);
    }
  }
  if (!r.passed) return;
  const prop = world.countries[r.proposer];
  if (prop) prop.pol.flags.resoluciones = (prop.pol.flags.resoluciones ?? 0) + 1;
  if (world.player?.country === r.proposer) timeline(world, `Resolución aprobada en ${o.short}: ${r.text}`, 'diplomacia');
  switch (r.kind) {
    case 'condena':
      if (t) t.reputation = clamp(t.reputation - 10, 0, 100);
      break;
    case 'sanciones':
      if (t) for (const [id, v] of Object.entries(r.votes)) {
        if (v !== 'si' || id === t.id) continue;
        const c = world.countries[id];
        const cur = world.sanctions.find((s) => s.by === id && s.target === t.id)?.level ?? 0;
        if (c && cur < 2) setSanction(world, c, t, 2, r.org);
      }
      if (t) news(world, `🚫 Sanciones multilaterales contra ${t.name}.`, 'diplomacia', [t.id], 2);
      break;
    case 'alto_fuego':
      if (t) { t.reputation = clamp(t.reputation - 6, 0, 100); t.pol.legitimacy = clamp(t.pol.legitimacy - 3, 0, 100); }
      break;
    case 'ayuda':
      if (t) {
        const donors = Object.entries(r.votes).filter(([, v]) => v === 'si').map(([id]) => world.countries[id]).filter(Boolean);
        let total = 0;
        for (const d of donors) { const amt = d.eco.gdp * 0.0003; d.eco.debt += amt; total += amt; }
        t.eco.debt = Math.max(0, t.eco.debt - total);
        t.eco.reserves += total * 0.3;
      }
      break;
    case 'clima':
      for (const [id, v] of Object.entries(r.votes)) {
        const c = world.countries[id];
        if (!c || v !== 'si') continue;
        c.mods.push({ id: `clima_${r.id}`, name: 'Acuerdo climático global', source: 'organismo', remaining: 60, mods: { renewablesGrowth: 0.35, potentialGrowth: -0.03 } });
      }
      break;
  }
}

/** Resoluciones que surgen solas del estado del mundo (cada trimestre). */
export function autoResolutions(world: World) {
  if (world.turn % 3 !== 0) return;
  const rng = rngOf(world);
  for (const w of world.wars) {
    if (w.ceasefire > 0) continue;
    const aggressor = w.leaderA;
    // Proponente: el miembro con peor relación con el agresor y buena con la víctima
    let best: Id | null = null, bs = -Infinity;
    for (const id of world.order) {
      if (id === aggressor || w.attackers.includes(id) || world.player?.country === id) continue;
      const s = -(world.rel[id]?.[aggressor]?.op ?? 0) + (world.rel[id]?.[w.leaderD]?.op ?? 0) * 0.5 + world.countries[id].eco.gdp / 2000;
      if (s > bs) { bs = s; best = id; }
    }
    if (best && rng.next() < 0.5) proposeResolution(world, 'ONU', rng.next() < 0.6 ? 'condena' : 'sanciones', best, aggressor);
  }
  if (world.global.temperature > 1.55 && world.turn % 60 === 0) {
    const best = world.order.map((id) => world.countries[id]).filter((c) => c.alive && world.player?.country !== c.id).sort((a, b) => b.tech.renewables - a.tech.renewables)[0];
    if (best) proposeResolution(world, 'ONU', 'clima', best.id);
  }
  world.rng = rng.state;
}

// ---------- Utilidades ----------
export function majorPowers(world: World, n = 8): Country[] {
  return world.order.map((id) => world.countries[id]).filter((c) => c.alive).sort((a, b) => b.eco.gdp + b.mil.power * 8 - (a.eco.gdp + a.mil.power * 8)).slice(0, n);
}

export function isAtWarWith(world: World, a: Id, b: Id): boolean {
  return world.wars.some((w) => w.ceasefire <= 0 && ((w.attackers.includes(a) && w.defenders.includes(b)) || (w.defenders.includes(a) && w.attackers.includes(b))));
}

export function canTrade(world: World, a: Id, b: Id): boolean {
  return !isAtWarWith(world, a, b) && !world.sanctions.some((s) => (s.by === a && s.target === b && s.level >= 3) || (s.by === b && s.target === a && s.level >= 3));
}

export { hasTreaty, atWar, sanctionLevelOn };
