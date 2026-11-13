/** Pestaña de Armamento: diseño o compra de sistemas de armas y programa de armas biológicas. */
import type { App } from '../app';
import type { Country, Outbreak } from '../../sim/types';
import { h, mount } from '../dom';
import { section, plainStat, intStepper, bar } from '../components';
import { ACTION_BY_ID, previewAction } from '../../sim/actions';
import { openAction } from '../actionui';
import { UNIT_BY_ID } from '../../sim/data';
import { WEAPONS, WEAPON_BY_ID, WTRAITS, WTRAIT_DESC, designSpec, purchaseSpec, supplierProblem, traitCap, designBonus } from '../../sim/weapons';
import { KIND_NAMES, TRAIT_NAMES, designCapacity, designCost, suggestPathogenName } from '../../sim/bio';
import { flagEl } from '../flags';

interface WeaponDraft { base: string; power: number; armor: number; economy: number; name: string; supplier: string }
interface BioDraft { kind: Outbreak['kind']; transmission: number; lethality: number; stealth: number; resistance: number; vaccine: boolean; name: string; target: string; design: string }

function weaponDraft(app: App): WeaponDraft {
  return (app.ui.weapon as WeaponDraft) ?? (app.ui.weapon = { base: WEAPONS[0].id, power: 3, armor: 3, economy: 3, name: '', supplier: '' } as WeaponDraft) as WeaponDraft;
}
function bioDraft(app: App): BioDraft {
  return (app.ui.bio as BioDraft) ?? (app.ui.bio = { kind: 'humano', transmission: 2, lethality: 2, stealth: 2, resistance: 1, vaccine: true, name: '', target: '', design: '' } as BioDraft) as BioDraft;
}

export function renderArmament(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Sin país.')];
  return [h('h2', null, '🛠 Armamento'), weaponsSection(app, c), bioSection(app, c)];
}

