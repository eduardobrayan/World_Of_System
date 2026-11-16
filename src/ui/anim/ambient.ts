/**
 * Mapa vivo: lo que se anima de forma continua sobre el mapa mundial mientras dura una situación
 * (no son efectos puntuales): halos del país propio y del seleccionado, frentes de guerra con fogonazos
 * de artillería y columnas de tanques, bloqueos navales, brotes, protestas en tu país y rutas del narco.
 */
import type { Country, Id, World } from '../../sim/types';
import { BY_ENTITY, featurePath, labelPoint, type Pt } from '../geo';
import type { FxEngine, Proj } from './engine';
import { drawBanner, drawShip, drawTank } from './sprites';
import { capitalPt, coastPt } from './anchors';

export interface AmbientHost {
  world: World;
  player: Country | null;
  selected: Id | null;
  layer: string;
  view: 'world' | 'local';
}

const TAU = Math.PI * 2;
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

export class Ambient {
  private frontPos: Record<string, number> = {};
  private narco: { a: Pt; b: Pt; plane: boolean; off: number }[] | null = null;
  private narcoTurn = -1;

  constructor(private e: FxEngine, private host: AmbientHost) {}

  /** Dibuja el mapa vivo. Devuelve true si hay algo que animar. */
  draw(g: CanvasRenderingContext2D, p: Proj, now: number, dt: number): boolean {
    const H = this.host;
    if (H.view !== 'world') return false;
    const t = now / 1000;
    const still = this.e.reduced;
    let anim = false;
    // ---- Halos ----
    p.worldXform(g);
    if (H.player) {
      const breathe = still ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.1);
      g.lineJoin = 'round';
      g.strokeStyle = `rgba(255,214,120,${0.10 + 0.14 * breathe})`;
      g.lineWidth = (7 + 3 * breathe) / p.s;
      for (const f of BY_ENTITY[H.player.id] ?? []) g.stroke(featurePath(f));
      g.strokeStyle = `rgba(255,232,170,${0.75 + 0.2 * breathe})`;
      g.lineWidth = 1.6 / p.s;
      for (const f of BY_ENTITY[H.player.id] ?? []) g.stroke(featurePath(f));
      anim = true;
    }
    if (H.selected && H.selected !== H.player?.id) {
      g.strokeStyle = 'rgba(85,152,231,0.28)';
      g.lineWidth = 8 / p.s;
      for (const f of BY_ENTITY[H.selected] ?? []) g.stroke(featurePath(f));
      g.setLineDash([6 / p.s, 4 / p.s]);
      g.lineDashOffset = still ? 0 : -t * 14 / p.s;
      g.strokeStyle = '#8fc3ff';
      g.lineWidth = 2.2 / p.s;
      for (const f of BY_ENTITY[H.selected] ?? []) g.stroke(featurePath(f));
      g.setLineDash([]);
      anim = true;
    }
    p.screenXform(g);
    // ---- Frentes ----
    if (H.world.wars.length) { this.drawFronts(g, p, t, dt); anim = true; }
    // ---- Brotes ----
    if (this.drawOutbreaks(g, p, t)) anim = true;
    // ---- Protestas en tu país ----
    if (H.player && H.player.soc.protest >= 55) { this.drawProtests(g, p, t, H.player); anim = true; }
    // ---- Narcotráfico ----
    if (H.layer === 'narco') { this.drawNarco(g, p, t); anim = true; }
    return anim && !still;
  }

  private drawFronts(g: CanvasRenderingContext2D, p: Proj, t: number, dt: number) {
    const W = this.host.world, e = this.e;
    let n = 0;
    for (const war of W.wars) {
      const calm = war.ceasefire > 0;
      for (const fr of war.fronts) {
        if (++n > 14) return;
        const aW = capitalPt(W, fr.a), dW = capitalPt(W, fr.d);
        const key = `${war.id}:${fr.a}:${fr.d}`;
        const target = Math.max(0.08, Math.min(0.85, 0.42 - fr.control / 260));
        const cur = this.frontPos[key] ?? target;
        const f = e.reduced ? target : cur + (target - cur) * Math.min(1, dt / 400);
        this.frontPos[key] = f;
        const mW: Pt = [dW[0] + (aW[0] - dW[0]) * f, dW[1] + (aW[1] - dW[1]) * f];
        const A = p.toScreen(aW[0], aW[1]), D = p.toScreen(dW[0], dW[1]), M = p.toScreen(mW[0], mW[1]);
        const dx = D[0] - A[0], dy = D[1] - A[1], len = Math.hypot(dx, dy) || 1;
        const ux = dx / len, uy = dy / len, nx = -uy, ny = ux;
        const ang = Math.atan2(dy, dx);
        const sea = fr.kind === 'sea';
        // Línea de suministro que «marcha» hacia el frente
        g.setLineDash([5 * p.k, 4 * p.k]);
        g.lineDashOffset = calm ? 0 : -t * 22;
        g.strokeStyle = calm ? 'rgba(180,180,170,0.45)' : 'rgba(255,120,100,0.55)';
        g.lineWidth = 1.5 * p.k;
        g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(M[0], M[1]); g.stroke();
        g.setLineDash([]);
        // Línea del frente: trazo irregular perpendicular, incandescente
        const half = (14 + Math.min(16, len * 0.08)) * p.k;
        g.lineCap = 'round';
        for (const [w, col] of [[7, calm ? 'rgba(160,160,150,0.18)' : 'rgba(255,90,40,0.22)'], [2.4, calm ? '#9a9a92' : '#ff7a4a']] as const) {
          g.strokeStyle = col; g.lineWidth = w * p.k;
          g.beginPath();
          for (let i = 0; i <= 8; i++) {
            const s = -1 + (i / 8) * 2;
            const jag = (i % 2 ? 1 : -1) * 2.4 * p.k * (calm ? 0.3 : 1);
            const x = M[0] + nx * half * s + ux * jag, y = M[1] + ny * half * s + uy * jag;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        }
        if (calm) continue;
        // Fogonazos de artillería a lo largo del frente
        if (!e.reduced && Math.random() < dt / 90) {
          const s = rnd(-1, 1), back = rnd(-4, 10) * p.k * (Math.random() < 0.5 ? 1 : -1);
          const fx = M[0] + nx * half * s + ux * back, fy = M[1] + ny * half * s + uy * back;
          const w = p.toWorld(fx, fy);
          e.emit(w[0], w[1], { life: rnd(160, 320), r0: rnd(5, 10), r1: 2, color: Math.random() < 0.5 ? '#ffd27a' : '#ff8a3c', kind: 0 });
          if (Math.random() < 0.35) e.burst(w[0], w[1], 3, { speed: 70, life: 380, r0: 1.1, color: '#ffe0a0', kind: 2, ay: 40 });
          if (Math.random() < 0.22) e.emit(w[0], w[1], { vx: rnd(-5, 5), vy: rnd(-18, -10), life: rnd(1500, 2400), r0: 3, r1: 11, a0: 0.45, color: 'rgba(60,56,54,0.9)', kind: 1 });
        }
        // Proyectiles trazadores cruzando el frente
        if (!e.reduced && Math.random() < dt / 700) {
          const from = Math.random() < 0.6;
          const w0 = p.toWorld(M[0] - ux * (from ? 26 : -26) * p.k + nx * rnd(-half, half), M[1] - uy * (from ? 26 : -26) * p.k + ny * rnd(-half, half));
          const sp = 160;
          e.emit(w0[0], w0[1], { vx: ux * sp * (from ? 1 : -1), vy: uy * sp * (from ? 1 : -1) - 30, ay: 70, life: 420, r0: 1.4, r1: 1, color: '#fff0c0', kind: 2 });
        }
        // Columnas que avanzan: atacante hacia el frente (y más allá si ocupa territorio), defensor en refuerzo
        const reach = 1 + Math.max(0, fr.control) / 160;
        for (let i = 0; i < 3; i++) {
          const k = ((t * 0.07 + i / 3) % 1);
          const along = (len * (1 - f)) * k * reach; // distancia recorrida desde la capital atacante
          const x = A[0] + ux * along + nx * (i - 1) * 4 * p.k, y = A[1] + uy * along + ny * (i - 1) * 4 * p.k;
          const fade = Math.min(1, k * 6, (1 - k) * 6);
          g.globalAlpha = fade;
          if (sea) drawShip(g, x, y, ang, 13 * p.k, 'war');
          else {
            drawTank(g, x, y, ang, 10 * p.k, '#c7774f', '#3b2418');
            if (!e.reduced && Math.random() < dt / 260) {
              const w = p.toWorld(x - ux * 6 * p.k, y - uy * 6 * p.k);
              e.emit(w[0], w[1], { vx: -ux * 8 + rnd(-4, 4), vy: -uy * 8 - 4, life: 900, r0: 2, r1: 6, a0: 0.35, color: 'rgba(170,150,120,0.8)', kind: 1 });
            }
          }
          const k2 = ((t * 0.05 + i / 3 + 0.17) % 1);
          const along2 = (len * f) * k2 * 0.92;
          const x2 = D[0] - ux * along2 - nx * (i - 1) * 4 * p.k, y2 = D[1] - uy * along2 - ny * (i - 1) * 4 * p.k;
          g.globalAlpha = Math.min(1, k2 * 6, (1 - k2) * 6) * 0.9;
          if (sea) drawShip(g, x2, y2, ang + Math.PI, 12 * p.k, 'war');
          else drawTank(g, x2, y2, ang + Math.PI, 9 * p.k, '#6f9fd8', '#1d2f45');
          g.globalAlpha = 1;
        }
      }
      // Bloqueos navales: buques de guerra patrullando la costa del bloqueado
      for (const id of war.blockade ?? []) {
        const c = W.countries[id];
        if (!c) continue;
        const enemy = war.attackers.includes(id) ? war.defenders[0] : war.attackers[0];
        const cp = coastPt(W, c, capitalPt(W, enemy));
        this.drawPatrol(g, p, t, cp);
      }
    }
  }

  private drawPatrol(g: CanvasRenderingContext2D, p: Proj, t: number, at: Pt) {
    const [x, y] = p.toScreen(at[0], at[1]);
    for (let i = 0; i < 3; i++) {
      const a = t * 0.35 + (i / 3) * TAU;
      const sx = x + Math.cos(a) * 24 * p.k, sy = y + Math.sin(a) * 13 * p.k;
      drawShip(g, sx, sy, a + Math.PI / 2, 13 * p.k, 'war');
    }
    g.globalAlpha = 0.5;
    g.setLineDash([3 * p.k, 4 * p.k]);
    g.strokeStyle = '#ff6b5e'; g.lineWidth = 1.2 * p.k;
    g.beginPath(); g.ellipse(x, y, 24 * p.k, 13 * p.k, 0, 0, TAU); g.stroke();
    g.setLineDash([]); g.globalAlpha = 1;
  }

  private drawOutbreaks(g: CanvasRenderingContext2D, p: Proj, t: number): boolean {
    const W = this.host.world, pid = this.host.player?.id;
    const list: { infected: Record<string, number>; human: boolean }[] = [];
    for (const o of W.global.outbreaks ?? []) if (o.detected || o.creator === pid) list.push({ infected: o.infected, human: o.kind === 'humano' });
    if (W.global.pandemic) list.push({ infected: W.global.pandemic.infected, human: true });
    if (!list.length) return false;
    for (const o of list) {
      for (const [id, inf] of Object.entries(o.infected)) {
        if (inf < 0.003 || !W.countries[id]?.alive) continue;
        const c = labelPoint(id);
        const [x, y] = p.toScreen(c[0], c[1]);
        const ph = this.e.reduced ? 0.5 : (t * 0.8 + (id.charCodeAt(0) % 7) / 7) % 1;
        const base = 4 + Math.sqrt(inf / 0.4) * 14;
        const col = o.human ? [240, 165, 124] : [181, 214, 96];
        g.beginPath();
        g.arc(x, y, base * (0.6 + ph * 1.2) * p.k, 0, TAU);
        g.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.75 * (1 - ph)})`;
        g.lineWidth = 2;
        g.stroke();
        if (inf > 0.05) {
          g.globalAlpha = 0.25 + 0.15 * Math.sin(t * 2 + id.length);
          const R = base * 1.6 * p.k;
          g.drawImage(this.e.glow(`rgba(${col[0]},${col[1]},${col[2]},0.9)`, true), x - R, y - R * 0.7, R * 2, R * 1.4);
          g.globalAlpha = 1;
        }
      }
    }
    return true;
  }

  private drawProtests(g: CanvasRenderingContext2D, p: Proj, t: number, c: Country) {
    const cp = capitalPt(this.host.world, c.id);
    const [x, y] = p.toScreen(cp[0], cp[1]);
    const n = Math.min(5, 2 + Math.floor((c.soc.protest - 55) / 12));
    for (let i = 0; i < n; i++) {
      const dx = (i - (n - 1) / 2) * 9, bob = Math.abs(Math.sin(t * 3 + i * 1.3)) * 3;
      drawBanner(g, x + dx * p.k, y - (10 + bob) * p.k, 13 * p.k, Math.sin(t * 2.4 + i) * 0.18, i % 2 ? '#f2c14e' : '#e04f43');
    }
    if (!this.e.reduced && Math.random() < 0.08) {
      const w = p.toWorld(x + rnd(-14, 14) * p.k, y - 8 * p.k);
      this.e.emit(w[0], w[1], { vx: rnd(-8, 8), vy: rnd(-40, -20), ay: 30, life: 600, r0: 1.2, color: '#ffb35c', kind: 2 });
    }
  }

  private narcoRoutes() {
    const W = this.host.world;
    if (this.narco && W.turn - this.narcoTurn < 6) return this.narco;
    this.narcoTurn = W.turn;
    const alive = W.order.map((id) => W.countries[id]).filter((c) => c.alive && c.narco);
    const src = alive.filter((c) => c.narco.production + c.narco.transit > 80).sort((a, b) => (b.narco.production + b.narco.transit) - (a.narco.production + a.narco.transit)).slice(0, 6);
    const dst = alive.filter((c) => c.narco.consumption >= 30).sort((a, b) => b.narco.consumption * Math.sqrt(b.eco.gdp) - a.narco.consumption * Math.sqrt(a.eco.gdp)).slice(0, 6);
    const routes: { a: Pt; b: Pt; plane: boolean; off: number }[] = [];
    for (const s of src) {
      const sp = capitalPt(W, s.id);
      const near = dst.filter((d) => d.id !== s.id).map((d) => ({ d, dist: Math.hypot(capitalPt(W, d.id)[0] - sp[0], capitalPt(W, d.id)[1] - sp[1]) / (d.narco.consumption + 10) })).sort((a, b) => a.dist - b.dist).slice(0, 2);
      near.forEach(({ d }, i) => {
        const dp = capitalPt(W, d.id);
        routes.push({ a: coastPt(W, s, dp), b: coastPt(W, d, sp), plane: (routes.length + i) % 3 === 2, off: Math.random() });
      });
    }
    this.narco = routes.slice(0, 9);
    return this.narco;
  }

  private drawNarco(g: CanvasRenderingContext2D, p: Proj, t: number) {
    for (const r of this.narcoRoutes()) {
      const A = p.toScreen(r.a[0], r.a[1]), B = p.toScreen(r.b[0], r.b[1]);
      const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
      const cx = (A[0] + B[0]) / 2 - (dy / len) * len * 0.12, cy = (A[1] + B[1]) / 2 + (dx / len) * len * 0.12;
      const at = (k: number): Pt => { const u = 1 - k; return [u * u * A[0] + 2 * u * k * cx + k * k * B[0], u * u * A[1] + 2 * u * k * cy + k * k * B[1]]; };
      g.setLineDash([2 * p.k, 6 * p.k]);
      g.strokeStyle = 'rgba(214,120,255,0.38)'; g.lineWidth = 1.3 * p.k;
      g.beginPath(); g.moveTo(A[0], A[1]); g.quadraticCurveTo(cx, cy, B[0], B[1]); g.stroke();
      g.setLineDash([]);
      const k = (t / (r.plane ? 9 : 14) + r.off) % 1;
      const [x, y] = at(k), [x2, y2] = at(Math.min(1, k + 0.01));
      const ang = Math.atan2(y2 - y, x2 - x);
      g.globalAlpha = Math.min(1, k * 8, (1 - k) * 8);
      if (r.plane) {
        g.save(); g.translate(x, y); g.rotate(ang); g.scale(11 * p.k, 11 * p.k);
        g.fillStyle = '#e2d7ff';
        g.beginPath(); g.moveTo(0.5, 0); g.lineTo(-0.4, -0.08); g.lineTo(-0.1, -0.5); g.lineTo(-0.2, 0); g.lineTo(-0.1, 0.5); g.lineTo(-0.4, 0.08); g.closePath(); g.fill();
        g.restore();
      } else drawShip(g, x, y, ang, 9 * p.k, 'boat', '#e8dcff');
      g.globalAlpha = 1;
    }
  }
}
