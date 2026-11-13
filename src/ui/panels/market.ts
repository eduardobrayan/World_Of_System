/** Pestaña de Mercado mundial: precios, oferta y demanda de materias primas. */
import type { App } from '../app';
import { COMMODITIES } from '../../sim/types';
import { COMMODITY_BY_ID } from '../../sim/data';
import { h } from '../dom';
import { section } from '../components';
import { lineChart } from '../charts';
import { flagEl } from '../flags';

export function renderMarket(app: App): HTMLElement[] {
  const w = app.world;
  const m = w.market;
  const out: HTMLElement[] = [h('h2', null, '📈 Mercado mundial'),
    h('p', { class: 'small ink2' }, 'Los precios cambian con la oferta y la demanda mundiales, las guerras, las sanciones, los embargos y la tensión internacional. Los exportadores ganan con precios altos; los importadores sufren inflación.')];
  for (const k of COMMODITIES) {
    const def = COMMODITY_BY_ID[k];
    const hist = m.history[k];
    const xs = hist.map((_, i) => w.turn - hist.length + 1 + i);
    const ch = (m.price[k] / m.base[k] - 1) * 100;
    const exporters = w.order.map((id) => w.countries[id]).filter((c) => c.alive).map((c) => ({ c, net: c.res[k].prod - c.res[k].cons })).sort((a, b) => b.net - a.net);
    out.push(section(`${def.name}`,
      h('div', { class: 'row between' }, h('b', { style: 'font-size:18px' }, `${m.price[k].toFixed(1)} ${def.priceLabel}`),
        h('span', { class: ch >= 0 ? 'bad' : 'good' }, `${ch >= 0 ? '+' : ''}${ch.toFixed(0)} % vs. 2026`)),
      h('div', { class: 'small muted' }, `Oferta ${m.supply[k].toFixed(1)} · demanda ${m.demand[k].toFixed(1)} (${def.unit})`),
      lineChart({ xs, series: [{ name: def.name, values: hist }], fmt: (v) => v.toFixed(0), height: 90 }),
      h('div', { class: 'small', style: 'margin-top:4px' }, h('span', { class: 'muted' }, 'Grandes exportadores: '),
        exporters.slice(0, 4).filter((x) => x.net > 0).map((x) => h('span', { style: 'margin-right:8px' }, flagEl(x.c, 14, 10), ` ${x.c.short}`))),
      h('div', { class: 'small' }, h('span', { class: 'muted' }, 'Grandes importadores: '),
        exporters.slice(-4).reverse().filter((x) => x.net < 0).map((x) => h('span', { style: 'margin-right:8px' }, flagEl(x.c, 14, 10), ` ${x.c.short}`)))));
  }
  return out;
}
