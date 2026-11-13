/** Pestaña de Economía: presupuesto, impuestos, política monetaria, previsión y estructura económica. */
import type { App } from '../app';
import type { BudgetItem, TaxId } from '../../sim/types';
import { BUDGET_ITEMS, COMMODITIES, TAXES } from '../../sim/types';
import { h, mount, toast } from '../dom';
import { section, stat, histChart, plainStat, kpi } from '../components';
import { tip, contributions } from '../tooltip';
import { applyFiscal, cbIndependent, draftFrom, fiscalInfo, type FiscalDraft } from '../../sim/fiscal';
import { forecast, type ForecastResult } from '../../sim/forecast';
import { COMMODITY_BY_ID } from '../../sim/data';
import { commodityValue, suppliers, topPartners, supplyStress } from '../../sim/market';
import { fmtMoney } from '../../sim/util';
import { budgetTotal, taylorRate } from '../../sim/economy';
import { flagEl } from '../flags';
import { lineChart } from '../charts';

export const BUDGET_INFO: Record<BudgetItem, [string, string]> = {
  defense: ['Defensa', 'Mantenimiento, modernización y reposición de las fuerzas armadas. Más gasto: más preparación, poder y apoyo militar.'],
  education: ['Educación', 'Sube el índice educativo con años de retraso (crecimiento potencial, investigación) y el apoyo de los jóvenes.'],
  health: ['Sanidad', 'Sube el índice de salud (menos mortalidad, más satisfacción, resistencia a pandemias).'],
  pensions: ['Pensiones', 'Muy popular entre trabajadores y religiosos; reduce la desigualdad. Partida rígida y cara en países envejecidos.'],
  social: ['Protección social', 'Desempleo, vivienda y transferencias. Reduce la desigualdad y las protestas; gusta a trabajadores y religiosos.'],
  infrastructure: ['Infraestructuras', 'Mejora el índice de infraestructuras (crecimiento potencial). Gasto de inversión con efecto lento.'],
  research: ['Investigación', 'Genera puntos de investigación para el árbol tecnológico.'],
  security: ['Seguridad interior', 'Policía y justicia: más seguridad regional y menos delincuencia.'],
  administration: ['Administración', 'Funcionamiento del Estado. Recortarla es poco visible pero puede dañar la eficacia.'],
  subsidies: ['Subvenciones', 'Ayudas a energía, industria y alimentos. Contienen precios y gustan a empresarios y trabajadores; distorsionan.'],
};

export const TAX_INFO: Record<TaxId, [string, string, number]> = {
  income: ['IRPF (renta)', 'Recauda mucho; resta apoyo a trabajadores y algo de crecimiento. Reduce la desigualdad.', 60],
  corporate: ['Sociedades', 'Impuesto a beneficios empresariales. Frena la inversión y el crecimiento potencial; enfada a empresarios.', 50],
  consumption: ['IVA / consumo', 'Recaudación estable; sube los precios al aplicarse y molesta a trabajadores y jóvenes.', 30],
  tariff: ['Aranceles', 'Protege la industria y recauda, pero reduce el comercio y puede provocar represalias.', 60],
};

function getDraft(app: App): FiscalDraft {
  const c = app.player!;
  const d = app.ui.draft as FiscalDraft | undefined;
  if (!d || app.ui.draftTurn !== app.world.turn) {
    app.ui.draft = draftFrom(c);
    app.ui.draftTurn = app.world.turn;
    app.ui.forecast = undefined;
  }
  return app.ui.draft as FiscalDraft;
}

