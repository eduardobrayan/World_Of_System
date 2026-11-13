/**
 * Armas biológicas y brotes.
 *  - Programa secreto de armas biológicas (capacidad 0–100) con riesgo de ser descubierto.
 *  - Diseño de patógenos: humano, cultivos o ganado, con rasgos 1–5 (contagio, letalidad, sigilo,
 *    resistencia a tratamientos) limitados por la capacidad del programa; vacuna propia opcional.
 *  - Liberación encubierta contra otro país: el brote se propaga por fronteras y comercio, puede
 *    mutar, volverse contra su creador y ser atribuido (sanciones, casus belli, repudio mundial).
 *  - Fugas de laboratorio y defensa biológica (que también protege de pandemias naturales).
 */
import type { Country, Outbreak, PathogenDesign, World } from './types';
import { ACTION_BY_ID, registerHandler } from './actions';
import { registerAiGenerator, type Factor } from './ai';
import { remember, setSanction } from './diplomacy';
import { addShock, allied, atWar, neighborsLand, relOp, tradeShare } from './vars';
import { warScoreFor } from './vars';
import { counterLevel, intelLevel } from './intel';
import { clamp, news, rngOf, timeline, uid } from './util';

export const KIND_NAMES: Record<Outbreak['kind'], string> = { humano: 'Patógeno humano', cultivos: 'Plaga de cultivos', ganado: 'Enfermedad del ganado' };
export const TRAIT_NAMES: Record<'transmission' | 'lethality' | 'stealth' | 'resistance', { name: string; desc: string }> = {
  transmission: { name: 'Contagio', desc: 'Velocidad de propagación dentro del país y entre países.' },
  lethality: { name: 'Letalidad', desc: 'Muertes (o pérdida de cosechas y cabaña) por cada infectado.' },
  stealth: { name: 'Sigilo', desc: 'Meses que pasa sin detectarse y dificultad para atribuirlo.' },
  resistance: { name: 'Resistencia', desc: 'Tiempo hasta que vacunas o tratamientos lo frenan.' },
};

const NAME_PARTS: Record<Outbreak['kind'], { a: string[]; b: string[] }> = {
  humano: { a: ['Coronavirus', 'Fiebre', 'Paramixovirus', 'Gripe', 'Arenavirus', 'Síndrome'], b: ['Quimera', 'Ceniza', 'Hidra', 'Sombra', 'Ícaro', 'Medusa', 'Eco', 'Tormenta'] },
  cultivos: { a: ['Roya', 'Tizón', 'Fusariosis', 'Mosaico', 'Plaga'], b: ['negra', 'gris', 'de la ceniza', 'invernal', 'del Sahel', 'carmesí'] },
  ganado: { a: ['Fiebre', 'Peste', 'Encefalitis', 'Pleuroneumonía'], b: ['porcina X', 'bovina Z', 'aviar H9', 'ovina del norte', 'de los establos'] },
};

export function suggestPathogenName(world: World, kind: Outbreak['kind']): string {
  const p = NAME_PARTS[kind];
  const i = world.turn + world.uid;
  return `${p.a[i % p.a.length]} ${p.b[(i * 7 + 3) % p.b.length]}`;
}

/** Puntos de rasgo disponibles según la capacidad del programa. */
export function designCapacity(c: Country): number {
  return Math.floor(6 + c.bio.program / 8);
}

export function designCost(c: Country, d: { transmission: number; lethality: number; stealth: number; resistance: number; vaccine: boolean }) {
  const pts = d.transmission + d.lethality + d.stealth + d.resistance;
  const months = Math.max(3, Math.round(3 + pts * 1.1 - c.bio.program / 25 + (d.vaccine ? 4 : 0)));
  const cost = Math.max(0.2, c.eco.gdp * 0.00015 * pts * (d.vaccine ? 1.4 : 1));
  return { pts, months, cost };
}

export function outbreakShare(world: World, c: Country, kind: Outbreak['kind']): number {
  let s = 0;
  for (const o of world.global.outbreaks ?? []) if (o.kind === kind) s += o.infected[c.id] ?? 0;
  return Math.min(0.8, s);
}

