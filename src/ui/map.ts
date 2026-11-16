/** Mapa 2D en Canvas: vista mundial (capas, selección, zoom) y vista local (regiones Voronoi, ciudades, obras). */
import type { Country, Id, World } from '../sim/types';
import { BUILDING_BY_ID } from '../sim/data';
import {
  BY_ENTITY, BY_NAME, FEATURES, cellPath, entityArea, entityPath, featurePath, hitFeature, hitRegion, invMillerY,
  labelPoint, landPath, localFrame, millerY, regionCells, regionSeed, type Pt,
} from './geo';
import { FxEngine, easeInOut, type Proj } from './anim/engine';
import { Ambient } from './anim/ambient';
import { capitalPt } from './anim/anchors';
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

const BORDER = 'rgba(8,11,16,0.9)';

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
  private reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  /** Transición suave de la vista (enfocar, acercar, encuadrar). */
  private tw: { from: View; to: View; t0: number; dur: number } | null = null;
  /** Clave de lo que se dibuja (vista + capa) para el fundido al cambiar de capa. */
  private drawnKey = '';
  private snap: HTMLCanvasElement | null = null;
  private overlay: HTMLCanvasElement;
  /** Motor de efectos superpuesto (misiles, explosiones, barcos…). */
  readonly fx: FxEngine;
  private ambient: Ambient;

  constructor(private canvas: HTMLCanvasElement, private host: MapHost) {
    this.ctx = canvas.getContext('2d')!;
    this.overlay = document.createElement('canvas');
    this.overlay.className = 'map-fx';
    this.overlay.setAttribute('aria-hidden', 'true');
    Object.assign(this.overlay.style, { position: 'absolute', left: '0', top: '0', pointerEvents: 'none' });
    this.placeOverlay();
    this.fx = new FxEngine(this.overlay, () => this.proj(), [canvas, this.overlay]);
    this.ambient = new Ambient(this.fx, host);
    this.fx.live2 = (g, p, now, dt) => this.ambient.draw(g, p, now, dt);
    this.bind();
    new ResizeObserver(() => { this.placeOverlay(); this.fitIfNeeded(); this.invalidate(); }).observe(canvas);
    // El mapa base solo se redibuja cuando cambia algo; lo animado va en el lienzo de efectos
    const loop = (now: number) => {
      if (this.tw) this.stepTween(now);
      if (this.dirty) { this.render(); this.fx.redraw(); }
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() { cancelAnimationFrame(this.raf); this.fx.destroy(); }

  /** Coloca el lienzo de efectos exactamente encima del mapa. */
  private placeOverlay() {
    const c = this.canvas;
    if (!this.overlay.isConnected && c.parentElement) c.after(this.overlay);
    Object.assign(this.overlay.style, { left: `${c.offsetLeft}px`, top: `${c.offsetTop}px`, width: `${c.clientWidth}px`, height: `${c.clientHeight}px` });
  }

  /** Proyección actual para el motor de efectos. */
  private proj(): Proj {
    const { w, h } = this.size();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const v = this.v;
    return {
      s: v.s, w, h, dpr,
      k: Math.max(0.75, Math.min(1.45, 0.62 + Math.sqrt(v.s) * 0.2)) * (w < 600 ? 0.85 : 1),
      toScreen: (x, y) => [(x - v.cx) * v.s + w / 2, (v.cy - y) * v.s + h / 2],
      toWorld: (px, py) => [(px - w / 2) / v.s + v.cx, v.cy - (py - h / 2) / v.s],
      worldXform: (g) => g.setTransform(dpr * v.s, 0, 0, -dpr * v.s, dpr * (w / 2 - v.cx * v.s), dpr * (h / 2 + v.cy * v.s)),
      screenXform: (g) => g.setTransform(dpr, 0, 0, dpr, 0, 0),
    };
  }

  /** Lleva la vista a `to` con una transición suave (inmediata si se prefiere menos movimiento). */
  private animateTo(to: View, dur = 650) {
    const v = this.v;
    if (this.reducedMotion || (Math.abs(v.cx - to.cx) < 1e-3 && Math.abs(v.cy - to.cy) < 1e-3 && Math.abs(v.s - to.s) < 1e-3)) {
      this.tw = null; this.v = { ...to }; this.invalidate(); return;
    }
    this.tw = { from: { ...v }, to, t0: performance.now(), dur };
  }

  private stepTween(now: number) {
    const tw = this.tw!;
    const k = Math.min(1, (now - tw.t0) / tw.dur);
    const e = easeInOut(k);
    const ls = Math.log(tw.from.s) + (Math.log(tw.to.s) - Math.log(tw.from.s)) * e;
    this.v = { cx: tw.from.cx + (tw.to.cx - tw.from.cx) * e, cy: tw.from.cy + (tw.to.cy - tw.from.cy) * e, s: Math.exp(ls) };
    if (k >= 1) this.tw = null;
    this.dirty = true;
  }

  invalidate() { this.dirty = true; }

  private size() { return { w: this.canvas.clientWidth || 800, h: this.canvas.clientHeight || 500 }; }

  fitWorld() {
    const { w, h } = this.size();
    const s = Math.min(w / 345, h / 140);
    const to = { cx: 8, cy: 22, s: Math.max(0.5, s) };
    if (this.touched && this.drawnKey) this.animateTo(to, 750);
    else { this.tw = null; this.v = to; this.invalidate(); }
  }

  fitLocal(id: Id) {
    const fr = localFrame(id);
    const { w, h } = this.size();
    const bw = fr.bbox.x1 - fr.bbox.x0, bh = fr.bbox.y1 - fr.bbox.y0;
    const s = Math.min((w * 0.82) / Math.max(1, bw), (h * 0.78) / Math.max(1, bh));
    const to = { cx: (fr.bbox.x0 + fr.bbox.x1) / 2, cy: (fr.bbox.y0 + fr.bbox.y1) / 2, s: Math.min(140, s) };
    if (this.drawnKey) this.animateTo(to, 700);
    else { this.v = to; this.invalidate(); }
  }

  focus(id: Id) {
    this.touched = true;
    const p = labelPoint(id);
    const cur = this.tw?.to ?? this.v;
    this.animateTo({ cx: p[0], cy: p[1], s: Math.max(cur.s, 4) }, 800);
  }

  /**
   * Encuadre «cinematográfico» de una acción: si los puntos se ven demasiado pequeños o quedan fuera,
   * acerca y centra la cámara suavemente (nunca aleja más de lo que ya está).
   */
  frame(pts: Pt[], maxScale = 6) {
    if (this.host.view !== 'world' || !pts.length) return;
    const { w, h } = this.size();
    const x0 = Math.min(...pts.map((p) => p[0])), x1 = Math.max(...pts.map((p) => p[0]));
    const y0 = Math.min(...pts.map((p) => p[1])), y1 = Math.max(...pts.map((p) => p[1]));
    const cur = this.tw?.to ?? this.v;
    const fit = Math.min((w * 0.5) / Math.max(4, x1 - x0), (h * 0.42) / Math.max(3, y1 - y0));
    // Acerca si se ve pequeño; aleja solo lo justo para que quepan ambos extremos
    const s = Math.max(0.6, Math.min(Math.max(cur.s, Math.min(maxScale, fit)), fit * 1.6));
    const inside = pts.every((p) => {
      const sx = (p[0] - cur.cx) * s + w / 2, sy = (cur.cy - p[1]) * s + h / 2;
      return sx > w * 0.12 && sx < w * 0.88 && sy > h * 0.2 && sy < h * (w < 600 ? 0.62 : 0.78);
    });
    if (s <= cur.s * 1.15 && s >= cur.s * 0.87 && inside) return;
    this.touched = true;
    this.animateTo({ cx: (x0 + x1) / 2, cy: (y0 + y1) / 2 - (h * (w < 600 ? 0.1 : 0.04)) / s, s }, 900);
  }

  zoom(f: number) {
    this.touched = true;
    const cur = this.tw?.to ?? this.v;
    this.animateTo({ ...cur, s: Math.max(0.6, Math.min(160, cur.s * f)) }, 260);
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
      this.tw = null;
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
      this.tw = null;
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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const key = this.host.view === 'local' ? `L:${this.host.localId}:${this.host.localLayer}` : `W:${this.host.layer}`;
    // Fundido suave al cambiar de capa o de vista: el motor de efectos pinta la imagen anterior desvaneciéndose
    if (this.drawnKey && key !== this.drawnKey && this.canvas.width > 0) {
      const snap = (this.snap ??= document.createElement('canvas'));
      snap.width = this.canvas.width; snap.height = this.canvas.height;
      snap.getContext('2d')!.drawImage(this.canvas, 0, 0);
      this.fx.crossfade(snap);
    }
    this.drawnKey = key;
    if (this.canvas.width !== Math.round(w * dpr) || this.canvas.height !== Math.round(h * dpr)) {
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
    }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.drawOcean(w, h);
    this.drawGraticule(w, h);
    const s = this.v.s;
    ctx.setTransform(dpr * s, 0, 0, -dpr * s, dpr * (w / 2 - this.v.cx * s), dpr * (h / 2 + this.v.cy * s));
    if (this.host.view === 'local' && this.host.localId) this.drawLocal(dpr);
    else this.drawWorld(dpr);
    // Viñeta
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.45, w / 2, h / 2, Math.hypot(w, h) * 0.62);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(2,5,10,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  /** Océano con degradado radial y un brillo suave. */
  private drawOcean(w: number, h: number) {
    const ctx = this.ctx;
    const g = ctx.createRadialGradient(w * 0.5, h * 0.42, 0, w * 0.5, h * 0.5, Math.hypot(w, h) * 0.6);
    g.addColorStop(0, '#173452');
    g.addColorStop(0.45, '#102539');
    g.addColorStop(1, '#081321');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const sh = ctx.createLinearGradient(0, 0, w, h);
    sh.addColorStop(0, 'rgba(120,180,255,0.05)');
    sh.addColorStop(0.5, 'rgba(120,180,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,0.08)');
    ctx.fillStyle = sh;
    ctx.fillRect(0, 0, w, h);
  }

  private drawGraticule(w: number, h: number) {
    const ctx = this.ctx;
    ctx.strokeStyle = 'rgba(140,180,230,0.07)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 4]);
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
    ctx.setLineDash([]);
    // Ecuador algo más visible
    const [, ye] = this.toScreen(0, 0);
    if (ye > 0 && ye < h) { ctx.strokeStyle = 'rgba(140,180,230,0.11)'; ctx.beginPath(); ctx.moveTo(0, ye); ctx.lineTo(w, ye); ctx.stroke(); }
  }

  private layerCtx(): LayerCtx { return { world: this.host.world, player: this.host.player }; }

  private drawWorld(dpr: number) {
    const ctx = this.ctx;
    const world = this.host.world;
    const layer = LAYER_BY_ID[this.host.layer] ?? LAYER_BY_ID.politico;
    const lctx = this.layerCtx();
    const s = this.v.s;
    const land = landPath();
    // Resplandor de las costas
    ctx.lineJoin = 'round';
    for (const [lw, a] of [[11, 0.05], [6, 0.08], [2.6, 0.14]] as const) {
      ctx.lineWidth = lw / s;
      ctx.strokeStyle = `rgba(110,190,255,${a})`;
      ctx.stroke(land);
    }
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
    // Sombreado suave: luz desde el norte, algo de sombra hacia el sur
    const shade = ctx.createLinearGradient(0, 95, 0, -65);
    shade.addColorStop(0, 'rgba(255,255,255,0.10)');
    shade.addColorStop(0.45, 'rgba(255,255,255,0.0)');
    shade.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = shade;
    ctx.fill(land, 'evenodd');
    // Fronteras internas (miembros de bloques) y externas
    ctx.lineWidth = 0.6 / s;
    ctx.strokeStyle = 'rgba(10,12,16,0.3)';
    for (const f of FEATURES) if (world.countries[f.entity]?.isBlock) ctx.stroke(featurePath(f));
    ctx.lineWidth = 1 / s;
    ctx.strokeStyle = BORDER;
    for (const id of world.order) {
      if (world.countries[id].isBlock) for (const f of BY_ENTITY[id] ?? []) ctx.stroke(featurePath(f));
    }
    for (const f of FEATURES) if (!world.countries[f.entity]?.isBlock) ctx.stroke(featurePath(f));
    // Línea de costa nítida
    ctx.lineWidth = 0.8 / s;
    ctx.strokeStyle = 'rgba(190,225,255,0.22)';
    ctx.stroke(land);
    // Hover (el propio país y el seleccionado llevan halo animado en el lienzo de efectos)
    if (this.hovered && this.hovered !== this.host.selected) {
      ctx.save();
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      for (const f of BY_ENTITY[this.hovered] ?? []) ctx.fill(featurePath(f), 'evenodd');
      ctx.strokeStyle = 'rgba(240,239,236,0.7)';
      ctx.lineWidth = 1.4 / s;
      for (const f of BY_ENTITY[this.hovered] ?? []) ctx.stroke(featurePath(f));
      ctx.restore();
    }
    this.drawCapitals(dpr);
    this.drawLabels(dpr);
  }

  /** Capitales como puntos luminosos (la tuya, dorada y más grande). */
  private drawCapitals(dpr: number) {
    const ctx = this.ctx, W = this.host.world, s = this.v.s;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const { w, h } = this.size();
    const pid = this.host.player?.id;
    const r0 = Math.max(1.3, Math.min(2.6, 0.7 + s * 0.28));
    for (const id of W.order) {
      const c = W.countries[id];
      if (!c.alive) continue;
      const big = Math.sqrt(entityArea(id)) * s;
      if (big < 14 && id !== pid) continue;
      const pt = capitalPt(W, id);
      const [x, y] = this.toScreen(pt[0], pt[1]);
      if (x < -10 || y < -10 || x > w + 10 || y > h + 10) continue;
      const mine = id === pid;
      const R = (mine ? 5 : 3.6) * (r0 / 2);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = mine ? 0.8 : 0.28;
      ctx.drawImage(this.fx.glow(mine ? '#ffcf5a' : '#fff1cf'), x - R * 2, y - R * 2, R * 4, R * 4);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = mine ? '#fff3c4' : '#fffaf0';
      ctx.beginPath(); ctx.arc(x, y, mine ? r0 * 1.3 : r0 * 0.75, 0, Math.PI * 2); ctx.fill();
    }
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