export function renderEconomy(app: App): HTMLElement[] {
  const c = app.player;
  if (!c) return [h('div', { class: 'muted' }, 'Elige un país para gestionar su economía.')];
  const w = app.world;
  const d = getDraft(app);
  const summary = h('div');
  const forecastBox = h('div');

  const updateSummary = () => mount(summary, fiscalSummary(app, d, forecastBox));
  const sliderRow = (label: string, desc: string, value: number, min: number, max: number, step: number, cur: number, set: (v: number) => void, unit = '%') => {
    const val = h('span', { class: `val ${Math.abs(value - cur) > 1e-6 ? 'changed' : ''}` }, `${value.toFixed(step < 0.1 ? 2 : 1)}${unit === '%' ? ' %' : ''}`);
    const input = h('input', { type: 'range', min: String(min), max: String(max), step: String(step), value: String(value), 'aria-label': label });
    input.addEventListener('input', () => {
      const v = Number(input.value);
      set(v);
      val.textContent = `${v.toFixed(step < 0.1 ? 2 : 1)}${unit === '%' ? ' %' : ''}`;
      val.classList.toggle('changed', Math.abs(v - cur) > 1e-6);
      app.ui.forecast = undefined;
      mount(forecastBox);
      updateSummary();
    });
    const lab = h('label', null, label);
    tip(lab, () => h('div', null, h('div', { class: 't' }, label), h('div', { class: 'desc' }, desc), h('div', { class: 'small muted' }, `Valor actual: ${cur.toFixed(2)}${unit === '%' ? ' %' : ''}`)));
    return h('div', { class: 'slider-row' }, lab, input, val);
  };

  const out: HTMLElement[] = [];
  out.push(h('h2', null, '💰 Economía'));
  out.push(h('div', { class: 'kpis' },
    ...['growth', 'inflation', 'unemployment', 'deficit', 'debt', 'reserves'].map((k) => kpi(app, k, c))));

  out.push(section('Presupuesto (% del PIB)',
    h('div', { class: 'small muted', style: 'margin-bottom:4px' }, 'Mueve los controles y aprueba el presupuesto. Los efectos tardan meses en notarse.'),
    ...BUDGET_ITEMS.map((k) => sliderRow(BUDGET_INFO[k][0], BUDGET_INFO[k][1], d.budget[k], 0, Math.max(30, c.eco.budget[k] * 2), 0.05, c.eco.budget[k], (v) => { d.budget[k] = v; }))));

  out.push(section('Impuestos (tipos efectivos)',
    ...TAXES.map((k) => sliderRow(TAX_INFO[k][0], TAX_INFO[k][1], d.taxes[k], 0, TAX_INFO[k][2], 0.5, c.eco.taxes[k], (v) => { d.taxes[k] = v; }))));

  const indep = cbIndependent(c);
  out.push(section('Política monetaria',
    indep
      ? h('div', null,
        plainStat('Tipo oficial', `${c.eco.policyRate.toFixed(2)} %`),
        plainStat('Regla de Taylor (objetivo del banco)', `${taylorRate(c).toFixed(2)} %`),
        plainStat('Meta de inflación', `${c.eco.cbTarget.toFixed(1)} %`),
        h('div', { class: 'small muted', style: 'margin-top:4px' }, 'El banco central es independiente: fija los tipos con una regla de Taylor. Puedes subordinarlo con la política «Banco central» (pestaña Gobierno), a costa de credibilidad.'))
      : sliderRow('Tipo de interés oficial', 'El banco central está subordinado: tú fijas los tipos. Bajarlos impulsa el crecimiento y deprecia la moneda; subirlos frena la inflación.', d.rate, 0, Math.max(40, c.eco.policyRate * 1.5), 0.25, c.eco.policyRate, (v) => { d.rate = v; })));

  updateSummary();
  out.push(h('div', { class: 'card', style: 'border-color:#2a4a70' }, summary, forecastBox));
  const fr = app.ui.forecast as ForecastResult | undefined;
  if (fr) mount(forecastBox, forecastView(fr));

  out.push(section('Ingresos públicos', stat(app, 'revenue', c), contributions(c.explain.revenue ?? [], ' mm$', 8)));
  out.push(section('Evolución', histChart(c, ['growth', 'inflation', 'unemployment'], ['Crecimiento', 'Inflación', 'Desempleo'], (v) => `${v.toFixed(1)}%`, 150, true)));
  out.push(section('Deuda y moneda', histChart(c, ['debt'], ['Deuda (% PIB)'], (v) => `${v.toFixed(0)}%`, 110), histChart(c, ['currency'], ['Moneda (índice)'], (v) => v.toFixed(0), 100)));
  out.push(section('Estructura productiva', ...Object.entries(c.eco.sectors).map(([k, v]) =>
    plainStat({ agriculture: 'Agricultura', energy: 'Energía y extracción', industry: 'Industria', tech: 'Tecnología', services: 'Servicios' }[k] ?? k, `${v.toFixed(1)} %`)),
  stat(app, 'currentAccount', c), stat(app, 'tradeAccess', c), stat(app, 'potentialGrowth', c)));
  out.push(section('Recursos y dependencias', resourcesTable(app)));
  out.push(section('Principales socios comerciales', h('table', { class: 'tbl' }, h('tbody', null,
    topPartners(w, c.id, 8).map((p) => h('tr', { class: 'click', onclick: () => app.onSelect(p.id) },
      h('td', null, flagEl(w.countries[p.id], 18, 12), ' ', w.countries[p.id].short), h('td', { class: 'n' }, fmtMoney(p.value)), h('td', { class: 'n' }, `${(p.share * 100).toFixed(1)} %`)))))));
  return out;
}

