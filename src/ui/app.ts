/** Controlador de la interfaz: estado de la partida, selección, vistas, velocidad y refresco de paneles. */
import type { Country, Id, World } from '../sim/types';
import { advanceTurn } from '../sim/turn';
import { h, mount, toast } from './dom';
import { MapView, type MapHost } from './map';
import { renderTopbar } from './panels/topbar';
import { renderBottom } from './panels/bottom';
import { renderRight } from './panels/right';
import { TABS, SECTIONS, SECTION_OF } from './panels/tabs';
import { LAYERS, LOCAL_LAYERS } from './layers';
import { flagEl } from './flags';
import { perceived, approxMark } from './perceive';
import { fmtMoney } from '../sim/util';
import { hookAfterTurn, hookBeforeTurn } from './hooks';
import { liveTick } from './live';
import { markMonth, monthFx } from './fx';

/** Duración real (ms) de un mes de juego en cada velocidad (0 = pausa). */
export const SPEEDS = [0, 6000, 2600, 1000];

export class App implements MapHost {
  world: World;
  selected: Id | null = null;
  selectedRegion: string | null = null;
  layer = 'politico';
  localLayer = 'development';
  view: 'world' | 'local' = 'world';
  localId: Id | null = null;
  tab = 'mando';
  speed = 1; // el tiempo corre solo desde el inicio
  lastSpeed = 1; // para reanudar con la barra espaciadora
  dayProgress = 0;
  busy = false;
  modalOpen = 0;
  ui: Record<string, unknown> = {}; // estado local de pestañas (borradores, filtros)

  root!: HTMLElement;
  private topEl!: HTMLElement;
  private leftBody!: HTMLElement;
  private tabsEl!: HTMLElement;
  private rightEl!: HTMLElement;
  private bottomEl!: HTMLElement;
  private mapUi!: HTMLElement;
  private hoverEl!: HTMLElement;
  map!: MapView;
  private timer = 0;
  private refreshQueued = false;

  constructor(world: World, private container: HTMLElement, public onExit: () => void, public onLoad: (w: World) => void = () => undefined) {
    this.world = world;
    this.selected = world.player?.country ?? null;
    if (world.gameOver) this.speed = 0;
    this.ui.newsLast = world.news[world.news.length - 1] ?? null; // marca para los avisos de noticias
    this.build();
    this.refresh();
    this.loop();
    window.addEventListener('keydown', this.onKey);
  }

