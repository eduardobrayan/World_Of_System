/** Mapa 2D en Canvas: vista mundial (capas, selección, zoom) y vista local (regiones Voronoi, ciudades, obras). */
import type { Country, Id, World } from '../sim/types';
import { BUILDING_BY_ID } from '../sim/data';
import {
  BY_ENTITY, BY_NAME, FEATURES, cellPath, entityArea, entityPath, featurePath, hitFeature, hitRegion, invMillerY,
  labelPoint, localFrame, millerY, regionCells, regionSeed, type Pt,
} from './geo';
import { LAYER_BY_ID, LOCAL_LAYERS, localColor, type LayerCtx } from './layers';
import { SERIES } from './charts';

export interface MapHost {
  world: World;
  player: Country | null;
  selected: Id | null;
  selectedRegion: string | null;
  layer: string;
  localLayer: string;
  view: 'world' | 'local';
  localId: Id | null;
  onSelect(id: Id | null): void;
  onSelectRegion(id: string | null): void;
  onOpenLocal(id: Id): void;
  onHover(text: HTMLElement | null, x: number, y: number): void;
  hoverInfo(id: Id): HTMLElement;
  regionHoverInfo(c: Country, regionIdx: number): HTMLElement;
}

interface View { cx: number; cy: number; s: number }

const OCEAN = '#0f1a26';
const BORDER = 'rgba(10,12,16,0.85)';

export interface Fx { kind: 'pulse' | 'arrow' | 'boom' | 'float' | 'cloud'; a: Id; b?: Id; text?: string; color: string; dashed?: boolean; offset?: number; t0: number; dur: number }

export class MapView {
  private ctx: CanvasRenderingContext2D;
  private v: View = { cx: 10, cy: 20, s: 3 };
  private dirty = true;
  private pointers = new Map<number, { x: number; y: number }>();
  private drag: { x: number; y: number; moved: number; pinch?: number } | null = null;
  private hovered: Id | null = null;
  private hoveredRegion = -1;
  private lastLocal: Id | null = null;
  private raf = 0;
  private hatch: CanvasPattern | null = null;
  private touched = false;
  pulse = 0;

  constructor(private canvas: HTMLCanvasElement, private host: MapHost) {
    this.ctx = canvas.getContext('2d')!;
    this.bind();
    new ResizeObserver(() => { this.fitIfNeeded(); this.invalidate(); }).observe(canvas);
    // Animación continua (frentes, tropas en marcha, brotes): ~30 fps mientras haya algo que mover
    const loop = () => {
      this.pulse = (this.pulse + 1) % 3600;
      if (this.dirty || (this.animating() && (this.fx.length || this.pulse % 2 === 0))) this.render();
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this.raf); }

  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Posición animada de cada frente (fracción del trayecto defensor → atacante), interpolada entre meses. */
  private frontPos: Record<string, number> = {};

  // ---------- Efectos visuales transitorios (respuesta a acciones y sucesos) ----------
  private fx: Fx[] = [];

  /** Lanza un efecto: pulso, flecha entre países, explosión, nube de contagio o texto flotante. */
  addFx(f: Omit<Fx, 't0' | 'dur'> & { dur?: number; delay?: number }) {
    this.fx.push({ ...f, t0: performance.now() + (f.delay ?? 0), dur: f.dur ?? (f.kind === 'arrow' ? 1900 : f.kind === 'float' ? 2200 : 1600) });
    if (this.fx.length > 40) this.fx.splice(0, this.fx.length - 40);
    this.invalidate();
  }

