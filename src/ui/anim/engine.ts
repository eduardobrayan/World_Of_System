/**
 * Motor de efectos del mapa: un lienzo superpuesto (sin eventos de puntero) que se redibuja a 60 fps
 * mientras hay algo que animar. Los efectos viven en coordenadas del mapa y se proyectan en cada
 * fotograma, así que siguen el zoom y el desplazamiento. Partículas con reserva (pool) reutilizable.
 * Solo presentación: no lee ni escribe el estado de la simulación.
 */
import type { Pt } from '../geo';

/** Proyección del mapa en el fotograma actual (la proporciona MapView). */
export interface Proj {
  s: number; // escala (px por unidad de mapa)
  w: number; h: number; // tamaño CSS del lienzo
  dpr: number;
  k: number; // factor de tamaño de los sprites según el zoom (≈0.75..1.5)
  toScreen(x: number, y: number): Pt;
  toWorld(px: number, py: number): Pt;
  /** Fija en el contexto la transformación mundo → pantalla (para trazar Path2D del mapa). */
  worldXform(g: CanvasRenderingContext2D): void;
  screenXform(g: CanvasRenderingContext2D): void;
}

export interface Fx {
  t0: number; // inicio (performance.now)
  dur: number;
  /** k = 0..1 progreso; el = ms desde el inicio; dt = ms desde el fotograma anterior */
  draw(g: CanvasRenderingContext2D, p: Proj, k: number, el: number, dt: number, e: FxEngine): void;
  start?(e: FxEngine): void;
  started?: boolean;
  under?: boolean; // se dibuja por debajo de las partículas
}

export type PKind = 0 | 1 | 2 | 3 | 4; // 0 brillo aditivo · 1 humo · 2 chispa (línea) · 3 confeti · 4 punto
export interface Particle {
  wx: number; wy: number; // ancla en el mapa
  x: number; y: number; // desplazamiento en px respecto al ancla
  vx: number; vy: number; // px/s
  ax: number; ay: number; // px/s²
  drag: number; // fracción de velocidad que se pierde por segundo
  life: number; age: number; // ms
  r0: number; r1: number; // radio inicial y final (px)
  a0: number; // opacidad inicial
  color: string;
  kind: PKind;
  rot: number; vr: number;
}

export interface Emit {
  x?: number; y?: number; vx?: number; vy?: number; ax?: number; ay?: number; drag?: number;
  life: number; r0: number; r1?: number; a0?: number; color: string; kind?: PKind; rot?: number; vr?: number;
}

const TAU = Math.PI * 2;

export class FxEngine {
  private g: CanvasRenderingContext2D;
  private fx: Fx[] = [];
  private live: Particle[] = [];
  private pool: Particle[] = [];
  private raf = 0;
  private last = 0;
  private frame = 0;
  private sprites = new Map<string, HTMLCanvasElement>();
  private shakeUntil = 0;
  private shakeAmp = 0;
  private flashUntil = 0;
  private flashStart = 0;
  private flashColor = '#fff';
  private wasDrawn = false;
  private visible = typeof document === 'undefined' || !document.hidden;
  readonly reduced: boolean;
  readonly mobile: boolean;
  readonly maxParticles: number;
  /** Dibujo continuo del mapa vivo (frentes, halos, brotes, ambiente). Devuelve true si necesita animarse. */
  live2?: (g: CanvasRenderingContext2D, p: Proj, now: number, dt: number) => boolean;
  /** Imagen previa del mapa para el fundido al cambiar de capa. */
  private fade: { img: HTMLCanvasElement; t0: number; dur: number } | null = null;

