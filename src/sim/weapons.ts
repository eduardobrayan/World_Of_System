/**
 * Armamento propio: diseño nacional o compra a un proveedor extranjero.
 * Cada programa mejora un tipo de unidad (bonificación de poder) y cambia su coste unitario.
 * Las compras crean dependencia: si el proveedor te sanciona, faltan repuestos y la mejora se reduce a la mitad.
 */
import type { Country, Dict, UnitType, World } from './types';
import { UNIT_BY_ID } from './data';
import { ACTION_BY_ID, registerHandler } from './actions';
import { registerAiGenerator, type Factor } from './ai';
import { remember } from './diplomacy';
import { allied, relOp } from './vars';
import { computePower, designBonus } from './military';
export { designBonus, designCostMul } from './military';
import { clamp, news, timeline, uid } from './util';
import weaponsJson from '../data/weapons.json';

export interface WeaponBase { id: string; name: string; unit: UnitType; icon: string; cost: number; months: number; bonus: number; minTech: number; desc: string }
export const WEAPONS: WeaponBase[] = weaponsJson as WeaponBase[];
export const WEAPON_BY_ID: Dict<WeaponBase> = Object.fromEntries(WEAPONS.map((w) => [w.id, w]));

export const WTRAITS = { power: 'Potencia', armor: 'Protección', economy: 'Economía' } as const;
export const WTRAIT_DESC = { power: 'Potencia de fuego, alcance y precisión.', armor: 'Blindaje, supervivencia y fiabilidad.', economy: 'Abarata cada unidad fabricada.' } as const;

export function traitCap(c: Country): number {
  return 9 + Math.floor(c.mil.tech / 20);
}

function scale(c: Country): number {
  return Math.sqrt(clamp(c.base.milCostScale ?? 1, 0.15, 4));
}

/** Calcula los parámetros de un programa nacional. */
export function designSpec(c: Country, base: WeaponBase, power: number, armor: number, economy: number) {
  const techF = clamp(c.mil.tech / base.minTech, 0.5, 1.3);
  const quality = base.bonus * (0.4 + power * 0.16 + armor * 0.1) * techF;
  const costMul = clamp(1 + (power + armor - 6) * 0.05 - (economy - 3) * 0.08, 0.6, 1.6);
  const cost = base.cost * scale(c) * (0.6 + (power + armor + economy) / 12);
  const months = Math.round(base.months * (0.6 + (power + armor) / 20) * (c.mil.tech < base.minTech ? 1.25 : 1));
  return { quality, costMul, cost, months, techF };
}

/** Parámetros de una compra a un proveedor extranjero. */
export function purchaseSpec(c: Country, supplier: Country, base: WeaponBase) {
  const quality = base.bonus * clamp(supplier.mil.tech / 70, 0.5, 1.3) * 0.85;
  const cost = base.cost * 0.5 * scale(c);
  return { quality, costMul: 1.1, cost, months: Math.max(6, Math.round(base.months * 0.3)) };
}

export function supplierProblem(world: World, c: Country, s: Country, base: WeaponBase): string | null {
  if (!s.alive || s.id === c.id) return 'Proveedor no válido';
  if (s.mil.tech < base.minTech) return `${s.name} no fabrica este sistema (tecnología militar ${s.mil.tech.toFixed(0)} < ${base.minTech})`;
  if (world.sanctions.some((x) => (x.by === s.id && x.target === c.id) || (x.by === c.id && x.target === s.id))) return 'Hay sanciones entre ambos países';
  if (!allied(world, c.id, s.id) && relOp(world, s.id, c.id) < 15) return `${s.name} no te venderá armas (relación ${relOp(world, s.id, c.id).toFixed(0)})`;
  return null;
}