/** Meses hasta que un país dispone de vacuna o tratamiento eficaz. */
function vaccineMonths(world: World, c: Country, o: Outbreak): number {
  if (o.vaccineFor === c.id) return 0;
  return Math.max(3, 5 + o.resistance * 3 - (c.tech.done.includes('vacunas_arnm') ? 3 : 0) - c.bio.defense / 25 - (c.tech.level - 50) / 20);
}

function resistOf(c: Country): number {
  return clamp(1.25 - c.bio.defense / 180 - c.soc.health / 300, 0.35, 1.4);
}

export function startOutbreak(world: World, o: Omit<Outbreak, 'id' | 'months' | 'detected' | 'deaths'>): Outbreak {
  const ob: Outbreak = { ...o, id: uid(world, 'ob'), months: 0, detected: false, deaths: 0 };
  (world.global.outbreaks ??= []).push(ob);
  return ob;
}

/** Programas, laboratorios y brotes: avance mensual. */
export function updateBio(world: World) {
  if (!world.global.outbreaks) world.global.outbreaks = [];
  const rng = rngOf(world);
  for (const id of world.order) {
    const c = world.countries[id];
    if (!c.alive || c.bio.program <= 0) continue;
    const b = c.bio;
    // Avance de la capacidad y coste del programa
    b.program = clamp(b.program + 0.4 + c.tech.level / 120 + c.eco.budget.research * 0.15, 0, 100);
    c.eco.extraSpending += c.eco.gdp * 0.0008;
    for (const d of b.designs) {
      if (d.ready === world.turn && world.player?.country === c.id) {
        news(world, `🧪 Tus laboratorios completan el patógeno «${d.name}».`, 'inteligencia', [c.id], 2);
      }
    }
    if (world.forecast) continue;
    // Riesgo de que se descubra el programa
    if (b.exposed < 0) {
      let spy = 0;
      for (const oid of world.order) {
        const x = world.countries[oid];
        if (oid !== c.id && x.alive && !x.isBlock && !allied(world, oid, c.id)) spy = Math.max(spy, intelLevel(x));
      }
      const p = clamp(0.002 + (spy - counterLevel(c)) / 100 * 0.004 + b.designs.length * 0.0008, 0.0005, 0.02);
      if (rng.next() < p) exposeProgram(world, c);
    }
    // Fugas de laboratorio
    const active = b.designs.filter((d) => d.ready <= world.turn && d.kind === 'humano');
    if (active.length) {
      const worst = active.reduce((a, d) => (d.transmission > a.transmission ? d : a));
      const p = 0.0007 * active.length * (worst.transmission / 3) * (1.3 - b.lab / 100);
      if (rng.next() < p) {
        startOutbreak(world, { name: worst.name, kind: worst.kind, transmission: worst.transmission, lethality: worst.lethality, stealth: worst.stealth, resistance: worst.resistance,
          infected: { [c.id]: 0.004 }, origin: c.id, creator: c.id, attributed: false, vaccineFor: worst.vaccine ? c.id : null });
        if (world.player?.country === c.id) {
          news(world, `☣ ¡Fuga en un laboratorio secreto! El patógeno «${worst.name}» se ha escapado en ${c.name}.`, 'salud', [c.id], 3);
          timeline(world, `Fuga de laboratorio: «${worst.name}»`, 'crisis');
        }
      }
    }
  }
  updateOutbreaks(world, rng);
  world.rng = rng.state;
}

