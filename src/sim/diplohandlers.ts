/** Mecánicas especiales de las acciones diplomáticas. */
import type { Country, Proposal, World } from './types';
import { registerHandler, type ActionPreview } from './actions';
import { decideProposal, evaluateProposal, logDecision } from './ai';
import { endTreaty, proposeResolution, remember, setSanction, signTreaty, treatiesBetween, TREATY_NAMES, RESOLUTION_KINDS } from './diplomacy';
import { allied, relOp, neighborsLand } from './vars';
import { bumpRev, clamp, news, rngOf, uid } from './util';
import { personalityOf } from './data';

function foreignSkill(c: Country): number {
  return 1 + ((c.pol.ministers.find((m) => m.ministry === 'foreign')?.competence ?? 50) - 50) / 100;
}

function previewAcceptance(world: World, from: Country, to: Country, kind: string, p: ActionPreview, terms: Record<string, number | string> = {}) {
  if (world.player?.country === to.id) { p.extra.push('El jugador decidirá si acepta.'); return; }
  const ev = evaluateProposal(world, from, to, kind, terms);
  p.extra.push(`Probabilidad estimada de que ${to.name} acepte: ${(ev.prob * 100).toFixed(0)} %. Motivos: ${ev.reasons.join(', ') || '—'}.`);
}

export function sendProposal(world: World, from: Country, to: Country, kind: string, terms: Record<string, number | string>, text: string): Proposal {
  const p: Proposal = { id: uid(world, 'pr'), from: from.id, to: to.id, kind, terms, turn: world.turn, text };
  world.proposals.push(p);
  news(world, `✉ ${from.name} propone a ${to.name}: ${text}.`, 'diplomacia', [from.id, to.id], 2);
  return p;
}

/** El jugador responde a una propuesta de la IA. */
export function answerProposal(world: World, id: string, accept: boolean): string {
  const i = world.proposals.findIndex((p) => p.id === id);
  if (i < 0) return 'La propuesta ya no está disponible.';
  const p = world.proposals[i];
  world.proposals.splice(i, 1);
  const from = world.countries[p.from], to = world.countries[p.to];
  if (!from || !to) return '';
  if (!accept) {
    if (p.kind === 'ultimatum') {
      rejectUltimatum(world, from, to);
      return 'Ultimátum rechazado. El país que lo envió tiene ahora un casus belli.';
    }
    remember(world, from, to.id, 'rechazo');
    news(world, `${to.name} rechaza la propuesta de ${from.name}.`, 'diplomacia', [from.id, to.id], 1);
    return 'Propuesta rechazada.';
  }
  if (p.kind === 'treaty') {
    signTreaty(world, String(p.terms.type), from, to, Number(p.terms.duration ?? -1));
    return `Has firmado: ${TREATY_NAMES[String(p.terms.type)] ?? p.terms.type} con ${from.name}.`;
  }
  if (p.kind === 'ultimatum') {
    applyConcession(world, from, to, String(p.terms.demand));
    return 'Has cedido ante el ultimátum.';
  }
  return 'Aceptada.';
}

export function expireProposals(world: World) {
  for (const p of [...world.proposals]) {
    if (world.turn - p.turn < 3) continue;
    world.proposals = world.proposals.filter((x) => x !== p);
    const from = world.countries[p.from], to = world.countries[p.to];
    if (!from || !to) continue;
    if (p.kind === 'ultimatum') rejectUltimatum(world, from, to);
    else remember(world, from, to.id, 'rechazo');
  }
}

export const DEMANDS: Record<string, string> = {
  levantar_sanciones: 'levantar todas las sanciones',
  romper_alianzas: 'romper sus alianzas militares',
  compensacion: 'pagar una compensación (1 % del PIB)',
  desmilitarizar: 'reducir su presupuesto de defensa',
};