  private drawFx(dpr: number) {
    if (!this.fx.length) return;
    const ctx = this.ctx;
    const now = performance.now();
    this.fx = this.fx.filter((f) => now - f.t0 < f.dur);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    for (const f of this.fx) {
      const k = (now - f.t0) / f.dur;
      if (k < 0) continue;
      const [x, y] = this.toScreen(...labelPoint(f.a));
      ctx.save();
      if (f.kind === 'pulse') {
        for (let i = 0; i < 3; i++) {
          const kk = k * 1.3 - i * 0.18;
          if (kk <= 0 || kk >= 1) continue;
          ctx.beginPath(); ctx.arc(x, y, 6 + kk * 46, 0, Math.PI * 2);
          ctx.strokeStyle = f.color; ctx.globalAlpha = 1 - kk; ctx.lineWidth = 3; ctx.stroke();
        }
      } else if (f.kind === 'arrow' && f.b) {
        const [x2, y2] = this.toScreen(...labelPoint(f.b));
        const dx = x2 - x, dy = y2 - y, len = Math.hypot(dx, dy) || 1;
        const cx = (x + x2) / 2 - (dy / len) * len * 0.22, cy = (y + y2) / 2 + (dx / len) * len * 0.22;
        const prog = Math.min(1, k * 1.6);
        const pt = (t: number) => [(1 - t) * (1 - t) * x + 2 * (1 - t) * t * cx + t * t * x2, (1 - t) * (1 - t) * y + 2 * (1 - t) * t * cy + t * t * y2];
        ctx.globalAlpha = k > 0.75 ? (1 - k) / 0.25 : 1;
        ctx.strokeStyle = f.color; ctx.lineWidth = 3; ctx.lineCap = 'round';
        if (f.dashed) ctx.setLineDash([6, 6]);
        ctx.beginPath(); ctx.moveTo(x, y);
        for (let i = 1; i <= 24; i++) { const [px, py] = pt((i / 24) * prog); ctx.lineTo(px, py); }
        ctx.stroke(); ctx.setLineDash([]);
        const [hx, hy] = pt(prog);
        ctx.beginPath(); ctx.arc(hx, hy, 6, 0, Math.PI * 2); ctx.fillStyle = f.color; ctx.fill();
        if (prog >= 1) { ctx.beginPath(); ctx.arc(x2, y2, 6 + (k - 0.62) * 60, 0, Math.PI * 2); ctx.globalAlpha *= 0.6; ctx.stroke(); }
      } else if (f.kind === 'boom') {
        ctx.globalAlpha = 1 - k;
        const g = ctx.createRadialGradient(x, y, 0, x, y, 10 + k * 34);
        g.addColorStop(0, 'rgba(255,240,180,0.95)'); g.addColorStop(0.5, 'rgba(255,140,40,0.7)'); g.addColorStop(1, 'rgba(200,40,20,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 10 + k * 34, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2;
        for (let i = 0; i < 12; i++) {
          const ang = (i / 12) * Math.PI * 2 + (f.a.charCodeAt(0) % 5);
          const r0 = 8 + k * 20, r1 = 14 + k * 46;
          ctx.beginPath(); ctx.moveTo(x + Math.cos(ang) * r0, y + Math.sin(ang) * r0); ctx.lineTo(x + Math.cos(ang) * r1, y + Math.sin(ang) * r1); ctx.stroke();
        }
      } else if (f.kind === 'cloud') {
        for (let i = 0; i < 6; i++) {
          const ang = (i / 6) * Math.PI * 2 + k * 1.5;
          const r = 10 + k * 26;
          const px = x + Math.cos(ang) * r, py = y + Math.sin(ang) * r * 0.6;
          const g = ctx.createRadialGradient(px, py, 0, px, py, 18 + k * 18);
          g.addColorStop(0, f.color); g.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.globalAlpha = (1 - k) * 0.7; ctx.fillStyle = g;
          ctx.beginPath(); ctx.arc(px, py, 18 + k * 18, 0, Math.PI * 2); ctx.fill();
        }
      } else if (f.kind === 'float' && f.text) {
        ctx.globalAlpha = k < 0.15 ? k / 0.15 : 1 - Math.max(0, (k - 0.6) / 0.4);
        ctx.font = '700 15px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        const yy = y - 18 - k * 42 + (f.offset ?? 0);
        ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(10,12,16,0.85)'; ctx.strokeText(f.text, x, yy);
        ctx.fillStyle = f.color; ctx.fillText(f.text, x, yy);
      }
      ctx.restore();
    }
  }

  private animating(): boolean {
    if (this.fx.length) return true;
    if (this.reducedMotion || this.host.view === 'local') return false;
    const W = this.host.world;
    return W.wars.length > 0 || this.visibleOutbreaks().length > 0;
  }

  private visibleOutbreaks() {
    const W = this.host.world, pid = this.host.player?.id;
    const out: { infected: Record<string, number>; human: boolean }[] = [];
    for (const o of W.global.outbreaks ?? []) if (o.detected || o.creator === pid) out.push({ infected: o.infected, human: o.kind === 'humano' });
    if (W.global.pandemic) out.push({ infected: W.global.pandemic.infected, human: true });
    return out;
  }

  /** Anillos que laten sobre los países con brotes conocidos (más grandes cuanto más afectados). */
  private drawOutbreakPulses() {
    const ctx = this.ctx, s = this.v.s;
    const t = this.pulse / 60;
    for (const o of this.visibleOutbreaks()) {
      for (const [id, inf] of Object.entries(o.infected)) {
        if (inf < 0.003 || !this.host.world.countries[id]?.alive) continue;
        const [x, y] = labelPoint(id);
        const ph = (t * 0.8 + (id.charCodeAt(0) % 7) / 7) % 1;
        const base = (4 + Math.sqrt(inf / 0.4) * 14) / s;
        ctx.beginPath();
        ctx.arc(x, y, base * (0.6 + ph * 1.2), 0, Math.PI * 2);
        ctx.strokeStyle = o.human ? `rgba(240,165,124,${0.75 * (1 - ph)})` : `rgba(181,214,96,${0.75 * (1 - ph)})`;
        ctx.lineWidth = 2 / s;
        ctx.stroke();
      }
    }
  }
  invalidate() { this.dirty = true; }

  private size() { return { w: this.canvas.clientWidth || 800, h: this.canvas.clientHeight || 500 }; }

  fitWorld() {
    const { w, h } = this.size();
    const s = Math.min(w / 345, h / 140);
    this.v = { cx: 8, cy: 22, s: Math.max(0.5, s) };
    this.invalidate();
  }

  fitLocal(id: Id) {
    const fr = localFrame(id);
    const { w, h } = this.size();
    const bw = fr.bbox.x1 - fr.bbox.x0, bh = fr.bbox.y1 - fr.bbox.y0;
    const s = Math.min((w * 0.82) / Math.max(1, bw), (h * 0.78) / Math.max(1, bh));
    this.v = { cx: (fr.bbox.x0 + fr.bbox.x1) / 2, cy: (fr.bbox.y0 + fr.bbox.y1) / 2, s: Math.min(140, s) };
    this.invalidate();
  }

  focus(id: Id) {
    this.touched = true;
    const p = labelPoint(id);
    this.v.cx = p[0];
    this.v.cy = p[1];
    this.v.s = Math.max(this.v.s, 4);
    this.invalidate();
  }

  zoom(f: number) {
    this.touched = true;
    this.v.s = Math.max(0.6, Math.min(160, this.v.s * f));
    this.invalidate();
  }

  private fitIfNeeded() {
    if (this.host.view === 'local' && this.host.localId) {
      if (this.lastLocal !== this.host.localId) { this.lastLocal = this.host.localId; this.fitLocal(this.host.localId); }
    } else if (this.lastLocal !== null || !this.touched) {
      this.lastLocal = null;
      this.fitWorld();
    }
  }

  /** Sincroniza el modo (mundial/local) tras un cambio en el anfitrión. */
  sync() { this.fitIfNeeded(); this.invalidate(); }

  private toWorld(px: number, py: number): Pt {
    const { w, h } = this.size();
    return [(px - w / 2) / this.v.s + this.v.cx, this.v.cy - (py - h / 2) / this.v.s];
  }
  private toScreen(x: number, y: number): Pt {
    const { w, h } = this.size();
    return [(x - this.v.cx) * this.v.s + w / 2, (this.v.cy - y) * this.v.s + h / 2];
  }

  private bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      this.touched = true;
      c.setPointerCapture(e.pointerId);
      this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.pointers.size === 2) {
        const [a, b] = [...this.pointers.values()];
        this.drag = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, moved: 99, pinch: Math.hypot(a.x - b.x, a.y - b.y) };
      } else this.drag = { x: e.offsetX, y: e.offsetY, moved: 0 };
    });
    c.addEventListener('pointermove', (e) => {
      if (this.pointers.has(e.pointerId)) this.pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
      if (this.drag && this.pointers.size >= 1) {
        if (this.pointers.size === 2 && this.drag.pinch) {
          const [a, b] = [...this.pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
          this.zoomAt(mx, my, d / this.drag.pinch);
          this.drag.pinch = d;
          this.v.cx -= (mx - this.drag.x) / this.v.s;
          this.v.cy += (my - this.drag.y) / this.v.s;
          this.drag.x = mx; this.drag.y = my;
        } else {
          const dx = e.offsetX - this.drag.x, dy = e.offsetY - this.drag.y;
          this.drag.moved += Math.abs(dx) + Math.abs(dy);
          this.v.cx -= dx / this.v.s;
          this.v.cy += dy / this.v.s;
          this.v.cx = Math.max(-230, Math.min(230, this.v.cx));
          this.v.cy = Math.max(-90, Math.min(130, this.v.cy));
          this.drag.x = e.offsetX; this.drag.y = e.offsetY;
        }
        this.invalidate();
        this.host.onHover(null, 0, 0);
        return;
      }
      this.updateHover(e.offsetX, e.offsetY);
    });
    const up = (e: PointerEvent) => {
      this.pointers.delete(e.pointerId);
      if (this.drag && this.drag.moved < 6 && this.pointers.size === 0) this.click(e.offsetX, e.offsetY);
      if (this.pointers.size === 0) this.drag = null;
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => { this.pointers.delete(e.pointerId); this.drag = null; });
    c.addEventListener('pointerleave', () => { this.hovered = null; this.hoveredRegion = -1; this.host.onHover(null, 0, 0); this.invalidate(); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.touched = true;
      this.zoomAt(e.offsetX, e.offsetY, Math.exp(-e.deltaY * 0.0015));
    }, { passive: false });
    c.addEventListener('dblclick', (e) => {
      if (this.host.view !== 'world') return;
      const [x, y] = this.toWorld(e.offsetX, e.offsetY);
      const f = hitFeature(x, y);
      if (f) this.host.onOpenLocal(f.entity);
    });
  }

  private zoomAt(px: number, py: number, f: number) {
    const [x, y] = this.toWorld(px, py);
    this.v.s = Math.max(0.6, Math.min(160, this.v.s * f));
    const [nx, ny] = this.toWorld(px, py);
    this.v.cx += x - nx;
    this.v.cy += y - ny;
    this.invalidate();
  }

  private click(px: number, py: number) {
    const [x, y] = this.toWorld(px, py);
    if (this.host.view === 'local' && this.host.localId) {
      const c = this.host.world.countries[this.host.localId];
      const idx = hitRegion(c.id, c.regions, c.isBlock, x, y);
      if (idx >= 0) { this.host.onSelectRegion(c.regions[idx].id); return; }
      const f = hitFeature(x, y);
      if (f && f.entity !== c.id) this.host.onSelect(f.entity);
      else this.host.onSelectRegion(null);
      return;
    }
    const f = hitFeature(x, y);
    this.host.onSelect(f ? f.entity : null);
  }

  private updateHover(px: number, py: number) {
    const [x, y] = this.toWorld(px, py);
    if (this.host.view === 'local' && this.host.localId) {
      const c = this.host.world.countries[this.host.localId];
      const idx = hitRegion(c.id, c.regions, c.isBlock, x, y);
      if (idx !== this.hoveredRegion) { this.hoveredRegion = idx; this.invalidate(); }
      if (idx >= 0) this.host.onHover(this.host.regionHoverInfo(c, idx), px, py);
      else this.host.onHover(null, 0, 0);
      return;
    }
    const f = hitFeature(x, y);
    const id = f?.entity ?? null;
    if (id !== this.hovered) { this.hovered = id; this.invalidate(); }
    if (id) this.host.onHover(this.host.hoverInfo(id), px, py);
    else this.host.onHover(null, 0, 0);
  }

  private hatchPattern(): CanvasPattern | null {
    if (this.hatch) return this.hatch;
    const p = document.createElement('canvas');
    p.width = p.height = 8;
    const g = p.getContext('2d')!;
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(-2, 10); g.lineTo(10, -2); g.stroke();
    g.beginPath(); g.moveTo(-2, 2); g.lineTo(2, -2); g.stroke();
    g.beginPath(); g.moveTo(6, 10); g.lineTo(10, 6); g.stroke();
    this.hatch = this.ctx.createPattern(p, 'repeat');
    return this.hatch;
  }

  private fillHatch(p: Path2D) {
    const pat = this.hatchPattern();
    if (!pat) return;
    pat.setTransform(new DOMMatrix([1 / this.v.s, 0, 0, -1 / this.v.s, 0, 0]));
    this.ctx.fillStyle = pat;
    this.ctx.fill(p, 'evenodd');
  }

  render() {
    this.dirty = false;
    const { w, h } = this.size();
    const dpr = window.devicePixelRatio || 1;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = OCEAN;
    ctx.fillRect(0, 0, w, h);
    this.drawGraticule(w, h);
    const s = this.v.s;
    ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (w / 2 - this.v.cx * s), dpr * (h / 2 + this.v.cy * s));
    if (this.host.view === 'local' && this.host.localId) this.drawLocal(dpr);
    else this.drawWorld(dpr);
  }

  private drawGraticule(w: number, h: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(120,150,190,0.07)';
    ctx.lineWidth = 1;
    for (let lon = -180; lon <= 180; lon += 30) {
      const [x] = this.toScreen(lon, 0);
      if (x < -2 || x > w + 2) continue;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let lat = -60; lat <= 80; lat += 20) {
      const [, y] = this.toScreen(0, millerY(lat));
      if (y < -2 || y > h + 2) continue;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
  }

  private layerCtx(): LayerCtx { return { world: this.host.world, player: this.host.player }; }

  private drawWorld(dpr: number) {
    const ctx = this.ctx;
    const world = this.host.world;
    const layer = LAYER_BY_ID[this.host.layer] ?? LAYER_BY_ID.politico;
    const lctx = this.layerCtx();
    const s = this.v.s;
    const colorCache: Record<string, string> = {};
    for (const f of FEATURES) {
      const c = world.countries[f.entity];
      if (!c) continue;
      const owner = c.alive ? c : world.countries[c.annexedBy ?? c.id];
      const col = (colorCache[owner.id] ??= layer.color(owner, lctx));
      ctx.fillStyle = col;
      ctx.fill(featurePath(f), 'evenodd');
    }
    // Ocupaciones y cesiones territoriales
    this.drawOccupation(true);
    // Fronteras internas (miembros de bloques) y externas
    ctx.lineWidth = 0.6 / s;
    ctx.strokeStyle = 'rgba(10,12,16,0.35)';
    for (const f of FEATURES) if (world.countries[f.entity]?.isBlock) ctx.stroke(featurePath(f));
    ctx.lineWidth = 1 / s;
    ctx.strokeStyle = BORDER;
    for (const id of world.order) {
      if (world.countries[id].isBlock) for (const f of BY_ENTITY[id] ?? []) ctx.stroke(featurePath(f));
    }
    for (const f of FEATURES) if (!world.countries[f.entity]?.isBlock) ctx.stroke(featurePath(f));
    // Hover, jugador, selección
    const outline = (id: Id, color: string, px: number, glow = 0) => {
      ctx.save();
      if (glow) { ctx.shadowColor = color; ctx.shadowBlur = glow * dpr; }
      ctx.strokeStyle = color;
      ctx.lineWidth = px / s;
      for (const f of BY_ENTITY[id] ?? []) ctx.stroke(featurePath(f));
      ctx.restore();
    };
    if (this.hovered && this.hovered !== this.host.selected) outline(this.hovered, 'rgba(240,239,236,0.55)', 1.3);
    if (this.host.player) outline(this.host.player.id, '#f0efec', 1.6);
    if (this.host.selected) outline(this.host.selected, '#5598e7', 2.6, 8);
    if (this.host.layer === 'conflictos' || world.wars.length) this.drawFronts();
    if (!this.reducedMotion) this.drawOutbreakPulses();
    this.drawLabels(dpr);
    this.drawFx(dpr);
  }

  private drawOccupation(world: boolean) {
    const ctx = this.ctx;
    const W = this.host.world;
    const pat = this.hatchPattern();
    for (const id of W.order) {
      const c = W.countries[id];
      const origin = (r: typeof c.regions[number]) => r.id.slice(0, r.id.lastIndexOf('_'));
      const foreign = c.regions.filter((r) => r.controller !== c.id || r.owner !== c.id || origin(r) !== c.id);
      if (!foreign.length) continue;
      for (const r of foreign) {
        const orig = W.countries[origin(r)] ?? c;
        const occ = W.countries[r.controller] ?? c;
        const cellIdx = orig.regions.findIndex((x) => x.id === r.id);
        ctx.save();
        if (orig.isBlock && r.geoName && BY_NAME[r.geoName]) {
          ctx.clip(featurePath(BY_NAME[r.geoName]), 'evenodd');
          const b = BY_NAME[r.geoName].bbox;
          ctx.fillStyle = world ? LAYER_BY_ID[this.host.layer]?.color(occ, this.layerCtx()) ?? occ.color : occ.color;
          ctx.fillRect(b.x0 - 1, b.y0 - 1, b.x1 - b.x0 + 2, b.y1 - b.y0 + 2);
          if (pat && r.controller !== r.owner) this.fillHatch(featurePath(BY_NAME[r.geoName]));
        } else if (cellIdx >= 0) {
          ctx.clip(entityPath(orig.id), 'evenodd');
          const cells = regionCells(orig.id, orig.regions);
          const p = cellPath(cells[cellIdx]);
          ctx.fillStyle = world ? LAYER_BY_ID[this.host.layer]?.color(occ, this.layerCtx()) ?? occ.color : occ.color;
          ctx.fill(p);
          if (pat && r.controller !== r.owner) this.fillHatch(p);
        }
        ctx.restore();
      }
    }
  }

  private drawFronts() {
    const ctx = this.ctx;
    const W = this.host.world;
    const s = this.v.s;
    const t = this.pulse / 60;
    for (const war of W.wars) {
      for (const fr of war.fronts) {
        const a = labelPoint(fr.a), d = labelPoint(fr.d);
        // La línea del frente avanza hacia el defensor cuanto más territorio controla el atacante (y se desliza suavemente entre meses)
        const key = `${war.id}:${fr.a}:${fr.d}`;
        const target = Math.max(0.08, Math.min(0.85, 0.42 - fr.control / 260));
        const cur = this.frontPos[key] ?? target;
        const f = this.reducedMotion ? target : cur + (target - cur) * 0.04;
        this.frontPos[key] = f;
        const mx = d[0] + (a[0] - d[0]) * f, my = d[1] + (a[1] - d[1]) * f;
        const r = (5 + Math.sin(t * Math.PI) * 1.5) / s;
        ctx.beginPath();
        ctx.arc(mx, my, r * 1.8, 0, Math.PI * 2);
        ctx.fillStyle = war.ceasefire > 0 ? 'rgba(180,180,170,0.25)' : 'rgba(230,103,103,0.25)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(mx, my, r, 0, Math.PI * 2);
        ctx.fillStyle = war.ceasefire > 0 ? '#9a9a92' : '#e66767';
        ctx.fill();
        ctx.lineWidth = 1.5 / s;
        ctx.strokeStyle = '#1a1a19';
        ctx.stroke();
        ctx.setLineDash([4 / s, 3 / s]);
        ctx.lineDashOffset = war.ceasefire > 0 ? 0 : (-t * 6) / s; // la línea de suministro «marcha» hacia el frente
        ctx.strokeStyle = war.ceasefire > 0 ? 'rgba(180,180,170,0.6)' : 'rgba(230,103,103,0.75)';
        ctx.lineWidth = 1.4 / s;
        ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(mx, my); ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineDashOffset = 0;
        if (war.ceasefire <= 0) {
          // Columnas de tropas: el atacante avanza hacia el frente y el defensor envía refuerzos
          for (let i = 0; i < 3; i++) {
            const k = (t * 0.35 + i / 3) % 1;
            ctx.fillStyle = '#f0a57c';
            ctx.fillRect(a[0] + (mx - a[0]) * k - 1.6 / s, a[1] + (my - a[1]) * k - 1.6 / s, 3.2 / s, 3.2 / s);
            const k2 = (t * 0.25 + i / 3 + 0.17) % 1;
            ctx.fillStyle = '#86b6ef';
            ctx.fillRect(d[0] + (mx - d[0]) * k2 - 1.6 / s, d[1] + (my - d[1]) * k2 - 1.6 / s, 3.2 / s, 3.2 / s);
          }
        }
      }
    }
  }

  private drawLabels(dpr: number) {
    const ctx = this.ctx;
    const W = this.host.world;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const s = this.v.s;
    for (const id of W.order) {
      const c = W.countries[id];
      const area = entityArea(id);
      const size = Math.min(16, Math.sqrt(area) * s * 0.11 + (c.isBlock ? 0 : 1));
      if (size < 8.5) continue;
      const [x, y] = this.toScreen(...labelPoint(id));
      const text = size > 13 && !c.isBlock ? c.name : c.short;
      ctx.font = `${c.isBlock ? 'italic ' : ''}${id === this.host.selected ? 700 : 600} ${size.toFixed(1)}px system-ui, sans-serif`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,16,0.8)';
      ctx.strokeText(text, x, y);
      ctx.fillStyle = c.isBlock ? '#c3c2b7' : '#f0efec';
      ctx.fillText(text, x, y);
    }
    // Iconos de fuerzas desplegadas y de guerra
    for (const id of W.order) {
      const c = W.countries[id];
      if (!c.alive || c.mil.power < 1) continue;
      const [x, y] = this.toScreen(...labelPoint(id));
      if (s < 2.2 && c.mil.power < 250) continue;
      const mob = c.mil.mobilization;
      const deployed = Object.keys(c.mil.deployments).length;
      if (!mob && !deployed) continue;
      const lbl = `${mob ? '⚔'.repeat(Math.min(3, mob)) : ''}${deployed ? ' ⛺' : ''}`;
      ctx.font = '11px system-ui';
      ctx.fillStyle = mob >= 2 ? '#e66767' : '#fab219';
      ctx.fillText(lbl, x, y + 14);
    }
  }

  private drawLocal(dpr: number) {
    const ctx = this.ctx;
    const W = this.host.world;
    const id = this.host.localId!;
    const c = W.countries[id];
    const s = this.v.s;
    // Contexto: vecinos en gris
    for (const f of FEATURES) {
      if (f.entity === id) continue;
      ctx.fillStyle = '#22262b';
      ctx.fill(featurePath(f), 'evenodd');
    }
    ctx.lineWidth = 0.8 / s;
    ctx.strokeStyle = '#30353b';
    for (const f of FEATURES) if (f.entity !== id) ctx.stroke(featurePath(f));
    const layer = LOCAL_LAYERS.find((l) => l.id === this.host.localLayer) ?? LOCAL_LAYERS[0];
    const regions = c.regions;
    const pat = this.hatchPattern();
    if (c.isBlock) {
      regions.forEach((r, i) => {
        const f = r.geoName ? BY_NAME[r.geoName] : null;
        if (!f) return;
        ctx.fillStyle = localColor(layer, r, c);
        ctx.fill(featurePath(f), 'evenodd');
        if (r.controller !== c.id && pat) this.fillHatch(featurePath(f));
        ctx.lineWidth = (i === this.hoveredRegion ? 2 : 1) / s;
        ctx.strokeStyle = '#0d0d0d';
        ctx.stroke(featurePath(f));
      });
    } else {
      const cells = regionCells(id, regions);
      ctx.save();
      ctx.clip(entityPath(id), 'evenodd');
      regions.forEach((r, i) => {
        const p = cellPath(cells[i]);
        ctx.fillStyle = r.owner !== c.id ? W.countries[r.owner]?.color ?? '#555' : localColor(layer, r, c);
        ctx.fill(p);
        if (r.controller !== r.owner && pat) this.fillHatch(p);
      });
      ctx.lineWidth = 1.2 / s;
      ctx.strokeStyle = 'rgba(13,13,13,0.9)';
      for (const cell of cells) ctx.stroke(cellPath(cell));
      if (this.hoveredRegion >= 0) {
        ctx.lineWidth = 2.2 / s;
        ctx.strokeStyle = 'rgba(240,239,236,0.7)';
        ctx.stroke(cellPath(cells[this.hoveredRegion]));
      }
      const selIdx = regions.findIndex((r) => r.id === this.host.selectedRegion);
      if (selIdx >= 0) {
        ctx.lineWidth = 3 / s;
        ctx.strokeStyle = '#5598e7';
        ctx.stroke(cellPath(cells[selIdx]));
      }
      ctx.restore();
    }
    ctx.lineWidth = 2 / s;
    ctx.strokeStyle = '#f0efec';
    for (const f of BY_ENTITY[id] ?? []) ctx.stroke(featurePath(f));
    if (c.isBlock) {
      const sel = regions.find((r) => r.id === this.host.selectedRegion);
      if (sel?.geoName && BY_NAME[sel.geoName]) {
        ctx.lineWidth = 3 / s;
        ctx.strokeStyle = '#5598e7';
        ctx.stroke(featurePath(BY_NAME[sel.geoName]));
      }
    }
    // Ciudades, nombres, obras
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.textAlign = 'center';
    for (const r of regions) {
      const seed: Pt = c.isBlock && r.geoName && BY_NAME[r.geoName] ? BY_NAME[r.geoName].centroid : regionSeed(r);
      const [x, y] = this.toScreen(seed[0], seed[1]);
      ctx.beginPath();
      if (r.capital) {
        star(ctx, x, y, 7, 3);
        ctx.fillStyle = '#fab219';
      } else {
        ctx.arc(x, y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = '#f0efec';
      }
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#0d0d0d';
      ctx.stroke();
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.lineWidth = 3;
      ctx.strokeStyle = 'rgba(10,12,16,0.85)';
      ctx.strokeText(r.name, x, y - 11);
      ctx.fillStyle = '#f0efec';
      ctx.fillText(r.name, x, y - 11);
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillStyle = '#c3c2b7';
      ctx.strokeText(r.city, x, y + 14);
      ctx.fillText(r.city, x, y + 14);
      if (r.queue.length) {
        const icons = r.queue.map((q) => BUILDING_BY_ID[q.building]?.icon ?? '🏗').join('');
        ctx.font = '13px system-ui';
        ctx.fillText(`🏗${icons}`, x, y + 29);
      }
      if (r.controller !== r.owner) {
        ctx.font = '700 11px system-ui';
        ctx.fillStyle = '#e66767';
        ctx.strokeText(`Ocupada por ${W.countries[r.controller]?.short ?? r.controller}`, x, y + (r.queue.length ? 44 : 29));
        ctx.fillText(`Ocupada por ${W.countries[r.controller]?.short ?? r.controller}`, x, y + (r.queue.length ? 44 : 29));
      }
    }
  }
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, R: number, r: number) {
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? R : r;
    if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
  }
  ctx.closePath();
}

export { invMillerY, SERIES };
