/** Mecánicas especiales de las acciones de gobierno: políticas, ministros, elecciones, referéndum, régimen. */
import type { Country, GroupId, Minister, Ministry, World } from './types';
import { GROUPS } from './types';
import { POLICY_BY_ID, regimeOf } from './data';
import { registerHandler, type EffectLine } from './actions';
import { policyModifier, setPolicy } from './policies';
import { addModifier, removeModifier } from './effects';
import { generateMinister } from './init';
import { projectedVote } from './elections';
import { Rng, seedRng } from './rng';
import { clamp, news, rngOf } from './util';

export const MINISTRY_NAMES: Record<Ministry, string> = {
  economy: 'Economía y Hacienda', defense: 'Defensa', interior: 'Interior', foreign: 'Asuntos Exteriores', education: 'Educación',
  health: 'Sanidad', industry: 'Industria', transport: 'Transportes', energy: 'Energía', agriculture: 'Agricultura',
};

export const MINISTRY_EFFECT: Record<Ministry, string> = {
  economy: 'Mejora la recaudación (competencia) y la confianza empresarial.',
  defense: 'Abarata la producción militar.',
  interior: 'Reduce la corrupción y mejora la seguridad.',
  foreign: 'Aumenta la probabilidad de éxito diplomático.',
  education: 'Acelera la mejora educativa.',
  health: 'Acelera la mejora sanitaria.',
  industry: 'Abarata y acelera las obras industriales.',
  transport: 'Abarata y acelera las infraestructuras.',
  energy: 'Mejora la producción energética.',
  agriculture: 'Mejora la producción de alimentos.',
};

const PROFILE_NAMES = { tecnocrata: 'Tecnócrata', leal: 'Leal al partido', grupo: 'Representante de un grupo' } as const;

/** Tres candidatos deterministas para un ministerio (no consumen el RNG del mundo). */
export function ministerCandidates(world: World, c: Country, ministry: Ministry): Minister[] {
  const rng = new Rng(seedRng(`${world.seed}|${world.turn}|${c.id}|${ministry}`));
  return (['tecnocrata', 'leal', 'grupo'] as const).map((p) => generateMinister(rng, c, ministry, p, world.turn));
}

export function profileName(m: Minister): string {
  return m.profile === 'grupo' && m.group ? `${PROFILE_NAMES.grupo} (${m.group})` : PROFILE_NAMES[m.profile];
}

function policyLean(id: string, from: number, to: number) {
  const def = POLICY_BY_ID[id];
  const g = (lv: number, k: GroupId) => def.levels[lv]?.groups[k] ?? 0;
  const d = (k: GroupId) => g(to, k) - g(from, k);
  return {
    econ: clamp((d('business') - d('workers')) / 15, -1, 1),
    auth: clamp((d('military') + d('religious') * 0.5 - d('youth') - d('minorities')) / 18 - ((def.levels[to].mods.pressFreedom ?? 0) - (def.levels[from].mods.pressFreedom ?? 0)) / 60, -1, 1),
  };
}

