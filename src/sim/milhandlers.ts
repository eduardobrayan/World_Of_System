/** Mecánicas especiales de las acciones militares y decisiones bélicas de la IA. */
import type { Country, UnitType, World } from './types';
import { UNIT_TYPES } from './types';
import { UNIT_BY_ID, personalityOf } from './data';
import { ACTION_BY_ID, registerHandler } from './actions';
import { registerAiGenerator, alliesPower, logDecision, type Factor } from './ai';
import { remember } from './diplomacy';
import { MOBILIZATION, computePower, unitCost, doctrineOf } from './military';
import { declareWar, raisePosture, sideOf, warsOfCountry, NUCLEAR_LEVELS, joinWar } from './war';
import { allied, neighborsLand, neighborsSea, relOp, tradeShare, atWar } from './vars';
import { schedule } from './effects';
import { bumpRev, clamp, news } from './util';
import { Rng } from './rng';

export const DOCTRINES: Record<string, string> = {
  defensa_territorial: 'Defensa territorial: +12 % en defensa, logística corta.',
  expedicionaria: 'Expedicionaria: gran logística y proyección lejos de casa.',
  defensa_activa: 'Defensa activa: equilibrio entre ataque y defensa.',
  asimetrica: 'Guerra asimétrica: defensa muy fuerte, ataque débil.',
  masa: 'Guerra de masas: más poder terrestre, peor aviación.',
  disuasion_nuclear: 'Disuasión nuclear: defensa sólida apoyada en el arsenal nuclear.',
};