function updateOutbreaks(world: World, rng: ReturnType<typeof rngOf>) {
  const list = world.global.outbreaks;
  for (const o of list) {
    o.months += 1;
    const T = o.transmission, L = o.lethality;
    const next: Record<string, number> = { ...o.infected };
    for (const [id, inf] of Object.entries(o.infected)) {
      if (inf < 0.003) continue;
      const src = world.countries[id];
      // Un país ya vacunado o con tratamientos exporta muchos menos casos
      const contained = src && o.detected && o.months > vaccineMonths(world, src, o) ? 0.15 : 1;
      const trade = o.kind === 'humano' ? 0.03 : 0.07;
      const links = [...neighborsLand(id), ...world.order.filter((x) => x !== id && tradeShare(world, id, x) > trade)];
      for (const j of links) {
        const cj = world.countries[j];
        if (!cj?.alive) continue;
        next[j] = clamp((next[j] ?? 0) + inf * 0.022 * T * resistOf(cj) * (o.detected ? 0.6 : 1) * contained, 0, 0.6);
      }
    }
    let maxInf = 0;
    for (const [id, inf0] of Object.entries(next)) {
      const c = world.countries[id];
      if (!c?.alive) { delete next[id]; continue; }
      const vaccinated = o.detected && o.months > vaccineMonths(world, c, o);
      const growth = vaccinated ? 0.55 : 1 + 0.085 * T * resistOf(c) * (1 - inf0 * 2) * (o.detected ? 0.8 : 1);
      const inf = clamp(inf0 * growth, 0, 0.6);
      next[id] = inf;
      maxInf = Math.max(maxInf, inf);
      if (inf < 0.0005) continue;
      const label = o.detected ? `${KIND_NAMES[o.kind]}: ${o.name}` : 'Brote de origen desconocido';
      if (o.kind === 'humano') {
        const healthF = 1.6 - c.soc.health / 100;
        addShock(c, 'death', label, inf * L * 2.2 * healthF);
        addShock(c, 'growth', label, -inf * (3 + L * 1.5));
        addShock(c, 'protest', label, inf * 18);
        o.deaths += c.soc.pop * 1000 * inf * L * 0.00018 * healthF;
      } else if (o.kind === 'cultivos') {
        addShock(c, 'prod.food', label, -inf * (0.12 + L * 0.06));
        addShock(c, 'growth', label, -inf * L * c.eco.sectors.agriculture * 0.06);
      } else {
        addShock(c, 'prod.food', label, -inf * (0.05 + L * 0.03));
        addShock(c, 'growth', label, -inf * L * c.eco.sectors.agriculture * 0.04);
      }
    }
    o.infected = next;
    // Detección
    if (!o.detected && (o.months >= 1 + o.stealth * 1.2 || maxInf > 0.08)) {
      o.detected = true;
      const where = Object.entries(o.infected).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => world.countries[id]?.name).join(', ');
      const involved = world.player && (o.infected[world.player.country] ?? 0) > 0.001;
      news(world, `🦠 Identificado un nuevo ${KIND_NAMES[o.kind].toLowerCase()}, «${o.name}», en ${where}.`, 'salud', Object.keys(o.infected), involved ? 3 : 2);
    }
    // Mutaciones
    // (En la previsión no hay azar: ni mutaciones ni atribuciones)
    if (!world.forecast && o.detected && rng.next() < 0.025) {
      if (rng.next() < 0.5) o.transmission = Math.min(5, o.transmission + 0.5);
      else o.resistance = Math.min(5, o.resistance + 0.5);
      o.vaccineFor = null;
      news(world, `🧬 Aparece una variante de «${o.name}» más ${o.transmission >= o.resistance ? 'contagiosa' : 'resistente'}.`, 'salud', [], 1);
    }
    // Atribución de los brotes artificiales
    if (!world.forecast && o.creator && !o.attributed && o.detected) {
      const victims = Object.keys(o.infected).filter((id) => id !== o.creator);
      let intel = 0;
      for (const id of victims) intel = Math.max(intel, intelLevel(world.countries[id]));
      const p = o.origin === o.creator ? 0.05 : clamp(0.03 + (5 - o.stealth) * 0.02 + intel / 2500, 0.01, 0.25);
      if (rng.next() < p) attributeOutbreak(world, o);
    }
    if ((maxInf < 0.002 && o.months > 4) || o.months > 72) {
      if (o.detected) news(world, `🦠 Se da por controlado el brote de «${o.name}»${o.kind === 'humano' ? ` (${Math.round(o.deaths).toLocaleString('es-ES')} mil muertos)` : ''}.`, 'salud', [], 1);
      o.months = -1;
    }
  }
  world.global.outbreaks = list.filter((o) => o.months >= 0);
}