function weaponsSection(app: App, c: Country): HTMLElement {
  const w = app.world;
  const d = weaponDraft(app);
  const list = c.mil.designs;
  const active = list.filter((x) => x.done);
  const running = list.filter((x) => !x.done);
  const box = h('div');
  const paint = () => {
    const base = WEAPON_BY_ID[d.base];
    const spec = designSpec(c, base, d.power, d.armor, d.economy);
    const used = d.power + d.armor + d.economy, cap = traitCap(c);
    const designAct = ACTION_BY_ID.disenar_arma, buyAct = ACTION_BY_ID.comprar_armamento;
    const params = { base: d.base, power: d.power, armor: d.armor, economy: d.economy, name: d.name };
    const pvDesign = previewAction(w, designAct, { actor: c, params });
    const sellers = w.order.map((id) => w.countries[id]).filter((s) => !s.isBlock && s.alive && s.id !== c.id && s.mil.tech >= base.minTech)
      .sort((a, b) => b.mil.tech - a.mil.tech);
    if (!d.supplier || !sellers.some((s) => s.id === d.supplier)) d.supplier = sellers.find((s) => !supplierProblem(w, c, s, base))?.id ?? sellers[0]?.id ?? '';
    const sup = w.countries[d.supplier];
    const pvBuy = sup ? previewAction(w, buyAct, { actor: c, target: sup, params: { base: d.base } }) : null;
    const nameInp = h('input', { type: 'text', value: d.name, placeholder: `${base.name} ${c.short}-${2026 + Math.floor(w.turn / 12)}`, 'aria-label': 'Nombre del sistema', maxlength: '40' });
    nameInp.addEventListener('input', () => { d.name = nameInp.value; });
    mount(box,
      h('div', { class: 'field' }, h('span', { class: 'small ink2' }, 'Sistema'),
        h('select', { 'aria-label': 'Sistema de armas', onchange: (e: Event) => { d.base = (e.target as HTMLSelectElement).value; paint(); } },
          WEAPONS.map((x) => h('option', { value: x.id, selected: x.id === d.base }, `${x.icon} ${x.name} (${UNIT_BY_ID[x.unit].name})`)))),
      h('div', { class: 'small muted' }, `${base.desc} Tecnología militar ideal: ${base.minTech} (tienes ${c.mil.tech.toFixed(0)}). Mejora actual de ${UNIT_BY_ID[base.unit].name.toLowerCase()}: +${(designBonus(c, base.unit) * 100).toFixed(0)} %.`),
      h('h4', null, 'Desarrollo nacional'),
      h('div', { class: 'field' }, h('span', { class: 'small ink2' }, 'Nombre'), nameInp),
      ...(['power', 'armor', 'economy'] as const).map((k) => intStepper(WTRAITS[k], WTRAIT_DESC[k], d[k], 1, 5, (v) => { d[k] = v; paint(); }, (v) => `${'●'.repeat(v)}${'○'.repeat(5 - v)}`)),
      h('div', { class: `small ${used > cap ? 'bad' : 'ink2'}` }, `Puntos de diseño: ${used} / ${cap} (según tu tecnología militar)`),
      h('div', { class: 'small' }, `Resultado: +${(spec.quality * 100).toFixed(1)} % de poder · coste por unidad ×${spec.costMul.toFixed(2)} · ${spec.cost.toFixed(1)} mil millones $ en ${spec.months} meses`),
      h('button', { class: 'btn primary sm', style: 'margin-top:6px', disabled: !pvDesign.ok, title: pvDesign.unmet.join(' · '), onclick: () => openAction(app, designAct, { params }) }, `🛠 Lanzar programa (⚡${pvDesign.ap})`),
      pvDesign.ok ? null : h('div', { class: 'small bad' }, pvDesign.unmet.join(' · ')),
      h('h4', null, 'Compra a otro país'),
      sellers.length ? h('div', null,
        h('select', { 'aria-label': 'Proveedor', onchange: (e: Event) => { d.supplier = (e.target as HTMLSelectElement).value; paint(); } },
          sellers.map((s) => { const why = supplierProblem(w, c, s, base); return h('option', { value: s.id, selected: s.id === d.supplier }, `${s.name} · tec. ${s.mil.tech.toFixed(0)}${why ? ' (no vende)' : ''}`); })),
        sup ? h('div', { class: 'small', style: 'margin-top:4px' }, (() => { const ps = purchaseSpec(c, sup, base); return `+${(ps.quality * 100).toFixed(1)} % de poder · ${ps.cost.toFixed(1)} mil millones $ · entrega en ${ps.months} meses · depende de ${sup.short} para los repuestos`; })()) : null,
        pvBuy ? h('button', { class: 'btn sm', style: 'margin-top:6px', disabled: !pvBuy.ok, title: pvBuy.unmet.join(' · '), onclick: () => openAction(app, buyAct, { target: sup, params: { base: d.base } }) }, `💰 Comprar (⚡${pvBuy.ap})`) : null,
        pvBuy && !pvBuy.ok ? h('div', { class: 'small bad' }, pvBuy.unmet.join(' · ')) : null)
        : h('div', { class: 'small muted' }, 'Ningún país fabrica este sistema.'));
  };
  paint();
  return section('Sistemas de armas',
    h('div', { class: 'small ink2' }, 'Diseña armas propias (lento y caro, pero sin dependencias) o cómpralas a otro país. Cada sistema mejora un tipo de unidad y cambia su coste.'),
    active.length ? h('div', { class: 'list', style: 'margin-top:6px' }, active.map((x) => h('div', { class: 'item small row between' },
      h('span', null, `${WEAPON_BY_ID[x.base]?.icon ?? ''} `, h('b', null, x.name), ` · ${UNIT_BY_ID[x.unit].name}`, x.supplier ? h('span', { class: 'pill' }, `de ${app.world.countries[x.supplier]?.short ?? '?'}`) : h('span', { class: 'pill' }, 'nacional'), x.embargo ? h('span', { class: 'pill bad' }, 'sin repuestos') : null),
      h('span', null, `+${(x.quality * (x.embargo ? 50 : 100)).toFixed(0)} %`)))) : h('div', { class: 'small muted', style: 'margin-top:6px' }, 'Tus fuerzas usan material estándar.'),
    running.length ? h('div', { class: 'list', style: 'margin-top:6px' }, running.map((x) => h('div', { class: 'item small' },
      h('div', { class: 'row between' }, h('b', null, `⏳ ${x.name}`), h('span', null, `${x.remaining} meses`)), bar(x.total - x.remaining, x.total)))) : null,
    h('div', { class: 'designer' }, box));
}

