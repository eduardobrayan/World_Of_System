/** Pestaña de resumen: alertas, indicadores clave, evolución y modificadores activos. */
import type { App } from '../app';
import type { Country } from '../../sim/types';
import { h } from '../dom';
import { kpi, section, histChart, delta } from '../components';
import { dateLabel } from '../../sim/util';
import { regimeOf } from '../../sim/data';
import { tip } from '../tooltip';

export function alertsFor(app: App, c: Country): { level: 'critical' | 'serious' | 'warning'; text: string }[] {
  const a: { level: 'critical' | 'serious' | 'warning'; text: string }[] = [];
  const e = c.eco;
  if (c.pol.stability < 25) a.push({ level: 'critical', text: `Estabilidad crítica (${c.pol.stability.toFixed(0)}): riesgo de golpe o revolución.` });
  else if (c.pol.stability < 40) a.push({ level: 'serious', text: `Estabilidad baja (${c.pol.stability.toFixed(0)}).` });
  if (c.pol.coupRisk > 1) a.push({ level: 'critical', text: `Riesgo de golpe de Estado: ${c.pol.coupRisk.toFixed(1)} % al mes.` });
  if (c.pol.revolutionRisk > 0.5) a.push({ level: 'critical', text: `Riesgo de revolución: ${c.pol.revolutionRisk.toFixed(1)} % al mes.` });
  if (e.inflation > 15) a.push({ level: 'serious', text: `Inflación del ${e.inflation.toFixed(1)} %.` });
  if (e.deficit > 7) a.push({ level: 'serious', text: `Déficit del ${e.deficit.toFixed(1)} % del PIB: la prima de riesgo sube.` });
  if (e.riskPremium > 5) a.push({ level: 'serious', text: `Prima de riesgo de ${e.riskPremium.toFixed(1)} pp: los mercados dudan de tu solvencia.` });
  if (!e.euro && !e.reserveCurrency && e.reserves < (e.gdp * e.imports) / 100 / 6) a.push({ level: 'warning', text: 'Reservas inferiores a dos meses de importaciones.' });
  if (c.soc.protest > 50) a.push({ level: 'serious', text: `Protestas intensas (${c.soc.protest.toFixed(0)}).` });
  if (e.growth < -1) a.push({ level: 'warning', text: `La economía está en recesión (${e.growth.toFixed(1)} %).` });
  const reg = regimeOf(c.pol.regime);
  if (reg.elections && c.pol.nextElection >= 0 && c.pol.nextElection - app.world.turn <= 6 && c.pol.nextElection >= app.world.turn) {
    a.push({ level: c.pol.approval < 45 ? 'serious' : 'warning', text: `Elecciones en ${dateLabel(c.pol.nextElection)}; aprobación actual ${c.pol.approval.toFixed(0)}.` });
  }
  return a;
}

export function renderSummary(app: App): HTMLElement[] {
  const c = app.player;
  const w = app.world;
  if (!c) return [h('h2', null, '🌍 Modo observador'), h('p', { class: 'ink2' }, 'Selecciona países en el mapa para ver su evolución.')];
  const reg = regimeOf(c.pol.regime);
  const out: HTMLElement[] = [h('h2', null, `📋 ${c.name}`),
    h('div', { class: 'small ink2', style: 'margin-bottom:10px' }, `${reg.name} · ${c.pol.leaderTitle} ${c.pol.leaderName} · ${c.pol.govParty}`,
      reg.elections && c.pol.nextElection >= 0 ? ` · próximas elecciones: ${dateLabel(c.pol.nextElection)}` : '')];
  const alerts = alertsFor(app, c);
  if (alerts.length) {
    out.push(h('div', { class: 'card', style: 'border-color:#6a2826' }, h('h3', null, '⚠ Alertas'),
      alerts.map((a) => h('div', { class: 'small', style: `color:${a.level === 'critical' ? '#ff9b97' : a.level === 'serious' ? '#f3b08f' : '#ffd88a'}` },
        `${a.level === 'critical' ? '⛔' : a.level === 'serious' ? '🔶' : '⚠'} ${a.text}`))));
  }
  out.push(h('div', { class: 'kpis' },
    kpi(app, 'gdp', c, delta(c, 'gdp') !== undefined ? (delta(c, 'gdp')! / c.eco.gdp) * 100 : undefined), kpi(app, 'growth', c), kpi(app, 'inflation', c),
    kpi(app, 'unemployment', c, delta(c, 'unemployment')), kpi(app, 'debt', c, delta(c, 'debt')), kpi(app, 'deficit', c),
    kpi(app, 'approval', c, delta(c, 'approval')), kpi(app, 'stability', c, delta(c, 'stability')), kpi(app, 'protest', c)));
  out.push(section('Economía', histChart(c, ['growth', 'inflation', 'unemployment'], ['Crecimiento', 'Inflación', 'Desempleo'], (v) => `${v.toFixed(1)}%`, 140, true)));
  out.push(section('Política', histChart(c, ['approval', 'stability'], ['Aprobación', 'Estabilidad'], (v) => v.toFixed(0), 120)));
  const mods = c.mods.filter((m) => !m.id.startsWith('tech_') && !m.id.startsWith('pol_'));
  out.push(section('Efectos y programas activos', mods.length ? h('div', { class: 'list' }, mods.map((m) => {
    const el = h('div', { class: 'item small' }, h('div', { class: 'row between' }, h('b', null, m.name), h('span', { class: 'muted' }, m.remaining < 0 ? 'permanente' : `${m.remaining} meses`)));
    tip(el, () => h('div', null, h('div', { class: 't' }, m.name), ...Object.entries(m.mods).map(([k, v]) => h('div', { class: 'small' }, `${k}: ${v >= 0 ? '+' : ''}${v.toFixed(2)}`))));
    return el;
  })) : h('div', { class: 'muted small' }, 'Ningún efecto temporal activo.')));
  const myNews = [...w.news].reverse().filter((n) => n.countries.includes(c.id)).slice(0, 8);
  out.push(section('Últimas noticias de tu país', myNews.length ? h('div', { class: 'list' }, myNews.map((n) => h('div', { class: 'item small' }, h('span', { class: 'muted' }, `${dateLabel(n.turn)} · `), n.text))) : h('div', { class: 'muted small' }, 'Sin noticias.')));
  return out;
}