function fiscalSummary(app: App, d: FiscalDraft, forecastBox: HTMLElement): HTMLElement {
  const c = app.player!;
  const info = fiscalInfo(app.world, c, d);
  const spend = BUDGET_ITEMS.reduce((a, k) => a + d.budget[k], 0);
  const interest = (c.eco.interest / c.eco.gdp) * 100;
  const est = c.eco.deficit + info.deficitDelta;
  return h('div', null,
    h('h3', null, 'Resumen del proyecto'),
    plainStat('Gasto por partidas', `${spend.toFixed(1)} % (ahora ${budgetTotal(c).toFixed(1)} %)`),
    plainStat('Intereses de la deuda', `${interest.toFixed(1)} %`),
    plainStat('Déficit estimado (estático)', `${est.toFixed(1)} % (ahora ${c.eco.deficit.toFixed(1)} %)`, 'Estimación inmediata, sin efectos de segunda ronda. Usa la previsión para ver el efecto dinámico a 12 meses.'),
    info.vote.required ? plainStat('Parlamento', `${(info.vote.prob * 100).toFixed(0)} % de aprobación`, info.vote.text + '\n' + info.vote.parties.map((p) => `${p.name}: ${(p.yesProb * 100).toFixed(0)} % a favor`).join(' · ')) : plainStat('Parlamento', 'No necesario'),
    info.warnings.length ? h('div', { class: 'small warn', style: 'margin:6px 0' }, info.warnings.map((x) => h('div', null, `⚠ ${x}`))) : null,
    h('div', { class: 'row wrap', style: 'margin-top:8px' },
      h('button', { class: 'btn', disabled: !info.changed, onclick: () => {
        mount(forecastBox, h('div', { class: 'muted small', style: 'margin-top:8px' }, 'Calculando previsión…'));
        setTimeout(() => {
          const fr = forecast(app.world, c.id, (w) => {
            const cc = w.countries[c.id];
            for (const k of BUDGET_ITEMS) cc.eco.budget[k] = d.budget[k];
            for (const k of TAXES) cc.eco.taxes[k] = d.taxes[k];
            if (!cbIndependent(cc)) cc.eco.policyRate = d.rate;
            cc.eco.inflation += (d.taxes.consumption - c.eco.taxes.consumption) * 0.25;
          });
          app.ui.forecast = fr;
          mount(forecastBox, forecastView(fr));
        }, 20);
      } }, '🔮 Previsión a 12 meses'),
      h('button', { class: 'btn primary', disabled: !info.changed || c.pol.ap < info.ap, onclick: () => {
        const res = applyFiscal(app.world, c, d);
        toast(res.text, res.passed ? 'good' : 'bad');
        app.ui.draft = undefined;
        app.refresh();
      } }, `Aprobar (⚡${info.ap})`),
      h('button', { class: 'btn ghost', disabled: !info.changed, onclick: () => { app.ui.draft = undefined; app.refreshLeft(); } }, 'Descartar')));
}