export function registerMilHandlers() {
  registerHandler('mobilize', {
    preview: (world, def, ctx, p) => {
      const to = clamp(ctx.actor.mil.mobilization + Number(def.params?.delta ?? 1), 0, 3);
      const m = MOBILIZATION[to];
      p.extra.push(`Nuevo nivel: ${m.name}. Poder terrestre ×${m.land}; coste ${m.cost} % del PIB al año; crecimiento ${m.growth} pp.`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      c.mil.mobilization = clamp(c.mil.mobilization + Number(def.params?.delta ?? 1), 0, 3);
      computePower(c);
      if (Number(def.params?.delta) > 0) world.incidents.push({ turn: world.turn, actor: c.id, target: c.ai.rivals[0] ?? c.id, kind: 'maniobras', magnitude: 1, text: 'Movilización' });
      news(world, `${c.name}: ${MOBILIZATION[c.mil.mobilization].name.toLowerCase()}.`, 'militar', [c.id], c.mil.mobilization >= 2 ? 2 : 1);
      return { ok: true, passed: true, text: `Movilización: ${MOBILIZATION[c.mil.mobilization].name}.` };
    },
  });

  registerHandler('produce', {
    validate: (world, def, ctx) => (UNIT_BY_ID[String(ctx.params?.unit ?? '')] ? null : 'Unidad desconocida'),
    preview: (world, def, ctx, p) => {
      const k = String(ctx.params?.unit) as UnitType;
      const q = Number(ctx.params?.qty ?? 1);
      p.extra.push(`${q} × ${UNIT_BY_ID[k].name}: ${(unitCost(ctx.actor, k) * q).toFixed(1)} mil millones $ en ${UNIT_BY_ID[k].build} meses.`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      const k = String(ctx.params?.unit) as UnitType;
      const q = Math.max(1, Math.round(Number(ctx.params?.qty ?? 1)));
      c.mil.production.push({ unit: k, qty: q, remaining: UNIT_BY_ID[k].build, cost: unitCost(c, k) * q });
      return { ok: true, passed: true, text: `Encargadas ${q} unidades de ${UNIT_BY_ID[k].name}.` };
    },
  });

  registerHandler('deploy', {
    apply: (world, def, ctx) => {
      const c = ctx.actor, t = ctx.target!;
      const share = Number(def.params?.share ?? 0.1);
      if (share > 0) {
        c.mil.deployments[t.id] = share;
        remember(world, t, c.id, 'ayuda', 0.6);
        c.eco.extraSpending += c.mil.upkeep * share * 0.3;
        news(world, `⛺ ${c.name} despliega tropas en ${t.name}.`, 'militar', [c.id, t.id], 2);
      } else {
        delete c.mil.deployments[t.id];
        news(world, `${c.name} retira sus tropas de ${t.name}.`, 'militar', [c.id, t.id], 1);
      }
      bumpRev(world);
      return { ok: true, passed: true, text: share > 0 ? `Tropas desplegadas en ${t.name}.` : 'Tropas retiradas.' };
    },
  });

  registerHandler('maneuvers', {
    apply: (world, def, ctx) => {
      const c = ctx.actor, t = ctx.target!;
      remember(world, t, c.id, 'amenaza', 0.6);
      c.groups.military.support = clamp(c.groups.military.support + 3, 0, 100);
      world.global.tension = clamp(world.global.tension + 1, 0, 100);
      news(world, `🪖 ${c.name} realiza maniobras militares cerca de ${t.name}.`, 'militar', [c.id, t.id], 2);
      return { ok: true, passed: true, text: `Maniobras realizadas. ${t.name} toma nota.` };
    },
  });

  registerHandler('blockade', {
    apply: (world, def, ctx) => {
      const w = world.wars.find((x) => sideOf(x, ctx.actor.id) && sideOf(x, ctx.target!.id) && sideOf(x, ctx.actor.id) !== sideOf(x, ctx.target!.id));
      if (!w) return { ok: false, passed: false, text: 'No estáis en guerra.' };
      if (!w.blockade.includes(ctx.target!.id)) w.blockade.push(ctx.target!.id);
      bumpRev(world);
      news(world, `⚓ ${ctx.actor.name} impone un bloqueo naval a ${ctx.target!.name}.`, 'guerra', [ctx.actor.id, ctx.target!.id], 2);
      return { ok: true, passed: true, text: 'Bloqueo naval establecido.' };
    },
  });

  registerHandler('declare_war', {
    preview: (world, def, ctx, p) => {
      const c = ctx.actor, t = ctx.target!;
      const allies = world.order.filter((id) => id !== t.id && allied(world, id, t.id) && !allied(world, id, c.id)).map((id) => world.countries[id]);
      const myP = c.mil.power + alliesPower(world, c) * 0.4;
      const theirP = t.mil.power + allies.reduce((a, x) => a + x.mil.power, 0) * 0.5;
      p.extra.push(`Poder estimado: tú ${myP.toFixed(0)} frente a ${theirP.toFixed(0)} (incluidos posibles aliados).`);
      if (allies.length) p.risks.push(`Aliados que pueden intervenir: ${allies.map((x) => x.short).join(', ')}`);
      if (t.mil.nukes > 0) p.risks.push(`${t.name} es una potencia nuclear`);
      const cb = (c.pol.flags[`cb_${t.id}`] ?? -99) >= world.turn - 12;
      p.extra.push(cb ? 'Tienes un casus belli: la condena internacional será menor.' : 'Sin casus belli: grave pérdida de reputación.');
    },
    apply: (world, def, ctx) => {
      const r = rngFor(world);
      declareWar(world, ctx.actor, ctx.target!, String(ctx.params?.goal ?? def.params?.goal ?? 'territory'), r);
      world.rng = r.state;
      return { ok: true, passed: true, text: `Guerra declarada a ${ctx.target!.name}.` };
    },
  });

  registerHandler('strike', {
    apply: (world, def, ctx) => {
      const c = ctx.actor, t = ctx.target!;
      const power = (c.mil.airPower + c.mil.navalPower * 0.3) / Math.max(30, t.mil.airPower + t.mil.landPower * 0.1);
      const dmg = clamp(power * 3, 0.5, 8);
      for (const k of UNIT_TYPES) t.mil.units[k] *= 1 - dmg / 200;
      for (const r of t.regions.slice(0, 3)) r.damage = clamp(r.damage + dmg * 2, 0, 100);
      remember(world, t, c.id, 'agresion', 0.5);
      c.reputation = clamp(c.reputation - 6, 0, 100);
      world.global.tension = clamp(world.global.tension + 3, 0, 100);
      news(world, `💥 ${c.name} lanza un ataque limitado contra ${t.name}.`, 'guerra', [c.id, t.id], 3);
      return { ok: true, passed: true, text: `Ataque realizado: daños del ${dmg.toFixed(1)} % en las fuerzas de ${t.name}.` };
    },
  });

  registerHandler('nuclear', {
    preview: (world, def, ctx, p) => {
      const to = clamp(ctx.actor.mil.nuclearPosture + Number(def.params?.delta ?? 1), 0, 4);
      p.extra.push(`Nuevo nivel: ${NUCLEAR_LEVELS[to]}.`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      const d = Number(def.params?.delta ?? 1);
      if (d < 0) { c.mil.nuclearPosture = Math.max(0, c.mil.nuclearPosture - 1); bumpRev(world); return { ok: true, passed: true, text: 'Alerta nuclear rebajada.' }; }
      const w = warsOfCountry(world, c.id)[0];
      raisePosture(world, c, w);
      // Respuesta de otras potencias nucleares enemigas ante el uso táctico
      if (c.mil.nuclearPosture >= 3 && w) {
        for (const id of [...w.attackers, ...w.defenders]) {
          const e = world.countries[id];
          if (!e || sideOf(w, id) === sideOf(w, c.id) || e.mil.nukes <= 0 || world.player?.country === id) continue;
          const r = rngFor(world);
          if (r.next() < 0.35 * (1 - e.ai.riskAversion)) raisePosture(world, e, w);
          world.rng = r.state;
        }
      }
      return { ok: true, passed: true, text: NUCLEAR_LEVELS[c.mil.nuclearPosture] };
    },
  });

  registerHandler('nuke_program', {
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      c.pol.flags.programa_nuclear = 1;
      schedule(world, c, 60, [{ path: 'mil.nukes', set: 20 }], 'programa_nuclear', undefined, `☢ ${c.name} completa su programa de armas nucleares.`);
      for (const id of world.order) {
        const o = world.countries[id];
        if (personalityOf(o.ai.personality).redLines.includes('nuclear_program') || o.ai.rivals.includes(c.id)) {
          remember(world, o, c.id, 'amenaza', 2);
          world.incidents.push({ turn: world.turn, actor: c.id, target: id, kind: 'amenaza', magnitude: 3, text: 'Programa nuclear' });
        }
      }
      news(world, `☢ ${c.name} inicia un programa de armas nucleares.`, 'nuclear', [c.id], 3);
      return { ok: true, passed: true, text: 'Programa nuclear iniciado: 5 años hasta tener armas operativas.' };
    },
  });

  registerHandler('doctrine', {
    validate: (world, def, ctx) => (DOCTRINES[String(ctx.params?.doctrine ?? '')] && ctx.params?.doctrine !== ctx.actor.mil.doctrine ? null : 'Elige una doctrina distinta'),
    apply: (world, def, ctx) => {
      ctx.actor.mil.doctrine = String(ctx.params?.doctrine);
      ctx.actor.mil.readiness = clamp(ctx.actor.mil.readiness - 10, 0, 100);
      computePower(ctx.actor);
      return { ok: true, passed: true, text: `Nueva doctrina: ${doctrineOf(ctx.actor).name}.` };
    },
  });

  registerAiGenerator(militaryCandidates);
}

function rngFor(world: World): Rng {
  return new Rng(world.rng);
}

/** Candidatas militares de la IA: rearme, movilización, maniobras, guerra, intervención en guerras de aliados. */
function militaryCandidates(world: World, c: Country, rng: Rng, out: Parameters<Parameters<typeof registerAiGenerator>[0]>[3]) {
  const p = c.ai;
  const maxT = p.threat.max ?? 0;
  const myWars = warsOfCountry(world, c.id).filter((w) => w.ceasefire <= 0);
  // Movilización según amenaza o guerra
  if ((myWars.length || maxT > 1) && c.mil.mobilization < (myWars.length ? 2 : 1)) {
    out.push({ def: ACTION_BY_ID.movilizar, ctx: { actor: c, silent: true }, utility: 0.6 + maxT * 0.4 + myWars.length * 0.6, factors: [{ label: 'amenaza percibida', value: maxT }, { label: 'en guerra', value: myWars.length ? 0.6 : 0 }], text: 'aumentar la movilización' });
  }
  if (!myWars.length && c.mil.mobilization > 0 && maxT < 0.5) {
    out.push({ def: ACTION_BY_ID.desmovilizar, ctx: { actor: c, silent: true }, utility: 0.9 - p.aggression * 0.4, factors: [{ label: 'paz', value: 0.8 }], text: 'reducir la movilización' });
  }
  // Intervenir en las guerras de los aliados
  for (const w of world.wars) {
    if (w.ceasefire > 0 || sideOf(w, c.id)) continue;
    for (const side of ['A', 'D'] as const) {
      const lead = side === 'A' ? w.leaderA : w.leaderD;
      if (!allied(world, c.id, lead)) continue;
      const enemy = world.countries[side === 'A' ? w.leaderD : w.leaderA];
      if (allied(world, c.id, enemy.id)) continue;
      const f: Factor[] = [
        { label: 'compromiso con el aliado', value: p.reliability * (side === 'D' ? 1 : 0.4) },
        { label: 'amistad con el aliado', value: relOp(world, c.id, lead) / 150 },
        { label: 'hostilidad hacia el enemigo', value: -relOp(world, c.id, enemy.id) / 120 },
        { label: 'disuasión nuclear del enemigo', value: enemy.mil.nukes > 0 ? -1.2 : 0 },
        { label: 'aversión al riesgo', value: -p.riskAversion * 0.8 },
      ];
      const u = f.reduce((a, x) => a + x.value, 0);
      if (u > (side === 'A' ? 1.1 : 0.4) && rng.next() < (side === 'A' ? 0.04 : 0.15)) {
        joinWar(world, w, c, side);
        logDecision(world, { turn: world.turn, actor: c.id, action: 'entrar_guerra', target: enemy.id, score: u, accepted: true, text: `${c.name} entra en «${w.name}» junto a ${world.countries[lead].name}`, reasons: f.filter((x) => Math.abs(x.value) > 0.1).map((x) => `${x.label} (${x.value.toFixed(2)})`) });
      }
    }
  }
  if (myWars.length) return;
  // Maniobras e intimidación
  for (const id of [...neighborsLand(c.id), ...neighborsSea(c.id)]) {
    const t = world.countries[id];
    if (!t?.alive) continue;
    const op = relOp(world, c.id, id);
    if (op < -40 && c.mil.power > t.mil.power * 0.8) {
      out.push({ def: ACTION_BY_ID.maniobras, ctx: { actor: c, target: t, silent: true }, utility: (-op - 40) / 60 * p.aggression + 0.2 - p.riskAversion * 0.3, factors: [{ label: 'hostilidad', value: -op / 100 }, { label: 'agresividad', value: p.aggression }], text: `intimidar a ${t.name} con maniobras` });
    }
  }
  // Guerra de agresión: muy rara, solo con ventaja clara y personalidad agresiva
  if (atWar(world, c.id) || c.pol.stability < 25) return;
  const cands = new Set([...p.claims, ...p.rivals, ...neighborsLand(c.id)]);
  for (const id of cands) {
    const t = world.countries[id];
    if (!t?.alive || allied(world, c.id, id) || world.wars.some((w) => sideOf(w, id))) continue;
    if (t.isBlock && !p.claims.includes(id)) continue;
    const reachable = neighborsLand(c.id).includes(id) || (neighborsSea(c.id).includes(id) && c.mil.navalPower > t.mil.navalPower * 1.5);
    if (!reachable) continue;
    const op = relOp(world, c.id, id);
    if (op > -50 && !p.claims.includes(id)) continue;
    const tAllies = world.order.filter((x) => x !== id && allied(world, x, id) && !allied(world, x, c.id));
    const theirP = t.mil.power + tAllies.reduce((a, x) => a + world.countries[x].mil.power, 0) * 0.45;
    const ratio = (c.mil.power + alliesPower(world, c) * 0.2) / Math.max(30, theirP);
    const nukes = (t.mil.nukes > 0 ? 1 : 0) + (tAllies.some((x) => world.countries[x].mil.nukes > 0) ? 1 : 0);
    const cb = (c.pol.flags[`cb_${id}`] ?? -99) >= world.turn - 12;
    const f: Factor[] = [
      { label: 'agresividad', value: p.aggression * 1.4 },
      { label: 'ventaja militar', value: clamp(Math.log2(ratio) * 0.8, -2, 1.5) },
      { label: 'reivindicación territorial', value: p.claims.includes(id) ? 0.7 : 0 },
      { label: 'hostilidad', value: -op / 100 },
      { label: 'casus belli', value: cb ? 0.4 : 0 },
      { label: 'disuasión nuclear', value: -nukes * 2 },
      { label: 'aversión al riesgo', value: -p.riskAversion * 1.2 },
      { label: 'coste económico', value: -tradeShare(world, c.id, id) * 10 * p.pragmatism },
      { label: 'distracción de problemas internos', value: c.pol.approval < 35 && p.ideologyZeal > 0.5 ? 0.3 : 0 },
      { label: 'umbral de guerra', value: -2.4 },
    ];
    const u = f.reduce((a, x) => a + x.value, 0) * (world.player?.difficulty === 'dificil' && world.player.country === id ? 1.15 : 1);
    if (u > 0) out.push({ def: ACTION_BY_ID.declarar_guerra, ctx: { actor: c, target: t, params: { goal: p.claims.includes(id) ? 'territory' : 'punitive' }, silent: true }, utility: u + 0.75, factors: f, text: `declarar la guerra a ${t.name}` });
  }
}