function applyConcession(world: World, demander: Country, target: Country, demand: string) {
  switch (demand) {
    case 'levantar_sanciones': setSanction(world, target, demander, 0); break;
    case 'romper_alianzas':
      for (const t of world.treaties.filter((x) => (x.type === 'alliance' || x.type === 'defense') && x.parties.includes(target.id))) endTreaty(world, t, target);
      break;
    case 'compensacion': {
      const amt = target.eco.gdp * 0.01;
      target.eco.debt += amt;
      demander.eco.debt = Math.max(0, demander.eco.debt - amt);
      break;
    }
    case 'desmilitarizar': target.eco.budget.defense *= 0.75; break;
  }
  remember(world, demander, target.id, 'cesion');
  target.pol.legitimacy = clamp(target.pol.legitimacy - 6, 0, 100);
  target.groups.military.support = clamp(target.groups.military.support - 6, 0, 100);
  news(world, `${target.name} cede ante el ultimátum de ${demander.name} y acepta ${DEMANDS[demand] ?? demand}.`, 'diplomacia', [target.id, demander.id], 2);
}

function rejectUltimatum(world: World, demander: Country, target: Country) {
  demander.pol.flags[`cb_${target.id}`] = world.turn;
  news(world, `${target.name} rechaza el ultimátum de ${demander.name}. ${demander.short} tiene ahora un casus belli.`, 'diplomacia', [target.id, demander.id], 2);
}