/** Avance mensual de los programas y efecto de los embargos. */
export function updateWeapons(world: World, c: Country) {
  const list = c.mil.designs;
  if (!list?.length) return;
  let changed = false;
  for (const d of list) {
    if (!d.done) {
      d.remaining -= 1;
      c.eco.extraSpending += (d.cost / d.total) * 12;
      if (d.remaining <= 0) {
        d.done = true;
        changed = true;
        // El nuevo sistema sustituye a los anteriores del mismo tipo
        for (const o of list) if (o !== d && o.done && o.unit === d.unit && o.quality <= d.quality) o.quality = 0;
        if (world.player?.country === c.id) {
          news(world, `🛠 Entra en servicio el «${d.name}» (${UNIT_BY_ID[d.unit].name}): +${(d.quality * 100).toFixed(0)} % de poder de ese tipo.`, 'militar', [c.id], 2);
          timeline(world, `Nuevo armamento: ${d.name}`, 'militar');
        }
      }
    }
    if (d.done && d.supplier) {
      const emb = world.sanctions.some((x) => x.by === d.supplier && x.target === c.id && x.level >= 2) || !world.countries[d.supplier]?.alive;
      if (emb !== !!d.embargo) {
        d.embargo = emb;
        changed = true;
        if (emb && world.player?.country === c.id) news(world, `⚠ ${world.countries[d.supplier]?.name ?? 'El proveedor'} corta los repuestos del «${d.name}»: su eficacia cae a la mitad.`, 'militar', [c.id], 3);
      }
    }
  }
  c.mil.designs = list.filter((d) => !d.done || d.quality > 0);
  if (changed) computePower(c);
}