export function registerGovHandlers() {
  registerHandler('policy', {
    validate: (world, def, ctx) => {
      const id = String(ctx.params?.policy ?? '');
      const pd = POLICY_BY_ID[id];
      if (!pd) return 'Política desconocida';
      const lv = Number(ctx.params?.level ?? -1);
      if (!Number.isInteger(lv) || lv < 0 || lv >= pd.levels.length) return 'Nivel no válido';
      if ((ctx.actor.pol.policies[id] ?? 0) === lv) return 'Ese ya es el nivel actual';
      return null;
    },
    lean: (world, def, ctx) => policyLean(String(ctx.params?.policy), ctx.actor.pol.policies[String(ctx.params?.policy)] ?? 0, Number(ctx.params?.level)),
    preview: (world, def, ctx, p) => {
      const id = String(ctx.params?.policy);
      const pd = POLICY_BY_ID[id];
      if (!pd) return;
      const from = ctx.actor.pol.policies[id] ?? 0, to = Number(ctx.params?.level);
      const a = policyModifier(pd, from).mods, b = policyModifier(pd, to).mods;
      const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
      const lines: EffectLine[] = [];
      for (const k of keys) {
        const dv = Number(b[k] ?? 0) - Number(a[k] ?? 0);
        if (Math.abs(dv) < 1e-6) continue;
        lines.push({ when: 'permanente', text: `${k.startsWith('group.') ? `Apoyo de ${k.slice(6)}` : k}: ${dv > 0 ? '+' : ''}${dv.toFixed(2)}`, value: dv });
      }
      p.lines.push(...lines);
      p.extra.push(`${pd.name}: ${pd.levels[from].name} → ${pd.levels[to].name}. ${pd.levels[to].desc}`);
      for (const g of GROUPS) {
        const dv = (pd.levels[to].groups[g] ?? 0) - (pd.levels[from].groups[g] ?? 0);
        if (dv) p.groups.push({ group: g, name: g, delta: dv * 0.5 });
      }
    },
    apply: (world, def, ctx) => {
      const id = String(ctx.params?.policy);
      const lv = Number(ctx.params?.level);
      setPolicy(world, ctx.actor, id, lv);
      const pd = POLICY_BY_ID[id];
      news(world, `${ctx.actor.name} cambia su política de ${pd.name.toLowerCase()}: ${pd.levels[lv].name}.`, 'politica', [ctx.actor.id], world.player?.country === ctx.actor.id ? 1 : 0);
      return { ok: true, passed: true, text: `${pd.name}: ${pd.levels[lv].name}.` };
    },
  });

  registerHandler('minister', {
    validate: (world, def, ctx) => {
      const m = String(ctx.params?.ministry ?? '');
      if (!MINISTRY_NAMES[m as Ministry]) return 'Ministerio desconocido';
      const idx = Number(ctx.params?.idx ?? 0);
      if (!Number.isInteger(idx) || idx < 0 || idx >= ministerCandidates(world, ctx.actor, m as Ministry).length) return 'Candidato no válido';
      return null;
    },
    preview: (world, def, ctx, p) => {
      const ministry = String(ctx.params?.ministry) as Ministry;
      const cand = ministerCandidates(world, ctx.actor, ministry)[Number(ctx.params?.idx ?? 0)];
      const old = ctx.actor.pol.ministers.find((x) => x.ministry === ministry);
      if (cand) p.extra.push(`${cand.name} (${profileName(cand)}): competencia ${cand.competence.toFixed(0)}, lealtad ${cand.loyalty.toFixed(0)}.`);
      if (old?.profile === 'grupo' && old.group) p.groups.push({ group: old.group, name: old.group, delta: -4 });
      if (cand?.profile === 'grupo' && cand.group) p.groups.push({ group: cand.group, name: cand.group, delta: 4 });
      if (cand?.profile === 'tecnocrata') p.groups.push({ group: 'business', name: 'business', delta: 2 });
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      const ministry = String(ctx.params?.ministry) as Ministry;
      const cand = ministerCandidates(world, c, ministry)[Number(ctx.params?.idx ?? 0)];
      if (!cand) return { ok: false, passed: false, text: 'Candidato no válido' };
      const i = c.pol.ministers.findIndex((x) => x.ministry === ministry);
      const old = c.pol.ministers[i];
      if (old?.profile === 'grupo' && old.group) c.groups[old.group].support = clamp(c.groups[old.group].support - 4, 0, 100);
      removeModifier(c, `min_${ministry}`);
      if (cand.profile === 'grupo' && cand.group) {
        c.groups[cand.group].support = clamp(c.groups[cand.group].support + 4, 0, 100);
        addModifier(world, c, { id: `min_${ministry}`, name: `Ministro de ${MINISTRY_NAMES[ministry]} afín`, duration: -1, mods: { [`group.${cand.group}`]: 3 } }, 'ministro');
      }
      if (cand.profile === 'tecnocrata') c.groups.business.support = clamp(c.groups.business.support + 2, 0, 100);
      if (i >= 0) c.pol.ministers[i] = cand; else c.pol.ministers.push(cand);
      news(world, `${c.name} nombra a ${cand.name} ministro de ${MINISTRY_NAMES[ministry]}.`, 'gobierno', [c.id], world.player?.country === c.id ? 1 : 0);
      return { ok: true, passed: true, text: `${cand.name} es el nuevo ministro de ${MINISTRY_NAMES[ministry]}.` };
    },
  });

  registerHandler('early_elections', {
    apply: (world, def, ctx) => {
      ctx.actor.pol.nextElection = world.turn + 3;
      return { ok: true, passed: true, text: 'Elecciones convocadas para dentro de tres meses.' };
    },
    preview: (world, def, ctx, p) => {
      p.extra.push(`Voto previsto hoy para el gobierno: ${projectedVote(world, ctx.actor).value.toFixed(1)} % (necesitas más del 50 %).`);
    },
  });

  registerHandler('referendum', {
    preview: (world, def, ctx, p) => {
      p.extra.push(`Apoyo previsto: ${projectedVote(world, ctx.actor).value.toFixed(1)} % (±4).`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      const rng = rngOf(world);
      const share = clamp(projectedVote(world, c).value + rng.normal() * 4, 2, 98);
      world.rng = rng.state;
      if (share >= 50) {
        c.pol.legitimacy = clamp(c.pol.legitimacy + 8, 0, 100);
        c.pol.stability = clamp(c.pol.stability + 3, 0, 100);
        addModifier(world, c, { id: 'referendum_ganado', name: 'Referéndum ganado', duration: 12, mods: { 'group.all': 3, legitimacy: 3 } }, 'referendum');
        news(world, `🗳 ${c.name}: el gobierno gana el referéndum de confianza (${share.toFixed(1)} %).`, 'politica', [c.id], 2);
        return { ok: true, passed: true, text: `Has ganado el referéndum con el ${share.toFixed(1)} %.` };
      }
      c.pol.legitimacy = clamp(c.pol.legitimacy - 10, 0, 100);
      c.pol.stability = clamp(c.pol.stability - 5, 0, 100);
      addModifier(world, c, { id: 'referendum_perdido', name: 'Referéndum perdido', duration: 12, mods: { 'group.all': -4 } }, 'referendum');
      news(world, `🗳 ${c.name}: el gobierno pierde el referéndum de confianza (${share.toFixed(1)} %).`, 'crisis', [c.id], 2);
      return { ok: true, passed: true, text: `Has perdido el referéndum (${share.toFixed(1)} %). Tu legitimidad se resiente.` };
    },
  });

  registerHandler('election_fraud', {
    preview: (world, def, ctx, p) => {
      const risk = clamp(0.3 + ctx.actor.pol.pressFreedom / 250, 0.25, 0.7);
      p.extra.push(`Probabilidad de ser descubierto: ${(risk * 100).toFixed(0)} %. Si sale bien, +8 puntos de voto en las próximas elecciones.`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      const rng = rngOf(world);
      const caught = rng.next() < clamp(0.3 + c.pol.pressFreedom / 250, 0.25, 0.7);
      world.rng = rng.state;
      if (!caught) {
        c.pol.electionManip += 8;
        return { ok: true, passed: true, text: 'La maquinaria electoral está preparada. Nadie parece haberse dado cuenta… por ahora.' };
      }
      c.pol.electionManip += 3;
      c.pol.legitimacy = clamp(c.pol.legitimacy - 12, 0, 100);
      c.soc.protest = clamp(c.soc.protest + 20, 0, 100);
      c.reputation = clamp(c.reputation - 8, 0, 100);
      for (const id of world.order) {
        const o = world.countries[id];
        if (id !== c.id && regimeOf(o.pol.regime).competitive && world.rel[id]?.[c.id]) world.rel[id][c.id].op = clamp(world.rel[id][c.id].op - 5, -100, 100);
      }
      news(world, `📰 Escándalo en ${c.name}: se destapa un plan para manipular las elecciones.`, 'crisis', [c.id], 3);
      return { ok: true, passed: true, text: 'El plan ha sido descubierto: protestas, pérdida de legitimidad y condena internacional.' };
    },
  });

  registerHandler('regime_shift', {
    preview: (world, def, ctx, p) => {
      const to = shiftedRegime(ctx.actor.pol.regime, Number(def.params?.direction ?? 1));
      p.extra.push(`El régimen pasará de «${regimeOf(ctx.actor.pol.regime).name}» a «${regimeOf(to).name}».`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      const from = c.pol.regime;
      const to = shiftedRegime(from, Number(def.params?.direction ?? 1));
      c.pol.regime = to;
      const reg = regimeOf(to);
      if (reg.elections && c.pol.nextElection < world.turn) c.pol.nextElection = world.turn + 24;
      if (!reg.elections) c.pol.nextElection = -1;
      news(world, `${c.name} pasa a ser un ${reg.name.toLowerCase()}.`, 'gobierno', [c.id], 3);
      return { ok: true, passed: true, text: `Nuevo régimen: ${reg.name}.` };
    },
  });
}

const LADDER = ['democracia_parlamentaria', 'democracia_imperfecta', 'hibrido', 'autoritario'];

export function shiftedRegime(r: string, dir: number): string {
  if (dir > 0) {
    if (r === 'democracia_presidencial' || r === 'democracia_parlamentaria') return 'democracia_imperfecta';
    const i = LADDER.indexOf(r);
    return i >= 0 ? LADDER[Math.min(LADDER.length - 1, i + 1)] : r;
  }
  if (['autoritario', 'partido_unico', 'junta_militar', 'teocracia', 'monarquia_absoluta'].includes(r)) return 'hibrido';
  if (r === 'hibrido') return 'democracia_imperfecta';
  if (r === 'democracia_imperfecta') return 'democracia_presidencial';
  return r;
}
