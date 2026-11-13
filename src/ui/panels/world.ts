/** Pestaña Mundo: registro histórico de noticias, clasificaciones y evolución global. */
import type { App } from '../app';
import { h } from '../dom';
import { section } from '../components';
import { dateLabel, fmtMoney, gdppc } from '../../sim/util';
import { flagEl } from '../flags';
import { lineChart } from '../charts';
import { perceived } from '../perceive';

export function renderWorld(app: App): HTMLElement[] {
  const w = app.world;
  const filter = (app.ui.newsFilter as string) ?? 'todas';
  const pid = app.player?.id;
  let news = [...w.news].reverse();
  if (filter === 'mias' && pid) news = news.filter((n) => n.countries.includes(pid));
  if (filter === 'importantes') news = news.filter((n) => n.importance >= 2);
  const seg = (id: string, label: string) => h('button', { class: filter === id ? 'on' : '', onclick: () => { app.ui.newsFilter = id; app.refreshLeft(); } }, label);
  const sortKey = (app.ui.rankKey as string) ?? 'gdp';
  const ctx = { world: w, player: app.player };
  const metric: Record<string, [string, (c: typeof w.countries[string]) => number, (v: number) => string]> = {
    gdp: ['PIB', (c) => perceived(ctx, c, 'gdp', c.eco.gdp), fmtMoney],
    gdppc: ['Renta', (c) => perceived(ctx, c, 'gdppc', gdppc(c)), (v) => `${Math.round(v).toLocaleString('es-ES')} $`],
    growth: ['Crec.', (c) => perceived(ctx, c, 'growth', c.eco.growth), (v) => `${v.toFixed(1)}%`],
    power: ['Poder mil.', (c) => perceived(ctx, c, 'power', c.mil.power), (v) => v.toFixed(0)],
    stability: ['Estab.', (c) => perceived(ctx, c, 'stability', c.pol.stability), (v) => v.toFixed(0)],
    pop: ['Pobl.', (c) => c.soc.pop, (v) => `${v.toFixed(0)} M`],
  };
  const [mName, mGet, mFmt] = metric[sortKey];
  const ranking = w.order.map((id) => w.countries[id]).filter((c) => c.alive).sort((a, b) => mGet(b) - mGet(a));
  const wh = w.worldHistory;
  return [
    h('h2', null, '📰 Mundo'),
    section('Evolución mundial',
      lineChart({ xs: wh.map((x) => x.t), series: [{ name: 'Precio del petróleo ($)', values: wh.map((x) => x.oil) }], fmt: (v) => v.toFixed(0), height: 90 }),
      lineChart({ xs: wh.map((x) => x.t), series: [{ name: 'Tensión internacional', values: wh.map((x) => x.tension), color: '#d95926' }], fmt: (v) => v.toFixed(0), height: 90 }),
      h('div', { class: 'small ink2' }, `Anomalía térmica: +${w.global.temperature.toFixed(2)} ºC · crecimiento mundial ${w.global.worldGrowth.toFixed(1)} % · guerras activas: ${w.wars.length}`)),
    section('Clasificación',
      h('div', { class: 'seg', style: 'margin-bottom:6px;flex-wrap:wrap' }, Object.entries(metric).map(([k, [n]]) => h('button', { class: k === sortKey ? 'on' : '', onclick: () => { app.ui.rankKey = k; app.refreshLeft(); } }, n))),
      h('table', { class: 'tbl' }, h('tbody', null, ranking.slice(0, 25).map((c, i) => h('tr', { class: 'click', onclick: () => app.onSelect(c.id) },
        h('td', { class: 'n muted' }, String(i + 1)), h('td', null, flagEl(c, 18, 12), ' ', c.short, c.id === pid ? ' ◀' : ''), h('td', { class: 'n' }, mFmt(mGet(c))))))),
      h('div', { class: 'small muted' }, `Ordenado por ${mName}. Los datos ajenos son estimaciones de tu inteligencia.`)),
    section('Registro de noticias',
      h('div', { class: 'seg', style: 'margin-bottom:6px' }, seg('todas', 'Todas'), pid ? seg('mias', 'Mi país') : null, seg('importantes', 'Importantes')),
      h('div', { class: 'list' }, news.slice(0, 150).map((n) => h('div', { class: 'item small' }, h('span', { class: 'muted' }, `${dateLabel(n.turn)} · `), n.importance >= 3 ? h('b', null, n.text) : n.text)))),
  ];
}