function bioSection(app: App, c: Country): HTMLElement {
  const w = app.world, b = c.bio;
  const d = bioDraft(app);
  const box = h('div');
  const status = h('div', { class: 'grid2' },
    plainStat('Defensa biológica', b.defense.toFixed(0), 'Vigilancia genómica, reservas de antivirales y laboratorios: frena brotes naturales y ataques y acelera las vacunas.'),
    plainStat('Programa secreto', b.program > 0 ? `${b.program.toFixed(0)} / 100` : 'No existe', 'Capacidad de tus laboratorios militares para diseñar patógenos. Viola la Convención sobre Armas Biológicas.'),
    plainStat('Bioseguridad de los laboratorios', b.lab.toFixed(0), 'Reduce el riesgo de fugas.'),
    plainStat('Estado', b.exposed >= 0 ? '⚠ Descubierto' : b.program > 0 ? 'Secreto' : '—', b.exposed >= 0 ? `El mundo sabe de tu programa desde ${w.turn - b.exposed} meses.` : 'Nadie conoce tu programa.'));
  const btn = (id: string, ctx: Parameters<typeof openAction>[2] = {}, cls = 'btn sm') => {
    const def = ACTION_BY_ID[id];
    const pv = previewAction(w, def, { actor: c, ...ctx });
    return h('button', { class: cls, disabled: !pv.ok, title: pv.ok ? def.desc : pv.unmet.join(' · '), onclick: () => openAction(app, def, ctx) }, `${def.name} (⚡${pv.ap})`);
  };
  const paint = () => {
    if (b.program <= 0) {
      mount(box, h('p', { class: 'small ink2' }, 'Sin programa no puedes diseñar patógenos. Ponerlo en marcha cuesta capital político, dinero cada mes y el riesgo permanente de una filtración.'),
        btn('programa_biologico', {}, 'btn sm danger'));
      return;
    }
    const cap = designCapacity(c);
    const used = d.transmission + d.lethality + d.stealth + d.resistance;
    const cost = designCost(c, d);
    const params = { kind: d.kind, transmission: d.transmission, lethality: d.lethality, stealth: d.stealth, resistance: d.resistance, vaccine: d.vaccine ? 1 : 0, name: d.name };
    const nameInp = h('input', { type: 'text', value: d.name, placeholder: suggestPathogenName(w, d.kind), maxlength: '40', 'aria-label': 'Nombre de la cepa' });
    nameInp.addEventListener('input', () => { d.name = nameInp.value; });
    const vac = h('input', { type: 'checkbox', checked: d.vaccine, onchange: () => { d.vaccine = (vac as HTMLInputElement).checked; paint(); } }) as HTMLInputElement;
    const ready = b.designs.filter((x) => x.ready <= w.turn);
    if (!d.design || !b.designs.some((x) => x.id === d.design)) d.design = ready[0]?.id ?? '';
    const targets = w.order.map((id) => w.countries[id]).filter((x) => x.alive && x.id !== c.id).sort((a, b2) => a.name.localeCompare(b2.name, 'es'));
    if (!d.target) d.target = c.ai.rivals[0] ?? targets[0]?.id ?? '';
    const tgt = w.countries[d.target];
    mount(box,
      h('h4', null, 'Cepas'),
      b.designs.length ? h('div', { class: 'list' }, b.designs.map((x) => h('div', { class: 'item small' },
        h('div', { class: 'row between' }, h('b', null, `🧫 ${x.name}`), h('span', null, x.ready > w.turn ? `⏳ ${x.ready - w.turn} meses` : x.used ? `usada ×${x.used}` : 'lista')),
        h('div', { class: 'muted' }, `${KIND_NAMES[x.kind]} · contagio ${x.transmission} · letalidad ${x.lethality} · sigilo ${x.stealth} · resistencia ${x.resistance}${x.vaccine ? ' · con vacuna' : ''}`)))) : h('div', { class: 'small muted' }, 'Ninguna cepa todavía.'),
      h('h4', null, 'Diseñar una cepa'),
      h('div', { class: 'seg', style: 'margin:4px 0' }, (['humano', 'cultivos', 'ganado'] as const).map((k) => h('button', { class: d.kind === k ? 'on' : '', onclick: () => { d.kind = k; paint(); } }, { humano: '🧍 Humano', cultivos: '🌾 Cultivos', ganado: '🐄 Ganado' }[k]))),
      h('div', { class: 'small muted' }, d.kind === 'humano' ? 'Enfermedad en personas: muertes, caída de la economía y protestas.' : d.kind === 'cultivos' ? 'Plaga agrícola: hunde las cosechas, encarece los alimentos y provoca hambre.' : 'Epizootia: diezma la cabaña ganadera y la producción de alimentos.'),
      h('div', { class: 'field' }, h('span', { class: 'small ink2' }, 'Nombre'), nameInp),
      ...(['transmission', 'lethality', 'stealth', 'resistance'] as const).map((k) => intStepper(TRAIT_NAMES[k].name, TRAIT_NAMES[k].desc, d[k], 1, 5, (v) => { d[k] = v; paint(); }, (v) => `${'●'.repeat(v)}${'○'.repeat(5 - v)}`)),
      h('label', { class: 'row small', style: 'gap:6px;margin-top:4px' }, vac, 'Desarrollar a la vez una vacuna para tu población (+4 meses, +40 % de coste)'),
      h('div', { class: `small ${used > cap ? 'bad' : 'ink2'}` }, `Puntos de rasgo: ${used} / ${cap} (crecen con la capacidad del programa)`),
      h('div', { class: 'small' }, `Desarrollo: ${cost.months} meses · ${cost.cost.toFixed(1)} mil millones $`),
      h('div', { class: 'row wrap', style: 'margin-top:6px' }, btn('disenar_patogeno', { params }, 'btn sm primary'), btn('cerrar_programa_biologico')),
      h('h4', null, 'Liberar una cepa'),
      ready.length ? h('div', null,
        h('div', { class: 'grid2' },
          h('select', { 'aria-label': 'Cepa', onchange: (e: Event) => { d.design = (e.target as HTMLSelectElement).value; paint(); } }, ready.map((x) => h('option', { value: x.id, selected: x.id === d.design }, x.name))),
          h('select', { 'aria-label': 'País objetivo', onchange: (e: Event) => { d.target = (e.target as HTMLSelectElement).value; paint(); } }, targets.map((x) => h('option', { value: x.id, selected: x.id === d.target }, x.name)))),
        tgt ? h('div', { class: 'row', style: 'margin-top:6px;gap:6px' }, flagEl(tgt, 18, 12), btn('liberar_patogeno', { target: tgt, params: { design: d.design } }, 'btn sm danger')) : null)
        : h('div', { class: 'small muted' }, 'No tienes cepas terminadas.'));
  };
  paint();
  const outbreaks = (w.global.outbreaks ?? []).filter((o) => o.detected || o.creator === c.id);
  return section('☣ Guerra biológica',
    status,
    h('div', { class: 'row wrap', style: 'margin-top:6px' }, btn('defensa_biologica')),
    outbreaks.length ? h('div', { style: 'margin-top:8px' }, h('h4', null, 'Brotes activos'), h('div', { class: 'list' }, outbreaks.map((o) => {
      const top = Object.entries(o.infected).sort((a, b2) => b2[1] - a[1]).slice(0, 4);
      return h('div', { class: 'item small' },
        h('div', { class: 'row between' }, h('b', null, `🦠 ${o.detected ? o.name : `${o.name} (sin detectar)`}`), h('span', null, `${o.months} meses`)),
        h('div', { class: 'muted' }, `${KIND_NAMES[o.kind]} · contagio ${o.transmission} · letalidad ${o.lethality}${o.kind === 'humano' ? ` · ${Math.round(o.deaths).toLocaleString('es-ES')} mil muertos` : ''}${o.creator === c.id ? (o.attributed ? ' · ⚠ atribuido a ti' : ' · obra tuya, secreta') : ''}`),
        h('div', null, top.map(([id, v]) => h('span', { class: 'pill' }, `${w.countries[id]?.short ?? id} ${(v * 100).toFixed(1)} %`))));
    }))) : null,
    h('div', { class: 'designer' }, box));
}