  constructor(private canvas: HTMLCanvasElement, private proj: () => Proj, private shakeTargets: HTMLElement[] = []) {
    this.g = canvas.getContext('2d')!;
    this.reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.mobile = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
    this.maxParticles = this.reduced ? 120 : this.mobile ? 450 : 1100;
    document.addEventListener('visibilitychange', this.onVis);
    this.raf = requestAnimationFrame(this.loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    document.removeEventListener('visibilitychange', this.onVis);
    this.fx.length = 0;
    this.live.length = 0;
    this.pool.length = 0;
    for (const t of this.shakeTargets) t.style.transform = '';
    this.canvas.remove();
  }

  private onVis = () => {
    this.visible = !document.hidden;
    if (this.visible && !this.raf) { this.last = 0; this.raf = requestAnimationFrame(this.loop); }
  };

  get busy() { return this.fx.length + this.live.length; }

  /** Añade un efecto que empieza dentro de `delay` ms. */
  add(f: Omit<Fx, 't0'> & { delay?: number }): Fx {
    const fx = f as Fx;
    fx.t0 = performance.now() + (f.delay ?? 0);
    this.fx.push(fx);
    if (this.fx.length > 160) this.fx.splice(0, this.fx.length - 160);
    return fx;
  }

  /** Emite una partícula anclada al punto (wx, wy) del mapa. */
  emit(wx: number, wy: number, o: Emit) {
    if (this.live.length >= this.maxParticles) return;
    const p = this.pool.pop() ?? ({} as Particle);
    p.wx = wx; p.wy = wy;
    p.x = o.x ?? 0; p.y = o.y ?? 0;
    p.vx = o.vx ?? 0; p.vy = o.vy ?? 0;
    p.ax = o.ax ?? 0; p.ay = o.ay ?? 0;
    p.drag = o.drag ?? 0;
    p.life = o.life; p.age = 0;
    p.r0 = o.r0; p.r1 = o.r1 ?? o.r0;
    p.a0 = o.a0 ?? 1;
    p.color = o.color; p.kind = o.kind ?? 0;
    p.rot = o.rot ?? Math.random() * TAU; p.vr = o.vr ?? 0;
    this.live.push(p);
  }

  /** Ráfaga radial de partículas. */
  burst(wx: number, wy: number, n: number, o: Emit & { speed: number; spread?: number; dir?: number }) {
    for (let i = 0; i < n; i++) {
      const a = o.dir === undefined ? Math.random() * TAU : o.dir + (Math.random() - 0.5) * (o.spread ?? 1);
      const sp = o.speed * (0.35 + Math.random() * 0.65);
      this.emit(wx, wy, { ...o, vx: Math.cos(a) * sp + (o.vx ?? 0), vy: Math.sin(a) * sp + (o.vy ?? 0), life: o.life * (0.6 + Math.random() * 0.5) });
    }
  }

  shake(amp: number, ms: number) {
    if (this.reduced) return;
    this.shakeAmp = Math.max(this.shakeAmp * (performance.now() < this.shakeUntil ? 1 : 0), amp);
    this.shakeUntil = Math.max(this.shakeUntil, performance.now() + ms);
  }

  flash(color: string, ms: number) {
    this.flashColor = color;
    this.flashStart = performance.now();
    this.flashUntil = this.flashStart + (this.reduced ? Math.min(ms, 250) : ms);
  }

  crossfade(img: HTMLCanvasElement, dur = 420) {
    if (this.reduced) return;
    this.fade = { img, t0: performance.now(), dur };
  }

  /** Sprite de brillo radial (blanco → color → transparente), cacheado por color. */
  glow(color: string, soft = false): HTMLCanvasElement {
    const key = color + (soft ? ':s' : '');
    let c = this.sprites.get(key);
    if (!c) {
      c = document.createElement('canvas');
      c.width = c.height = 64;
      const g = c.getContext('2d')!;
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      if (soft) {
        gr.addColorStop(0, color); gr.addColorStop(0.55, withAlpha(color, 0.45)); gr.addColorStop(1, withAlpha(color, 0));
      } else {
        gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.18, color); gr.addColorStop(0.5, withAlpha(color, 0.35)); gr.addColorStop(1, withAlpha(color, 0));
      }
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      this.sprites.set(key, c);
    }
    return c;
  }

  private loop = (now: number) => {
    if (!this.visible) { this.raf = 0; return; }
    this.raf = requestAnimationFrame(this.loop);
    const dt = this.last ? Math.min(50, now - this.last) : 16;
    this.frame++;
    const active = this.fx.length > 0 || this.live.length > 0 || now < this.flashUntil || !!this.fade;
    // Solo ambiente (frentes, halos): ~30 fps para ahorrar batería; con efectos: 60 fps
    if (!active && this.frame % 2 === 1 && this.wasDrawn) return;
    this.last = now;
    this.render(now, active ? dt : dt * 2);
  };

  /** Fuerza un fotograma (p. ej. tras mover el mapa). */
  redraw() { if (this.visible) this.render(performance.now(), 0); }