function exposeProgram(world: World, c: Country) {
  c.bio.exposed = world.turn;
  c.reputation = clamp(c.reputation - 15, 0, 100);
  for (const id of world.order) {
    const x = world.countries[id];
    if (id === c.id || !x.alive) continue;
    remember(world, x, c.id, 'armas_bio', allied(world, id, c.id) ? 0.4 : 1);
  }
  world.incidents.push({ turn: world.turn, actor: c.id, target: c.ai.rivals[0] ?? c.id, kind: 'armas_bio', magnitude: 2, text: 'Programa de armas biológicas' });
  news(world, `☣ Filtración: ${c.name} mantiene un programa secreto de armas biológicas, en violación de la Convención de 1972.`, 'inteligencia', [c.id], world.player?.country === c.id ? 3 : 2);
  if (world.player?.country === c.id) timeline(world, 'Se descubre tu programa de armas biológicas', 'crisis');
}

/** El mundo descubre quién creó un brote. */
export function attributeOutbreak(world: World, o: Outbreak) {
  const c = o.creator ? world.countries[o.creator] : null;
  o.attributed = true;
  if (!c) return;
  const accident = o.origin === c.id;
  c.reputation = clamp(c.reputation - (accident ? 12 : 40), 0, 100);
  if (c.bio.exposed < 0) c.bio.exposed = world.turn;
  const rng = rngOf(world);
  for (const id of world.order) {
    const x = world.countries[id];
    if (id === c.id || !x.alive) continue;
    const victim = (o.infected[id] ?? 0) > 0.001;
    remember(world, x, c.id, accident ? 'armas_bio' : 'bioataque', victim ? 1 : allied(world, id, c.id) ? 0.3 : 0.6);
    if (!accident && victim) {
      x.pol.flags[`cb_${c.id}`] = world.turn;
      if (world.player?.country !== id && !x.isBlock) setSanction(world, x, c, 3);
    } else if (!accident && !x.isBlock && world.player?.country !== id && !allied(world, id, c.id) && relOp(world, id, c.id) < 30 && rng.next() < 0.5) {
      setSanction(world, x, c, 2);
    }
  }
  world.rng = rng.state;
  if (!accident) {
    world.global.tension = clamp(world.global.tension + 10, 0, 100);
    const victim = Object.entries(o.infected).filter(([id]) => id !== c.id).sort((a, b) => b[1] - a[1])[0]?.[0];
    if (victim) world.incidents.push({ turn: world.turn, actor: c.id, target: victim, kind: 'biologico', magnitude: 3, text: `Ataque biológico (${o.name})` });
  }
  news(world, accident
    ? `☣ Las investigaciones sitúan el origen de «${o.name}» en un laboratorio militar de ${c.name}.`
    : `☣ ESCÁNDALO MUNDIAL: ${c.name} liberó deliberadamente «${o.name}». Lluvia de sanciones y condenas.`, 'inteligencia', [c.id], 3);
  if (world.player?.country === c.id) timeline(world, accident ? `Se te atribuye la fuga de «${o.name}»` : `El mundo descubre que liberaste «${o.name}»`, 'crisis');
}

function findDesign(c: Country, id: unknown): PathogenDesign | undefined {
  return c.bio.designs.find((d) => d.id === String(id));
}

