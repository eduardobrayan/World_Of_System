/** Inteligencia: operaciones encubiertas con probabilidad de éxito y de ser descubiertas. */
import type { Country, IntelOp, World } from './types';
import { TECH_BY_ID } from './data';
import { ACTION_BY_ID, registerHandler } from './actions';
import { registerAiGenerator } from './ai';
import { addModifier } from './effects';
import { remember } from './diplomacy';
import { modSum, relOp } from './vars';
import { grantTech } from './tech';
import { clamp, news, rngOf, timeline, uid } from './util';

export const OP_NAMES: Record<string, string> = {
  espionaje: 'Red de espionaje', oposicion: 'Financiación de la oposición', sabotaje: 'Sabotaje', tecnologia: 'Robo de tecnología',
  desinformacion: 'Desinformación', ciber: 'Ciberataque', golpe: 'Apoyo a un golpe',
};

export function intelLevel(c: Country): number {
  return clamp(c.intel.level + modSum(c, 'intel'), 0, 120);
}
export function counterLevel(c: Country): number {
  return clamp(c.intel.counter + modSum(c, 'counter'), 0, 120);
}

/** Probabilidades de éxito y de descubrimiento (total de la operación). */
export function opOdds(world: World, actor: Country, target: Country, difficulty: number, exposure: number) {
  const net = (actor.intel.networks[target.id] ?? 0) / 100;
  const success = clamp(0.25 + (intelLevel(actor) - counterLevel(target)) / 110 + net * 0.35 - difficulty, 0.05, 0.95);
  const discovery = clamp(exposure + counterLevel(target) / 220 - net * 0.25 - intelLevel(actor) / 400, 0.03, 0.92);
  return { success, discovery };
}

function applyOpSuccess(world: World, a: Country, t: Country, op: IntelOp) {
  const src = `intel:${op.op}`;
  switch (op.op) {
    case 'espionaje':
      a.intel.networks[t.id] = clamp((a.intel.networks[t.id] ?? 0) + 25, 0, 100);
      break;
    case 'oposicion':
      addModifier(world, t, { id: `op_oposicion_${a.id}`, name: 'Oposición financiada desde el exterior', duration: 12, mods: { stability: -6, protest: 8, 'group.all': -3 } }, src);
      break;
    case 'sabotaje':
      addModifier(world, t, { id: `op_sabotaje_${a.id}`, name: 'Sabotajes en infraestructuras', duration: 6, mods: { growth: -0.8, 'prod.food': -0.03 } }, src);
      for (const r of t.regions.slice(0, 2)) r.damage = clamp(r.damage + 10, 0, 100);
      t.res.oil.prod *= 0.97;
      t.res.gas.prod *= 0.97;
      break;
    case 'tecnologia': {
      const stealable = t.tech.done.filter((id) => !a.tech.done.includes(id) && TECH_BY_ID[id]?.req.every((r) => a.tech.done.includes(r)));
      if (stealable.length) {
        const tech = TECH_BY_ID[stealable[Math.floor((world.turn * 7 + a.id.length) % stealable.length)]];
        grantTech(world, a, tech);
        a.tech.stolen += 1;
        if (world.player?.country === a.id) news(world, `🕵 Tus agentes obtienen la tecnología «${tech.name}» de ${t.name}.`, 'inteligencia', [a.id], 2);
      } else a.tech.progress += t.tech.points * 4;
      break;
    }
    case 'desinformacion':
      addModifier(world, t, { id: `op_desinfo_${a.id}`, name: 'Campaña de desinformación extranjera', duration: 12, mods: { trust: -5, 'group.all': -2, protest: 4 } }, src);
      break;
    case 'ciber':
      addModifier(world, t, { id: `op_ciber_${a.id}`, name: 'Ciberataque', duration: 2, mods: { growth: -1.2 } }, src);
      t.intel.counter = clamp(t.intel.counter - 3, 0, 100);
      break;
    case 'golpe':
      addModifier(world, t, { id: `op_golpe_${a.id}`, name: 'Conspiración militar', duration: 8, mods: { coupRisk: 4, 'group.military': -15 } }, src);
      break;
  }
}

/** Avance mensual de las operaciones en curso. */
export function updateIntel(world: World) {
  const rng = rngOf(world);
  for (const id of world.order) {
    const a = world.countries[id];
    if (!a.alive) continue;
    for (const [tid, v] of Object.entries(a.intel.networks)) a.intel.networks[tid] = Math.max(0, v - 0.4);
    for (const op of a.intel.ops) {
      const t = world.countries[op.target];
      op.remaining -= 1;
      if (!t?.alive) { op.remaining = 0; continue; }
      // Riesgo de descubrimiento repartido a lo largo de la operación
      const months = Math.max(1, op.remaining + 1);
      const monthly = 1 - Math.pow(1 - op.discovery, 1 / months);
      if (rng.next() < monthly) {
        exposeOp(world, a, t, op);
        op.remaining = -1;
        continue;
      }
      if (op.remaining <= 0) {
        const ok = rng.next() < op.success;
        if (ok) applyOpSuccess(world, a, t, op);
        if (world.player?.country === a.id) {
          news(world, `🕵 Operación «${OP_NAMES[op.op]}» contra ${t.name}: ${ok ? 'éxito' : 'fracaso'}.`, 'inteligencia', [a.id], 2);
          timeline(world, `Operación encubierta contra ${t.name}: ${OP_NAMES[op.op]} (${ok ? 'éxito' : 'fracaso'})`, 'inteligencia');
        }
      }
    }
    a.intel.ops = a.intel.ops.filter((o) => o.remaining > 0);
  }
  world.rng = rng.state;
}