export function registerDiploHandlers() {
  registerHandler('visit', {
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const amount = Number(def.params?.amount ?? 6) * foreignSkill(a) * (1 - Math.abs(relOp(world, t.id, a.id)) / 160);
      const r = world.rel[t.id][a.id];
      r.op = clamp(r.op + amount, -100, 100);
      r.trust = clamp(r.trust + amount * 0.3, 0, 100);
      world.rel[a.id][t.id].op = clamp(world.rel[a.id][t.id].op + amount * 0.4, -100, 100);
      remember(world, t, a.id, String(def.params?.kind ?? 'visita'));
      if (!ctx.silent || world.player?.country === t.id) news(world, `${def.params?.kind === 'cumbre' ? '🤝 Cumbre' : '✈ Visita oficial'} de ${a.name} a ${t.name}.`, 'diplomacia', [a.id, t.id], def.params?.kind === 'cumbre' ? 1 : 0);
      return { ok: true, passed: true, text: `La relación de ${t.name} con tu país mejora (+${amount.toFixed(0)}).` };
    },
    preview: (world, def, ctx, p) => {
      const amount = Number(def.params?.amount ?? 6) * foreignSkill(ctx.actor) * (1 - Math.abs(relOp(world, ctx.target!.id, ctx.actor.id)) / 160);
      p.lines.push({ when: 'inmediato', text: `Opinión de ${ctx.target!.short} sobre ti: +${amount.toFixed(1)}`, good: true });
    },
  });

  registerHandler('treaty', {
    validate: (world, def, ctx) => {
      const type = String(def.params?.type);
      if (!ctx.target) return null;
      if (treatiesBetween(world, ctx.actor.id, ctx.target.id).some((t) => t.type === type)) return 'Ya existe ese tratado';
      if ((type === 'alliance') && allied(world, ctx.actor.id, ctx.target.id)) return 'Ya sois aliados';
      if (type === 'trade') {
        const common = Object.values(world.orgs).find((o) => o.tradeBonus >= 0.3 && o.members.includes(ctx.actor.id) && o.members.includes(ctx.target!.id));
        if (common) return `Ya compartís un mercado común (${common.short})`;
      }
      if (world.proposals.some((p) => p.from === ctx.actor.id && p.to === ctx.target!.id)) return 'Ya hay una propuesta pendiente';
      return null;
    },
    preview: (world, def, ctx, p) => previewAcceptance(world, ctx.actor, ctx.target!, String(def.params?.type), p),
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const type = String(def.params?.type);
      const duration = Number(def.params?.duration ?? -1);
      if (world.player?.country === t.id) {
        sendProposal(world, a, t, 'treaty', { type, duration }, TREATY_NAMES[type] ?? type);
        return { ok: true, passed: true, text: 'Propuesta enviada.' };
      }
      const rng = rngOf(world);
      const { accepted, ev } = decideProposal(world, a, t, type, rng);
      world.rng = rng.state;
      logDecision(world, {
        turn: world.turn, actor: t.id, action: `respuesta:${type}`, target: a.id, score: Math.round(ev.score * 100) / 100, accepted,
        text: `${t.name} ${accepted ? 'acepta' : 'rechaza'} ${(TREATY_NAMES[type] ?? type).toLowerCase()} con ${a.name}`, reasons: ev.reasons,
      });
      if (!accepted) {
        remember(world, a, t.id, 'rechazo');
        if (world.player?.country === a.id) news(world, `${t.name} rechaza tu propuesta (${(TREATY_NAMES[type] ?? type).toLowerCase()}): ${ev.reasons.slice(0, 3).join(', ')}.`, 'diplomacia', [a.id, t.id], 2);
        return { ok: true, passed: true, text: `${t.name} rechaza la propuesta. Motivos: ${ev.reasons.join(', ')}.` };
      }
      signTreaty(world, type, a, t, duration);
      return { ok: true, passed: true, text: `${t.name} acepta: ${TREATY_NAMES[type] ?? type}.` };
    },
  });

  registerHandler('aid', {
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const amt = a.eco.gdp * Number(def.params?.share ?? 0.001);
      t.eco.debt = Math.max(0, t.eco.debt - amt * 0.5);
      t.eco.reserves += amt * 0.5;
      remember(world, t, a.id, 'ayuda', clamp(amt / Math.max(1, t.eco.gdp) * 100, 0.4, 2));
      a.reputation = clamp(a.reputation + 1.5, 0, 100);
      news(world, `🎁 ${a.name} envía ayuda a ${t.name} (${amt.toFixed(1)} mil millones $).`, 'diplomacia', [a.id, t.id], 1);
      return { ok: true, passed: true, text: `Ayuda enviada: ${amt.toFixed(1)} mil millones $.` };
    },
  });

  registerHandler('aid_program', {
    validate: (world, def, ctx) => (ctx.target && world.treaties.some((x) => x.type === 'aid' && x.parties[0] === ctx.actor.id && x.parties[1] === ctx.target!.id) ? 'Ya existe un programa de ayuda' : null),
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const amount = a.eco.gdp * Number(def.params?.share ?? 0.0005);
      signTreaty(world, 'aid', a, t, Number(def.params?.duration ?? 60), { amount });
      remember(world, t, a.id, 'ayuda');
      a.reputation = clamp(a.reputation + 3, 0, 100);
      return { ok: true, passed: true, text: `Programa de ayuda de ${amount.toFixed(1)} mil millones $/año.` };
    },
  });

  registerHandler('sanction', {
    validate: (world, def, ctx) => {
      if (!ctx.target) return null;
      const cur = world.sanctions.find((s) => s.by === ctx.actor.id && s.target === ctx.target!.id)?.level ?? 0;
      const lv = Number(ctx.params?.level ?? def.params?.level ?? 1);
      return lv <= cur ? `Ya le sancionas con nivel ${cur}` : null;
    },
    preview: (world, def, ctx, p) => {
      const lv = Number(ctx.params?.level ?? 1);
      p.extra.push(`Nivel ${lv}: el comercio bilateral se reduce un ${[0, 30, 60, 95][lv]} %. Su economía y la tuya pierden según la interdependencia.`);
      const t = ctx.target!;
      const ret = (t.ai.aggression + 0.3 * lv - (relOp(world, t.id, ctx.actor.id) / 100)) > 0.6;
      p.risks.push(ret ? `Represalia probable de ${t.name}` : `${t.name} probablemente no responderá con sanciones`);
    },
    apply: (world, def, ctx) => {
      const lv = Number(ctx.params?.level ?? def.params?.level ?? 1);
      setSanction(world, ctx.actor, ctx.target!, lv);
      return { ok: true, passed: true, text: `Sanciones de nivel ${lv} contra ${ctx.target!.name}.` };
    },
  });

  registerHandler('lift_sanctions', {
    apply: (world, def, ctx) => {
      setSanction(world, ctx.actor, ctx.target!, 0);
      const r = world.rel[ctx.target!.id][ctx.actor.id];
      r.op = clamp(r.op + 8, -100, 100);
      return { ok: true, passed: true, text: `Sanciones levantadas a ${ctx.target!.name}.` };
    },
  });

  registerHandler('tariff', {
    validate: (world, def, ctx) => {
      if (!ctx.target) return null;
      const cur = world.tariffs[ctx.actor.id]?.[ctx.target.id] ?? 0;
      const v = Number(def.params?.value ?? 25);
      if (v === 0 && cur === 0) return 'No le impones aranceles extra';
      if (v > 0 && cur >= v) return 'Ya tiene esos aranceles';
      return null;
    },
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const v = Number(def.params?.value ?? 25);
      (world.tariffs[a.id] ??= {})[t.id] = v;
      bumpRev(world);
      if (v > 0) {
        remember(world, t, a.id, 'aranceles');
        world.incidents.push({ turn: world.turn, actor: a.id, target: t.id, kind: 'aranceles', magnitude: 1, text: 'Aranceles' });
        news(world, `📦 ${a.name} impone aranceles del ${v} % a ${t.name}.`, 'diplomacia', [a.id, t.id], 1);
      } else {
        world.rel[t.id][a.id].op = clamp(world.rel[t.id][a.id].op + 5, -100, 100);
        news(world, `${a.name} retira los aranceles a ${t.name}.`, 'diplomacia', [a.id, t.id], 1);
      }
      return { ok: true, passed: true, text: v ? `Aranceles del ${v} % a ${t.name}.` : 'Aranceles retirados.' };
    },
  });

  registerHandler('ultimatum', {
    preview: (world, def, ctx, p) => {
      const demand = String(ctx.params?.demand ?? 'levantar_sanciones');
      p.extra.push(`Exiges a ${ctx.target!.name}: ${DEMANDS[demand] ?? demand}.`);
      previewAcceptance(world, ctx.actor, ctx.target!, 'ultimatum', p);
    },
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const demand = String(ctx.params?.demand ?? 'levantar_sanciones');
      remember(world, t, a.id, 'amenaza');
      a.reputation = clamp(a.reputation - 3, 0, 100);
      if (world.player?.country === t.id) {
        sendProposal(world, a, t, 'ultimatum', { demand }, `ultimátum: ${DEMANDS[demand] ?? demand}`);
        return { ok: true, passed: true, text: 'Ultimátum enviado.' };
      }
      const rng = rngOf(world);
      const { accepted, ev } = decideProposal(world, a, t, 'ultimatum', rng);
      world.rng = rng.state;
      logDecision(world, { turn: world.turn, actor: t.id, action: 'respuesta:ultimatum', target: a.id, score: ev.score, accepted, text: `${t.name} ${accepted ? 'cede ante' : 'rechaza'} el ultimátum de ${a.name}`, reasons: ev.reasons });
      if (accepted) { applyConcession(world, a, t, demand); return { ok: true, passed: true, text: `${t.name} cede: ${DEMANDS[demand]}.` }; }
      rejectUltimatum(world, a, t);
      return { ok: true, passed: true, text: `${t.name} rechaza el ultimátum (${ev.reasons.join(', ')}). Tienes un casus belli durante 12 meses.` };
    },
  });

  registerHandler('break_relations', {
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      for (const tr of treatiesBetween(world, a.id, t.id)) if (tr.type !== 'ceasefire') endTreaty(world, tr, a);
      const cur = world.sanctions.find((s) => s.by === a.id && s.target === t.id)?.level ?? 0;
      if (cur < 1) setSanction(world, a, t, 1);
      remember(world, t, a.id, 'ruptura');
      world.rel[a.id][t.id].op = clamp(world.rel[a.id][t.id].op - 20, -100, 100);
      news(world, `⛔ ${a.name} rompe relaciones diplomáticas con ${t.name}.`, 'diplomacia', [a.id, t.id], 2);
      return { ok: true, passed: true, text: `Relaciones rotas con ${t.name}.` };
    },
  });

  registerHandler('expel', {
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      t.intel.networks[a.id] = (t.intel.networks[a.id] ?? 0) * 0.4;
      remember(world, t, a.id, 'insulto');
      news(world, `${a.name} expulsa a diplomáticos de ${t.name}.`, 'diplomacia', [a.id, t.id], 1);
      return { ok: true, passed: true, text: `La red de espionaje de ${t.name} en tu país queda muy debilitada.` };
    },
  });

  registerHandler('break_treaty', {
    validate: (world, def, ctx) => (ctx.target && !treatiesBetween(world, ctx.actor.id, ctx.target.id).some((t) => t.type !== 'ceasefire') ? 'No tienes tratados con este país' : null),
    apply: (world, def, ctx) => {
      const list = treatiesBetween(world, ctx.actor.id, ctx.target!.id).filter((t) => t.type !== 'ceasefire');
      for (const t of list) endTreaty(world, t, ctx.actor);
      return { ok: true, passed: true, text: `Has roto ${list.length} tratado(s) con ${ctx.target!.name}.` };
    },
  });

  registerHandler('resolution', {
    preview: (world, def, ctx, p) => {
      const kind = String(ctx.params?.kind ?? 'condena');
      p.extra.push(`Resolución: ${RESOLUTION_KINDS[kind] ?? kind}. Se vota el próximo mes${kind === 'sanciones' ? ' en el Consejo de Seguridad (con derecho de veto)' : ' en la Asamblea General'}.`);
    },
    apply: (world, def, ctx) => {
      const kind = String(ctx.params?.kind ?? 'condena');
      const r = proposeResolution(world, 'ONU', kind, ctx.actor.id, ctx.target!.id);
      if (!r) return { ok: false, passed: false, text: 'Ya hay una resolución similar pendiente.' };
      news(world, `📜 ${ctx.actor.name} presenta en la ONU: «${r.text}».`, 'organismos', [ctx.actor.id, ctx.target!.id], 1);
      return { ok: true, passed: true, text: 'Resolución presentada. Se votará el próximo mes.' };
    },
  });

  registerHandler('mediation', {
    preview: (world, def, ctx, p) => {
      const w = world.wars.find((x) => x.ceasefire <= 0 && (x.attackers.includes(ctx.target!.id) || x.defenders.includes(ctx.target!.id)));
      if (w) p.extra.push(`Guerra: ${w.name}. Ambas partes deben aceptar un alto el fuego de 12 meses.`);
    },
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      const w = world.wars.find((x) => x.ceasefire <= 0 && (x.attackers.includes(t.id) || x.defenders.includes(t.id)));
      if (!w) return { ok: false, passed: false, text: 'No hay una guerra activa.' };
      const A = world.countries[w.leaderA], D = world.countries[w.leaderD];
      const pressure = a.reputation / 120 + (a.eco.gdp > 5000 ? 0.3 : 0);
      const rng = rngOf(world);
      const ea = decideProposal(world, a, A, 'ceasefire', rng, { score: w.score, exhaustion: w.exhaustionA, pressure });
      const ed = decideProposal(world, a, D, 'ceasefire', rng, { score: -w.score, exhaustion: w.exhaustionD, pressure });
      world.rng = rng.state;
      a.reputation = clamp(a.reputation + 2, 0, 100);
      logDecision(world, { turn: world.turn, actor: A.id, action: 'respuesta:alto_fuego', target: a.id, score: ea.ev.score, accepted: ea.accepted, text: `${A.name} ${ea.accepted ? 'acepta' : 'rechaza'} la mediación de ${a.name}`, reasons: ea.ev.reasons });
      logDecision(world, { turn: world.turn, actor: D.id, action: 'respuesta:alto_fuego', target: a.id, score: ed.ev.score, accepted: ed.accepted, text: `${D.name} ${ed.accepted ? 'acepta' : 'rechaza'} la mediación de ${a.name}`, reasons: ed.ev.reasons });
      if (ea.accepted && ed.accepted) {
        w.ceasefire = 12;
        bumpRev(world);
        remember(world, A, a.id, 'mediacion'); remember(world, D, a.id, 'mediacion');
        a.reputation = clamp(a.reputation + 8, 0, 100);
        news(world, `🕊 Alto el fuego en «${w.name}» gracias a la mediación de ${a.name}.`, 'guerra', [a.id, A.id, D.id], 3);
        return { ok: true, passed: true, text: 'Ambas partes aceptan un alto el fuego de 12 meses.' };
      }
      news(world, `La mediación de ${a.name} en «${w.name}» fracasa.`, 'guerra', [a.id, A.id, D.id], 1);
      return { ok: true, passed: true, text: `La mediación fracasa. ${!ea.accepted ? `${A.short}: ${ea.ev.reasons.slice(0, 2).join(', ')}. ` : ''}${!ed.accepted ? `${D.short}: ${ed.ev.reasons.slice(0, 2).join(', ')}.` : ''}` };
    },
  });

  registerHandler('join_org', {
    validate: (world, def, ctx) => {
      const o = world.orgs[String(ctx.params?.org ?? '')];
      if (!o) return 'Elige un organismo';
      if (o.members.includes(ctx.actor.id)) return 'Ya eres miembro';
      if (o.type === 'universal') return 'Ya eres miembro';
      return null;
    },
    preview: (world, def, ctx, p) => {
      const o = world.orgs[String(ctx.params?.org)];
      if (!o) return;
      const evs = o.members.map((m) => evaluateProposal(world, ctx.actor, world.countries[m], 'join_org'));
      const yes = evs.filter((e) => e.prob > 0.5).length;
      p.extra.push(`${o.name}: ${yes} de ${o.members.length} miembros parecen favorables (se necesita mayoría).`);
      if (o.mutualDefense) {
        const angry = world.order.filter((id) => personalityOf(world.countries[id].ai.personality).redLines.includes('alliance_on_border') && neighborsLand(id).includes(ctx.actor.id) && !o.members.includes(id));
        if (angry.length) p.risks.push(`Línea roja para ${angry.map((x) => world.countries[x].name).join(', ')}: lo considerará una amenaza directa.`);
      }
    },
    apply: (world, def, ctx) => {
      const a = ctx.actor;
      const o = world.orgs[String(ctx.params?.org)];
      const rng = rngOf(world);
      let yes = 0;
      for (const m of o.members) if (decideProposal(world, a, world.countries[m], 'join_org', rng).accepted) yes++;
      world.rng = rng.state;
      if (yes * 2 <= o.members.length) {
        news(world, `${o.short} rechaza el ingreso de ${a.name} (${yes}/${o.members.length} a favor).`, 'organismos', [a.id], 2);
        return { ok: true, passed: true, text: `Ingreso rechazado: solo ${yes} de ${o.members.length} miembros a favor.` };
      }
      o.members.push(a.id);
      bumpRev(world);
      news(world, `🏳 ${a.name} ingresa en ${o.name}.`, 'organismos', [a.id], 2);
      if (o.mutualDefense) {
        for (const id of world.order) {
          const c = world.countries[id];
          if (o.members.includes(id) || !personalityOf(c.ai.personality).redLines.includes('alliance_on_border') || !neighborsLand(id).includes(a.id)) continue;
          remember(world, c, a.id, 'amenaza', 2);
          world.incidents.push({ turn: world.turn, actor: a.id, target: id, kind: 'amenaza', magnitude: 3, text: `Ingreso en ${o.short}` });
          news(world, `⚠ ${c.name} considera el ingreso de ${a.name} en ${o.short} una línea roja.`, 'diplomacia', [id, a.id], 3);
        }
      }
      return { ok: true, passed: true, text: `Ahora eres miembro de ${o.name}.` };
    },
  });

  registerHandler('leave_org', {
    validate: (world, def, ctx) => {
      const o = world.orgs[String(ctx.params?.org ?? '')];
      if (!o || !o.members.includes(ctx.actor.id)) return 'No eres miembro';
      if (o.type === 'universal') return 'No puedes abandonar la ONU';
      return null;
    },
    apply: (world, def, ctx) => {
      const o = world.orgs[String(ctx.params?.org)];
      o.members = o.members.filter((m) => m !== ctx.actor.id);
      bumpRev(world);
      for (const m of o.members) remember(world, world.countries[m], ctx.actor.id, o.mutualDefense ? 'abandono' : 'rechazo', 0.5);
      news(world, `${ctx.actor.name} abandona ${o.name}.`, 'organismos', [ctx.actor.id], 2);
      return { ok: true, passed: true, text: `Has abandonado ${o.name}.` };
    },
  });
}