  private render(now: number, dt: number) {
    const p = this.proj();
    const c = this.canvas, g = this.g;
    const W = Math.round(p.w * p.dpr), H = Math.round(p.h * p.dpr);
    if (c.width !== W || c.height !== H) { c.width = W; c.height = H; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (this.fade) {
      const k = (now - this.fade.t0) / this.fade.dur;
      if (k >= 1) this.fade = null;
      else {
        g.globalAlpha = 1 - easeInOut(k);
        g.drawImage(this.fade.img, 0, 0, W, H);
        g.globalAlpha = 1;
      }
    }
    let ambient = false;
    if (this.live2) {
      g.save();
      ambient = this.live2(g, p, now, dt);
      g.restore();
    }
    p.screenXform(g);
    // Efectos (los «under» primero)
    const keep: Fx[] = [];
    for (const pass of [true, false]) {
      for (const f of this.fx) {
        if (!!f.under !== pass) continue;
        const el = now - f.t0;
        if (el < 0) continue;
        if (!f.started) { f.started = true; f.start?.(this); }
        if (el >= f.dur) continue;
        g.save();
        try { f.draw(g, p, el / f.dur, el, dt, this); } catch (err) { console.warn('fx', err); f.dur = 0; }
        g.restore();
      }
    }
    for (const f of this.fx) if (now - f.t0 < f.dur) keep.push(f);
    this.fx = keep;
    this.drawParticles(g, p, dt);
    if (now < this.flashUntil) {
      const k = (now - this.flashStart) / (this.flashUntil - this.flashStart);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.max(0, (1 - k) * (1 - k)) * 0.92;
      g.fillStyle = this.flashColor;
      g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
    }
    // Sacudida de pantalla (lienzo base + superpuesto)
    if (this.shakeTargets.length) {
      if (now < this.shakeUntil) {
        const left = (this.shakeUntil - now) / 600;
        const a = this.shakeAmp * Math.min(1, left);
        const tx = (Math.random() - 0.5) * 2 * a, ty = (Math.random() - 0.5) * 2 * a;
        for (const t of this.shakeTargets) t.style.transform = `translate(${tx.toFixed(1)}px,${ty.toFixed(1)}px)`;
      } else if (this.shakeAmp) {
        this.shakeAmp = 0;
        for (const t of this.shakeTargets) t.style.transform = '';
      }
    }
    this.wasDrawn = ambient || this.fx.length > 0 || this.live.length > 0;
  }

  private drawParticles(g: CanvasRenderingContext2D, p: Proj, dt: number) {
    if (!this.live.length) return;
    const s = dt / 1000;
    const keep: Particle[] = [];
    for (const q of this.live) {
      q.age += dt;
      if (q.age >= q.life) { this.pool.push(q); continue; }
      const dr = Math.max(0, 1 - q.drag * s);
      q.vx = (q.vx + q.ax * s) * dr;
      q.vy = (q.vy + q.ay * s) * dr;
      q.x += q.vx * s; q.y += q.vy * s;
      q.rot += q.vr * s;
      keep.push(q);
    }
    this.live = keep;
    g.setTransform(p.dpr, 0, 0, p.dpr, 0, 0);
    // Pasada normal (humo, confeti, puntos) y pasada aditiva (brillos, chispas)
    for (const additive of [false, true]) {
      g.globalCompositeOperation = additive ? 'lighter' : 'source-over';
      for (const q of this.live) {
        const isAdd = q.kind === 0 || q.kind === 2;
        if (isAdd !== additive) continue;
        const k = q.age / q.life;
        const [bx, by] = p.toScreen(q.wx, q.wy);
        const x = bx + q.x * p.k, y = by + q.y * p.k;
        if (x < -60 || y < -60 || x > p.w + 60 || y > p.h + 60) continue;
        const r = (q.r0 + (q.r1 - q.r0) * k) * p.k;
        let a = q.a0 * (q.kind === 1 ? Math.min(1, k * 6) * (1 - k) : 1 - k * k);
        if (a <= 0.01 || r <= 0.1) continue;
        if (a > 1) a = 1;
        g.globalAlpha = a;
        if (q.kind === 0) {
          g.drawImage(this.glow(q.color), x - r, y - r, r * 2, r * 2);
        } else if (q.kind === 1) {
          g.drawImage(this.glow(q.color, true), x - r, y - r, r * 2, r * 2);
        } else if (q.kind === 2) {
          const sp = Math.hypot(q.vx, q.vy) || 1;
          const l = Math.min(14, sp * 0.03 + 2) * p.k;
          g.strokeStyle = q.color; g.lineWidth = r; g.lineCap = 'round';
          g.beginPath(); g.moveTo(x, y); g.lineTo(x - (q.vx / sp) * l, y - (q.vy / sp) * l); g.stroke();
        } else if (q.kind === 3) {
          g.save(); g.translate(x, y); g.rotate(q.rot); g.scale(1, Math.cos(q.rot * 2.3));
          g.fillStyle = q.color; g.fillRect(-r, -r * 0.55, r * 2, r * 1.1); g.restore();
        } else {
          g.fillStyle = q.color; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
      }
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    p.screenXform(g);
  }
}

export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);

/** Cambia la opacidad de un color #rrggbb o rgba(). */
export function withAlpha(color: string, a: number): string {
  if (color.startsWith('#')) {
    const n = color.length === 4 ? color.slice(1).split('').map((c) => c + c).join('') : color.slice(1, 7);
    const v = parseInt(n, 16);
    return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${a})`;
  }
  const m = color.match(/rgba?\(([^)]+)\)/);
  if (m) { const [r, gg, b] = m[1].split(',').map((x) => x.trim()); return `rgba(${r},${gg},${b},${a})`; }
  return color;
}