function exposeOp(world: World, a: Country, t: Country, op: IntelOp) {
  const severe = op.op === 'golpe' || op.op === 'sabotaje' || op.op === 'oposicion';
  remember(world, t, a.id, 'espionaje', severe ? 2 : 1);
  a.reputation = clamp(a.reputation - (severe ? 8 : 3), 0, 100);
  world.incidents.push({ turn: world.turn, actor: a.id, target: t.id, kind: 'espionaje', magnitude: severe ? 2 : 1, text: OP_NAMES[op.op] });
  if (op.op === 'golpe') t.pol.flags[`cb_${a.id}`] = world.turn;
  a.intel.networks[t.id] = (a.intel.networks[t.id] ?? 0) * 0.3;
  news(world, `🕵 ${t.name} descubre una operación de ${a.name}: ${OP_NAMES[op.op].toLowerCase()}.`, 'inteligencia', [a.id, t.id], world.player?.country === a.id || world.player?.country === t.id ? 3 : 1);
  if (world.player?.country === a.id) timeline(world, `Operación descubierta por ${t.name}: ${OP_NAMES[op.op]}`, 'inteligencia');
}

export function registerIntelHandlers() {
  registerHandler('intel_op', {
    validate: (world, def, ctx) => {
      if (!ctx.target) return null;
      if (ctx.actor.intel.ops.some((o) => o.target === ctx.target!.id && o.op === def.params?.op)) return 'Ya hay una operación igual en curso';
      if (ctx.actor.intel.ops.length >= 4) return 'Máximo 4 operaciones simultáneas';
      if (def.params?.op === 'tecnologia' && !ctx.target.tech.done.some((id) => !ctx.actor.tech.done.includes(id))) return 'No tiene tecnologías que te falten';
      return null;
    },
    preview: (world, def, ctx, p) => {
      const o = opOdds(world, ctx.actor, ctx.target!, Number(def.params?.difficulty ?? 0), Number(def.params?.exposure ?? 0.2));
      p.extra.push(`Duración: ${def.params?.months} meses · probabilidad de éxito ${(o.success * 100).toFixed(0)} % · riesgo de ser descubierto ${(o.discovery * 100).toFixed(0)} %.`);
      p.extra.push(`Tu red en ${ctx.target!.name}: ${(ctx.actor.intel.networks[ctx.target!.id] ?? 0).toFixed(0)} / 100 · su contrainteligencia: ${counterLevel(ctx.target!).toFixed(0)}.`);
    },
    apply: (world, def, ctx) => {
      const o = opOdds(world, ctx.actor, ctx.target!, Number(def.params?.difficulty ?? 0), Number(def.params?.exposure ?? 0.2));
      ctx.actor.intel.ops.push({ id: uid(world, 'op'), op: String(def.params?.op), target: ctx.target!.id, remaining: Number(def.params?.months ?? 3), success: o.success, discovery: o.discovery, started: world.turn });
      return { ok: true, passed: true, text: `Operación en marcha (${def.params?.months} meses).` };
    },
  });

  registerAiGenerator((world, c, rng, out) => {
    if (intelLevel(c) < 35 || c.intel.ops.length >= 2) return;
    const p = c.ai;
    for (const tid of c.ai.rivals) {
      const t = world.countries[tid];
      if (!t?.alive) continue;
      const op = relOp(world, c.id, tid);
      const hostility = clamp(-op / 100, 0, 1);
      const push = (id: string, base: number, label: string) => {
        const def = ACTION_BY_ID[id];
        const odds = opOdds(world, c, t, Number(def.params?.difficulty ?? 0), Number(def.params?.exposure ?? 0.2));
        const f = [{ label: 'hostilidad', value: hostility }, { label: 'probabilidad de éxito', value: odds.success }, { label: 'riesgo de exposición', value: -odds.discovery * (0.5 + p.riskAversion) }, { label: 'base', value: base }];
        out.push({ def, ctx: { actor: c, target: t, silent: true }, utility: f.reduce((a, x) => a + x.value, 0), factors: f, text: `${label} contra ${t.name}` });
      };
      if ((c.intel.networks[tid] ?? 0) < 40) push('op_espionaje', 0.2, 'una operación de espionaje');
      if (t.tech.level > c.tech.level + 8) push('op_robo_tecnologia', 0.1 + p.pragmatism * 0.2, 'robar tecnología');
      if (p.aggression > 0.5) push('op_desinformacion', -0.1 + p.ideologyZeal * 0.3, 'una campaña de desinformación');
      if (p.aggression > 0.6 && world.wars.some((w) => (w.attackers.includes(c.id) && w.defenders.includes(tid)) || (w.defenders.includes(c.id) && w.attackers.includes(tid)))) push('op_sabotaje', 0.4, 'sabotajes');
    }
    void rng;
  });
}