  /** Atajos: barra espaciadora = pausa/reanudar; 1, 2, 3 = velocidades. */
  private onKey = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement | null;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
    if (e.ctrlKey || e.metaKey || e.altKey || this.modalOpen || document.querySelector('.modal-back')) return;
    if (e.code === 'Space' || e.key === ' ') {
      e.preventDefault();
      this.setSpeed(this.speed ? 0 : this.lastSpeed || 1);
    } else if (e.key === '1' || e.key === '2' || e.key === '3') {
      this.setSpeed(Number(e.key));
    }
  };

  get player(): Country | null {
    return this.world.player ? this.world.countries[this.world.player.country] : null;
  }

  // ---------- Construcción del layout ----------
  private build() {
    this.topEl = h('div', { class: 'topbar' });
    this.tabsEl = h('nav', { class: 'tabs-v', 'aria-label': 'Ministerios y paneles' });
    this.leftBody = h('div', { class: 'panel-body' });
    const left = h('aside', { class: 'left' }, this.tabsEl, this.leftBody);
    const canvas = h('canvas', { 'aria-label': 'Mapa mundial' });
    this.mapUi = h('div', { class: 'map-ui' });
    this.hoverEl = h('div', { class: 'hover-card' });
    const center = h('main', { class: 'center' }, canvas, this.mapUi, this.hoverEl);
    this.rightEl = h('aside', { class: 'right' });
    this.bottomEl = h('footer', { class: 'bottom' });
    this.root = h('div', { class: 'game' }, this.topEl, left, center, this.rightEl, this.bottomEl);
    mount(this.container, this.root);
    this.map = new MapView(canvas, this);
    requestAnimationFrame(() => this.map.fitWorld());
  }

  // ---------- Refresco ----------
  refresh() {
    if (this.refreshQueued) return;
    this.refreshQueued = true;
    requestAnimationFrame(() => {
      this.refreshQueued = false;
      this.renderAll();
    });
  }

  renderAll() {
    const scroll = this.leftBody.scrollTop;
    mount(this.topEl, renderTopbar(this));
    const sec = SECTION_OF[this.tab];
    mount(this.tabsEl, this.visibleSections().map((s) =>
      h('button', { class: sec?.id === s.id ? 'on' : '', title: s.name, onclick: () => this.openSection(s.id) },
        h('span', { class: 'ic' }, s.icon), s.short)));
    mount(this.leftBody, ...this.renderTab());
    this.leftBody.scrollTop = scroll;
    mount(this.rightEl, renderRight(this));
    mount(this.bottomEl, renderBottom(this));
    this.renderMapUi();
    this.map.sync();
  }

  /** Refresca solo el panel izquierdo (p. ej. tras mover un control). */
  refreshLeft() {
    const scroll = this.leftBody.scrollTop;
    mount(this.leftBody, ...this.renderTab());
    this.leftBody.scrollTop = scroll;
  }

  private renderMapUi() {
    const isLocal = this.view === 'local' && this.localId;
    const legendLayer = LAYERS.find((l) => l.id === this.layer)!;
    const ctx = { world: this.world, player: this.player };
    const zoom = h('div', { class: 'zoom' },
      h('button', { title: 'Acercar', onclick: () => this.map.zoom(1.4) }, '+'),
      h('button', { title: 'Alejar', onclick: () => this.map.zoom(1 / 1.4) }, '−'),
      h('button', { title: 'Encuadrar', onclick: () => (isLocal ? this.map.fitLocal(this.localId!) : this.map.fitWorld()) }, '⤢'));
    if (isLocal) {
      const c = this.world.countries[this.localId!];
      const ll = LOCAL_LAYERS.find((l) => l.id === this.localLayer) ?? LOCAL_LAYERS[0];
      mount(this.mapUi,
        h('div', { class: 'layers' }, LOCAL_LAYERS.map((l) => h('button', { class: l.id === this.localLayer ? 'on' : '', onclick: () => { this.localLayer = l.id; this.renderMapUi(); this.map.invalidate(); } }, l.name))),
        h('div', { class: 'local-header', style: 'top:auto;bottom:10px;left:auto;right:10px;transform:none' }, flagEl(c, 20, 13), h('b', null, c.name), h('span', { class: 'muted small' }, `${c.regions.length} regiones`),
          h('button', { class: 'btn sm', onclick: () => this.closeLocal() }, '🌍 Volver al mapa mundial')),
        zoom,
        h('div', { class: 'legend' }, h('div', { class: 'ink2' }, `${ll.name} por región`),
          h('div', { class: 'small muted' }, ll.invert ? 'Azul claro = mejor (menos)' : 'Azul claro = más alto'),
          h('div', { class: 'small muted' }, '★ capital · 🏗 obras en curso · rayado: ocupada')));
    } else {
      mount(this.mapUi,
        h('div', { class: 'layers' }, LAYERS.filter((l) => !l.needsPlayer || this.player).map((l) =>
          h('button', { class: l.id === this.layer ? 'on' : '', onclick: () => { this.layer = l.id; this.renderMapUi(); this.map.invalidate(); } }, l.name))),
        zoom,
        h('div', { class: 'legend' }, legendLayer.legend(ctx)));
    }
  }

  // ---------- MapHost ----------
  onSelect(id: Id | null) {
    this.selected = id;
    this.selectedRegion = null;
    if (id) this.root.classList.add('show-right');
    this.refresh();
  }

  onSelectRegion(id: string | null) {
    this.selectedRegion = id;
    if (id) this.root.classList.add('show-right');
    this.refresh();
  }

  onOpenLocal(id: Id) {
    this.view = 'local';
    this.localId = id;
    this.selected = id;
    this.selectedRegion = null;
    this.refresh();
  }

  closeLocal() {
    this.view = 'world';
    this.localId = null;
    this.selectedRegion = null;
    this.refresh();
  }

  onHover(content: HTMLElement | null, x: number, y: number) {
    if (!content) { this.hoverEl.style.display = 'none'; return; }
    this.hoverEl.innerHTML = '';
    this.hoverEl.appendChild(content);
    this.hoverEl.style.display = 'block';
    const W = this.hoverEl.parentElement!.clientWidth;
    const bw = this.hoverEl.offsetWidth;
    this.hoverEl.style.left = `${Math.min(x + 14, W - bw - 6)}px`;
    this.hoverEl.style.top = `${y + 14}px`;
  }

  hoverInfo(id: Id): HTMLElement {
    const c = this.world.countries[id];
    const ctx = { world: this.world, player: this.player };
    const ap = approxMark(this.world, this.player, c);
    const layer = LAYERS.find((l) => l.id === this.layer);
    return h('div', null,
      h('div', { class: 'row' }, flagEl(c, 18, 12), h('b', null, c.name)),
      h('div', { class: 'small ink2' }, `PIB ${ap}${fmtMoney(perceived(ctx, c, 'gdp', c.eco.gdp))} · crec. ${ap}${perceived(ctx, c, 'growth', c.eco.growth).toFixed(1)} % · estab. ${ap}${perceived(ctx, c, 'stability', c.pol.stability).toFixed(0)}`),
      layer && layer.id !== 'politico' ? h('div', { class: 'small muted' }, `Capa: ${layer.name}`) : null,
      h('div', { class: 'small muted' }, 'Clic: seleccionar · Doble clic: mapa local'));
  }

  regionHoverInfo(c: Country, idx: number): HTMLElement {
    const r = c.regions[idx];
    const ll = LOCAL_LAYERS.find((l) => l.id === this.localLayer) ?? LOCAL_LAYERS[0];
    return h('div', null, h('b', null, r.name), h('div', { class: 'small ink2' }, `${r.city} · ${r.pop.toFixed(1)} M hab.`),
      h('div', { class: 'small' }, `${ll.name}: ${ll.fmt(ll.value(r, c))}`));
  }

  // ---------- Navegación ----------
  private tabVisible(id: string): boolean {
    const t = TABS.find((x) => x.id === id);
    return !!t && (!t.visible || t.visible(this));
  }

  visibleSections() {
    return SECTIONS.filter((s) => s.tabs.some((t) => this.tabVisible(t)));
  }

  /** Contenido del panel izquierdo: subpestañas (si la sección tiene varias) + la pestaña activa. */
  private renderTab(): HTMLElement[] {
    const tab = TABS.find((t) => t.id === this.tab && this.tabVisible(t.id)) ?? TABS[0];
    const sec = SECTION_OF[tab.id];
    const subs = sec ? sec.tabs.filter((t) => this.tabVisible(t)) : [];
    const bar = subs.length > 1
      ? h('div', { class: 'subtabs', role: 'tablist', 'aria-label': sec!.name }, subs.map((id) => {
        const t = TABS.find((x) => x.id === id)!;
        return h('button', { class: id === tab.id ? 'on' : '', role: 'tab', 'aria-selected': String(id === tab.id), onclick: () => this.setTab(id) }, `${t.icon} ${t.short ?? t.name}`);
      }))
      : null;
    return bar ? [bar, ...tab.render(this)] : tab.render(this);
  }

  openSection(id: string) {
    const s = SECTIONS.find((x) => x.id === id);
    if (!s) return;
    const last = (this.ui.sectionTab as Record<string, string> | undefined)?.[id];
    this.setTab(last && this.tabVisible(last) ? last : s.tabs.find((t) => this.tabVisible(t)) ?? s.tabs[0]);
  }

  setTab(id: string) {
    const sec = SECTION_OF[id];
    if (sec) ((this.ui.sectionTab ??= {}) as Record<string, string>)[sec.id] = id;
    this.tab = id;
    this.root.classList.add('show-left');
    this.refresh();
  }

  toggleRight() {
    this.root.classList.toggle('right-collapsed');
  }

  // ---------- Tiempo ----------
  setSpeed(s: number) {
    if (s) this.lastSpeed = s;
    this.speed = s;
    this.refresh();
  }

  /** Día del mes en curso (1–30) según el avance del reloj. */
  get day(): number {
    return Math.min(30, 1 + Math.floor(this.dayProgress * 30));
  }

  private loop() {
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      if (this.speed > 0 && !this.busy && !this.modalOpen && !this.world.gameOver) {
        this.dayProgress += Math.min(dt, 250) / SPEEDS[this.speed];
        const dayEl = this.topEl.querySelector('.day');
        if (dayEl) dayEl.textContent = `día ${this.day}`;
        const bar = this.topEl.querySelector<HTMLElement>('.month-bar i');
        if (bar) bar.style.width = `${Math.min(100, this.dayProgress * 100)}%`;
        if (this.dayProgress >= 1) this.endTurn();
      }
      liveTick(this, now);
      this.timer = requestAnimationFrame(tick);
    };
    this.timer = requestAnimationFrame(tick);
  }

  /** Avanza un mes. Si hay eventos pendientes del jugador, se resuelven antes. */
  endTurn() {
    if (this.busy || this.world.gameOver) return;
    if (!hookBeforeTurn(this)) { this.refresh(); return; } // asunto crítico abierto: el reloj espera
    this.dayProgress = 0;
    this.busy = true;
    const mark = markMonth(this.world, this.player);
    try {
      advanceTurn(this.world);
      monthFx(this, mark);
    } catch (e) {
      console.error(e);
      toast(`Error en la simulación: ${(e as Error).message}`, 'bad', 8000);
      this.speed = 0;
    }
    this.busy = false;
    hookAfterTurn(this);
    this.refresh();
  }

  destroy() {
    window.removeEventListener('keydown', this.onKey);
    cancelAnimationFrame(this.timer);
    this.map.destroy();
  }
}