export function registerBioHandlers() {
  registerHandler('bio_program', {
    validate: (world, def, ctx) => {
      const on = Number(def.params?.on ?? 1) > 0;
      if (on && ctx.actor.bio.program > 0) return 'El programa ya existe';
      if (!on && ctx.actor.bio.program <= 0) return 'No hay programa';
      return null;
    },
    preview: (world, def, ctx, p) => {
      if (Number(def.params?.on ?? 1) > 0) p.extra.push(`Coste continuo: ${(ctx.actor.eco.gdp * 0.0008).toFixed(2)} mil millones $/año. Riesgo mensual de filtración según la inteligencia de tus rivales frente a tu contrainteligencia (${counterLevel(ctx.actor).toFixed(0)}).`);
      else p.extra.push('Se destruyen las cepas y se desmantelan los laboratorios. Lo descubierto, descubierto queda.');
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor;
      if (Number(def.params?.on ?? 1) > 0) {
        c.bio.program = 8;
        c.bio.lab = Math.max(c.bio.lab, 30);
        return { ok: true, passed: true, text: 'Programa secreto en marcha en laboratorios militares.' };
      }
      c.bio.program = 0;
      c.bio.designs = [];
      if (c.bio.exposed >= 0) c.reputation = clamp(c.reputation + 5, 0, 100);
      return { ok: true, passed: true, text: 'Programa desmantelado.' };
    },
  });

  registerHandler('bio_design', {
    validate: (world, def, ctx) => {
      const c = ctx.actor, q = ctx.params ?? {};
      if (c.bio.program <= 0) return 'Necesitas un programa de armas biológicas';
      const t = ['transmission', 'lethality', 'stealth', 'resistance'].map((k) => Number(q[k] ?? 1));
      if (t.some((x) => x < 1 || x > 5)) return 'Rasgos entre 1 y 5';
      if (t.reduce((a, x) => a + x, 0) > designCapacity(c)) return `Tu programa solo admite ${designCapacity(c)} puntos de rasgo`;
      if (c.bio.designs.filter((d) => d.used === 0).length >= 4) return 'Máximo 4 cepas almacenadas';
      return null;
    },
    preview: (world, def, ctx, p) => {
      const q = ctx.params ?? {};
      const d = designCost(ctx.actor, { transmission: Number(q.transmission ?? 1), lethality: Number(q.lethality ?? 1), stealth: Number(q.stealth ?? 1), resistance: Number(q.resistance ?? 1), vaccine: !!Number(q.vaccine ?? 0) });
      p.extra.push(`Desarrollo: ${d.months} meses · ${d.cost.toFixed(1)} mil millones $ · ${d.pts}/${designCapacity(ctx.actor)} puntos.`);
      p.money = d.cost;
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor, q = ctx.params ?? {};
      const kind = (['humano', 'cultivos', 'ganado'].includes(String(q.kind)) ? String(q.kind) : 'humano') as PathogenDesign['kind'];
      const tr = { transmission: Number(q.transmission ?? 1), lethality: Number(q.lethality ?? 1), stealth: Number(q.stealth ?? 1), resistance: Number(q.resistance ?? 1), vaccine: !!Number(q.vaccine ?? 0) };
      const d = designCost(c, tr);
      const name = String(q.name ?? '').trim().slice(0, 40) || suggestPathogenName(world, kind);
      c.bio.designs.push({ id: uid(world, 'pg'), name, kind, ...tr, ready: world.turn + d.months, cost: d.cost, used: 0 });
      return { ok: true, passed: true, text: `Cepa «${name}» en desarrollo (${d.months} meses).` };
    },
  });

  registerHandler('bio_release', {
    validate: (world, def, ctx) => {
      const d = findDesign(ctx.actor, ctx.params?.design);
      if (!d) return 'Elige una cepa';
      if (d.ready > world.turn) return `La cepa estará lista en ${d.ready - world.turn} meses`;
      if (!ctx.target) return 'Elige un país objetivo';
      return null;
    },
    preview: (world, def, ctx, p) => {
      const d = findDesign(ctx.actor, ctx.params?.design);
      if (!d) return;
      const pAttr = clamp(0.03 + (5 - d.stealth) * 0.02, 0.01, 0.25);
      p.extra.push(`${KIND_NAMES[d.kind]} «${d.name}»: contagio ${d.transmission}, letalidad ${d.lethality}, sigilo ${d.stealth}, resistencia ${d.resistance}.`);
      p.extra.push(`Pasará ~${(1 + d.stealth * 1.2).toFixed(0)} meses sin detectar. Después, cada mes ≈${(pAttr * 100).toFixed(0)} % de que se descubra tu autoría.`);
      p.extra.push(d.vaccine ? 'Tu población estará protegida por la vacuna propia (salvo mutaciones).' : '⚠ Sin vacuna propia: el brote puede llegar a tu país por fronteras y comercio.');
      p.risks.push('Si se descubre: sanciones masivas, casus belli para las víctimas y repudio mundial durante décadas.');
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor, t = ctx.target!;
      const d = findDesign(c, ctx.params?.design)!;
      d.used += 1;
      startOutbreak(world, { name: d.name, kind: d.kind, transmission: d.transmission, lethality: d.lethality, stealth: d.stealth, resistance: d.resistance,
        infected: { [t.id]: 0.004 + d.transmission * 0.002 }, origin: t.id, creator: c.id, attributed: false, vaccineFor: d.vaccine ? c.id : null });
      timeline(world, `Liberas «${d.name}» en ${t.name}`, 'crisis');
      return { ok: true, passed: true, text: `«${d.name}» liberado en ${t.name}. Nadie lo sabe… por ahora.` };
    },
  });

  // IA: programas en regímenes agresivos y, en guerras perdidas, uso desesperado
  registerAiGenerator((world, c, rng, out) => {
    if (c.isBlock || world.player?.country === c.id) return;
    const p = c.ai;
    if (c.bio.program <= 0) {
      if (p.aggression > 0.7 && p.riskAversion < 0.45 && c.tech.level > 45 && c.ai.rivals.length && rng.next() < 0.01) {
        const f: Factor[] = [{ label: 'agresividad', value: p.aggression }, { label: 'rivales', value: 0.3 }, { label: 'aversión al riesgo', value: -p.riskAversion }];
        out.push({ def: ACTION_BY_ID.programa_biologico, ctx: { actor: c, silent: true }, utility: 0.8 + f.reduce((a, x) => a + x.value, 0) * 0.2, factors: f, text: 'un programa secreto de armas biológicas' });
      }
      return;
    }
    if (c.bio.designs.length === 0 && c.bio.program > 20 && rng.next() < 0.05) {
      const cap = designCapacity(c);
      const t = Math.min(5, Math.floor(cap / 4) + 1), l = Math.min(5, Math.floor(cap / 4)), s = Math.min(5, cap - t - l - 1);
      out.push({ def: ACTION_BY_ID.disenar_patogeno, ctx: { actor: c, silent: true, params: { kind: 'humano', transmission: t, lethality: Math.max(1, l), stealth: Math.max(1, s), resistance: 1, vaccine: 1, name: '' } },
        utility: 0.9, factors: [{ label: 'capacidad del programa', value: c.bio.program / 100 }], text: 'desarrollar una cepa' });
    }
    const ready = c.bio.designs.find((d) => d.ready <= world.turn && d.used === 0);
    if (!ready || !atWar(world, c.id) || p.aggression < 0.75 || p.riskAversion > 0.4) return;
    const ws = warScoreFor(world, c.id);
    if (ws > -40) return;
    for (const w of world.wars) {
      const enemy = w.attackers.includes(c.id) ? w.defenders[0] : w.defenders.includes(c.id) ? w.attackers[0] : null;
      if (!enemy || !world.countries[enemy]?.alive) continue;
      const f: Factor[] = [{ label: 'derrota inminente', value: -ws / 60 }, { label: 'agresividad', value: p.aggression }, { label: 'miedo a ser descubierto', value: -0.6 }];
      out.push({ def: ACTION_BY_ID.liberar_patogeno, ctx: { actor: c, target: world.countries[enemy], silent: true, params: { design: ready.id } }, utility: f.reduce((a, x) => a + x.value, 0), factors: f, text: `liberar un patógeno en ${world.countries[enemy].name}` });
      break;
    }
  });
}