function forecastView(fr: ForecastResult): HTMLElement {
  const rows: [string, number, string, boolean][] = [
    ['Crecimiento', fr.delta.growth, 'pp', true], ['Inflación', fr.delta.inflation, 'pp', false], ['Desempleo', fr.delta.unemployment, 'pp', false],
    ['Déficit', fr.delta.deficit, 'pp', false], ['Deuda', fr.delta.debt, 'pp', false], ['Aprobación', fr.delta.approval, '', true],
    ['Estabilidad', fr.delta.stability, '', true], ['PIB', fr.delta.gdp, '%', true],
  ];
  return h('div', { style: 'margin-top:10px' },
    h('h4', null, `Efecto previsto a ${fr.months} meses (frente a no hacer nada)`),
    h('div', { class: 'grid2' }, rows.map(([k, v, u, up]) => h('div', { class: 'stat' }, h('span', { class: 'k' }, k),
      h('span', { class: `v ${Math.abs(v) < 0.05 ? '' : (v > 0) === up ? 'good' : 'bad'}` }, `${v >= 0 ? '+' : ''}${v.toFixed(2)} ${u}`)))),
    lineChart({ xs: fr.base.map((_, i) => i), series: [
      { name: 'Crecimiento sin cambios', values: fr.base.map((p) => p.growth), color: '#898781', dashed: true },
      { name: 'Crecimiento con el cambio', values: fr.alt.map((p) => p.growth), color: '#3987e5' },
    ], fmt: (v) => `${v.toFixed(1)}%`, height: 110 }),
    h('div', { class: 'small muted' }, 'Simulación sin eventos ni decisiones de otros países: aísla el efecto de tu decisión. El futuro real puede diferir.'));
}

function resourcesTable(app: App): HTMLElement {
  const c = app.player!;
  const w = app.world;
  return h('table', { class: 'tbl' },
    h('thead', null, h('tr', null, h('th', null, 'Recurso'), h('th', { class: 'n' }, 'Producción'), h('th', { class: 'n' }, 'Consumo'), h('th', { class: 'n' }, 'Saldo/año'), h('th', null, 'Proveedores'))),
    h('tbody', null, COMMODITIES.map((k) => {
      const r = c.res[k];
      const net = commodityValue(w, k, r.prod - r.cons);
      const sup = suppliers(w, c, k).slice(0, 3);
      const stress = supplyStress(w, c, k);
      const row = h('tr', null, h('td', null, COMMODITY_BY_ID[k].name), h('td', { class: 'n' }, r.prod.toFixed(r.prod < 10 ? 2 : 0)),
        h('td', { class: 'n' }, r.cons.toFixed(r.cons < 10 ? 2 : 0)), h('td', { class: `n ${net >= 0 ? 'good' : 'bad'}` }, fmtMoney(net)),
        h('td', { class: 'small' }, sup.length ? sup.map((s) => `${w.countries[s.id].short} ${(s.share * 100).toFixed(0)}%`).join(', ') : '—',
          stress > 0.03 ? h('span', { class: 'tag red', style: 'margin-left:4px' }, `bloqueo ${(stress * 100).toFixed(0)}%`) : null));
      tip(row, () => `${COMMODITY_BY_ID[k].name}: ${COMMODITY_BY_ID[k].unit}. Precio actual ${w.market.price[k].toFixed(1)} ${COMMODITY_BY_ID[k].priceLabel}. Si importas de países hostiles o que te embargan, el bloqueo eleva tus precios y frena tu economía.`);
      return row;
    })));
}
