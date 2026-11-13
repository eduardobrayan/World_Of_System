/** Mecánicas especiales de seguridad interior: cooperación antidroga y operaciones contra el narco. */
import { registerHandler, ACTION_BY_ID } from './actions';
import { registerAiGenerator, type Factor } from './ai';
import { addModifier } from './effects';
import { remember } from './diplomacy';
import { relOp, allied } from './vars';
import { news } from './util';

export function registerSecurityHandlers() {
  registerHandler('narco_coop', {
    validate: (world, def, ctx) => {
      const t = ctx.target;
      if (!t) return null;
      if (t.mods.some((m) => m.id === `coop_antidroga_${ctx.actor.id}`)) return 'Ya existe un acuerdo antidroga vigente';
      const active = (x: typeof t) => x.mods.filter((m) => m.id.startsWith('coop_antidroga_')).length;
      if (active(ctx.actor) >= 3) return 'Máximo 3 acuerdos antidroga a la vez';
      if (active(t) >= 3) return `${t.name} ya tiene 3 acuerdos antidroga`;
      if (relOp(world, t.id, ctx.actor.id) < -10 && !allied(world, t.id, ctx.actor.id)) return `${t.name} desconfía demasiado (relación ${relOp(world, t.id, ctx.actor.id).toFixed(0)})`;
      return null;
    },
    preview: (world, def, ctx, p) => {
      const t = ctx.target;
      if (!t) return;
      p.extra.push(`Ambos países: tránsito −5, poder de los cárteles −3 y mejor formación policial durante 24 meses (máx. 3 acuerdos). Más eficaz cuanto más narcotráfico haya (${t.short}: cárteles ${t.narco.cartels.toFixed(0)}, tránsito ${t.narco.transit.toFixed(0)}).`);
    },
    apply: (world, def, ctx) => {
      const a = ctx.actor, t = ctx.target!;
      for (const [x, y] of [[a, t], [t, a]]) {
        addModifier(world, x, { id: `coop_antidroga_${y.id}`, name: `Cooperación antidroga con ${y.short}`, duration: 24, mods: { 'narco.transit': -5, 'narco.cartels': -3, 'police.training': 2 } }, 'antidroga');
        remember(world, x, y.id, 'antidroga');
      }
      news(world, `🤝 ${a.name} y ${t.name} firman un acuerdo de cooperación antidroga.`, 'diplomacia', [a.id, t.id], 1);
      return { ok: true, passed: true, text: `Acuerdo antidroga con ${t.name}.` };
    },
  });

  // IA: cooperación antidroga entre países afectados que se llevan bien
  registerAiGenerator((world, c, rng, out) => {
    if (c.isBlock || world.player?.country === c.id || rng.next() > 0.04) return;
    if (c.narco.cartels + c.narco.transit < 60 && c.narco.consumption < 50) return;
    const partners = world.order.map((id) => world.countries[id])
      .filter((t) => t.alive && t.id !== c.id && !t.isBlock && t.narco.cartels + t.narco.transit > 50 && relOp(world, c.id, t.id) > 10 && !t.mods.some((m) => m.id === `coop_antidroga_${c.id}`));
    const t = partners.sort((x, y) => (y.narco.cartels + y.narco.transit) - (x.narco.cartels + x.narco.transit))[0];
    if (!t) return;
    const f: Factor[] = [{ label: 'narcotráfico propio', value: (c.narco.cartels + c.narco.consumption) / 150 }, { label: 'relación', value: relOp(world, c.id, t.id) / 100 }, { label: 'base', value: 0.3 }];
    out.push({ def: ACTION_BY_ID.cooperacion_antidroga, ctx: { actor: c, target: t, silent: true }, utility: f.reduce((a, x) => a + x.value, 0), factors: f, text: `firmar cooperación antidroga con ${t.name}` });
  });
}