export function registerWeaponHandlers() {
  registerHandler('weapon_design', {
    validate: (world, def, ctx) => {
      const c = ctx.actor, q = ctx.params ?? {};
      const base = WEAPON_BY_ID[String(q.base)];
      if (!base) return 'Elige un sistema de armas';
      const t = [Number(q.power ?? 3), Number(q.armor ?? 3), Number(q.economy ?? 3)];
      if (t.some((x) => x < 1 || x > 5)) return 'Rasgos entre 1 y 5';
      if (t.reduce((a, x) => a + x, 0) > traitCap(c)) return `Tu industria solo admite ${traitCap(c)} puntos de diseño`;
      if (c.mil.tech < base.minTech - 15) return `Tecnología militar insuficiente (${c.mil.tech.toFixed(0)} / ${base.minTech - 15}): cómpralo en el extranjero`;
      if (c.mil.designs.some((d) => !d.done && d.unit === base.unit)) return 'Ya hay un programa en curso para ese tipo de unidad';
      return null;
    },
    preview: (world, def, ctx, p) => {
      const q = ctx.params ?? {};
      const base = WEAPON_BY_ID[String(q.base)];
      if (!base) return;
      const s = designSpec(ctx.actor, base, Number(q.power ?? 3), Number(q.armor ?? 3), Number(q.economy ?? 3));
      p.extra.push(`${base.icon} ${base.name}: +${(s.quality * 100).toFixed(1)} % de poder de ${UNIT_BY_ID[base.unit].name.toLowerCase()} · coste por unidad ×${s.costMul.toFixed(2)}.`);
      p.extra.push(`Programa: ${s.cost.toFixed(1)} mil millones $ repartidos en ${s.months} meses.${s.techF < 1 ? ' Tu tecnología militar está por debajo de lo ideal: diseño menos eficaz y más lento.' : ''}`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor, q = ctx.params ?? {};
      const base = WEAPON_BY_ID[String(q.base)];
      const pw = Number(q.power ?? 3), ar = Number(q.armor ?? 3), ec = Number(q.economy ?? 3);
      const s = designSpec(c, base, pw, ar, ec);
      const name = String(q.name ?? '').trim().slice(0, 40) || `${base.name} ${c.short}-${2026 + Math.floor(world.turn / 12)}`;
      c.mil.designs.push({ id: uid(world, 'wd'), name, base: base.id, unit: base.unit, power: pw, armor: ar, economy: ec, quality: s.quality, costMul: s.costMul,
        remaining: s.months, total: s.months, cost: s.cost, done: false, started: world.turn });
      if (!ctx.silent || world.player?.country === c.id) news(world, `🛠 ${c.name} lanza el programa «${name}».`, 'militar', [c.id], 1);
      return { ok: true, passed: true, text: `Programa «${name}» en marcha (${s.months} meses).` };
    },
  });

  registerHandler('weapon_buy', {
    validate: (world, def, ctx) => {
      const base = WEAPON_BY_ID[String(ctx.params?.base)];
      if (!base) return 'Elige un sistema de armas';
      if (!ctx.target) return 'Elige un proveedor';
      if (ctx.actor.mil.designs.some((d) => !d.done && d.unit === base.unit)) return 'Ya hay un programa en curso para ese tipo de unidad';
      return supplierProblem(world, ctx.actor, ctx.target, base);
    },
    preview: (world, def, ctx, p) => {
      const base = WEAPON_BY_ID[String(ctx.params?.base)];
      if (!base || !ctx.target) return;
      const s = purchaseSpec(ctx.actor, ctx.target, base);
      p.extra.push(`${base.icon} ${base.name} de ${ctx.target.name}: +${(s.quality * 100).toFixed(1)} % de poder · ${s.cost.toFixed(1)} mil millones $ · entrega en ${s.months} meses.`);
      p.risks.push(`Dependencia: si ${ctx.target.name} te sanciona, faltarán repuestos.`);
    },
    apply: (world, def, ctx) => {
      const c = ctx.actor, t = ctx.target!;
      const base = WEAPON_BY_ID[String(ctx.params?.base)];
      const s = purchaseSpec(c, t, base);
      c.mil.designs.push({ id: uid(world, 'wd'), name: `${base.name} (${t.short})`, base: base.id, unit: base.unit, power: 3, armor: 3, economy: 2, quality: s.quality, costMul: s.costMul,
        remaining: s.months, total: s.months, cost: s.cost, done: false, supplier: t.id, started: world.turn });
      t.eco.debt = Math.max(0, t.eco.debt - s.cost * 0.6);
      remember(world, t, c.id, 'acuerdo', 0.5);
      remember(world, c, t.id, 'acuerdo', 0.5);
      if (world.player?.country === t.id) news(world, `💰 ${c.name} compra ${base.name.toLowerCase()} a tu industria de defensa (+${(s.cost * 0.6).toFixed(1)} mil millones $).`, 'militar', [c.id, t.id], 2);
      else news(world, `${c.name} compra ${base.name.toLowerCase()} a ${t.name}.`, 'militar', [c.id, t.id], 0);
      return { ok: true, passed: true, text: `Compra cerrada: entrega en ${s.months} meses.` };
    },
  });

  // IA: las potencias desarrollan armas propias; los demás las compran a sus socios
  registerAiGenerator((world, c, rng, out) => {
    if (c.isBlock || world.player?.country === c.id || rng.next() > 0.015) return;
    if (c.mil.designs.some((d) => !d.done)) return;
    const threat = c.ai.rivals.length > 0 ? 0.3 : 0;
    const options = WEAPONS.filter((w) => c.mil.baseUnits[w.unit] > 0 && designBonus(c, w.unit) === 0);
    if (!options.length) return;
    const base = options[rng.int(0, options.length - 1)];
    if (c.mil.tech >= base.minTech && c.eco.gdp > 800) {
      const f: Factor[] = [{ label: 'amenazas', value: threat }, { label: 'industria propia', value: 0.4 }, { label: 'agresividad', value: c.ai.aggression * 0.4 }];
      out.push({ def: ACTION_BY_ID.disenar_arma, ctx: { actor: c, silent: true, params: { base: base.id, power: 3, armor: 3, economy: 3, name: '' } }, utility: 0.5 + f.reduce((a, x) => a + x.value, 0), factors: f, text: `desarrollar ${base.name.toLowerCase()} propio` });
      return;
    }
    const sellers = world.order.map((id) => world.countries[id]).filter((s) => !s.isBlock && supplierProblem(world, c, s, base) === null)
      .sort((a, b) => relOp(world, c.id, b.id) - relOp(world, c.id, a.id));
    const s = sellers[0];
    if (!s) return;
    const spec = purchaseSpec(c, s, base);
    if (spec.cost > c.eco.gdp * c.eco.budget.defense / 100 * 0.4) return;
    const f: Factor[] = [{ label: 'amenazas', value: threat }, { label: 'relación con el proveedor', value: relOp(world, c.id, s.id) / 100 }, { label: 'modernización', value: 0.4 }];
    out.push({ def: ACTION_BY_ID.comprar_armamento, ctx: { actor: c, target: s, silent: true, params: { base: base.id } }, utility: 0.45 + f.reduce((a, x) => a + x.value, 0), factors: f, text: `comprar ${base.name.toLowerCase()} a ${s.name}` });
  });
}
