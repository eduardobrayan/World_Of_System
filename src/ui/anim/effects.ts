/**
 * Biblioteca de efectos del mapa: misiles, explosiones, armas nucleares, cazas, barcos, aviones de carga,
 * tratados, sanciones, satélites, ciberataques, contagios, protestas, policía, obras, elecciones,
 * golpes y desastres. Todos reciben puntos del mapa (no de pantalla) y se proyectan en cada fotograma.
 */
import type { Pt } from '../geo';
import { easeInOut, easeOut, withAlpha, type FxEngine, type Proj } from './engine';
import { SPR, drawBanner, drawCrane, drawLock, drawParachute, drawSatellite, drawShip, drawSprite } from './sprites';
import { sfx } from '../sound';

const TAU = Math.PI * 2;

export interface Opt { delay?: number; str?: number; color?: string; quiet?: boolean }

// ---------- Utilidades geométricas ----------

/** Curva cuadrática en pantalla entre dos puntos, abombada «hacia arriba» (como una trayectoria balística). */
export function arcOf(a: Pt, b: Pt, lift: number) {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len, ny = dx / len;
  if (ny > 0) { nx = -nx; ny = -ny; }
  const L = Math.min(len * lift, 260);
  const cx = (a[0] + b[0]) / 2 + nx * L, cy = (a[1] + b[1]) / 2 + ny * L;
  return {
    len,
    at(t: number): Pt { const u = 1 - t; return [u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]]; },
    ang(t: number): number { const u = 1 - t; return Math.atan2(2 * u * (cy - a[1]) + 2 * t * (b[1] - cy), 2 * u * (cx - a[0]) + 2 * t * (b[0] - cx)); },
    normal(): Pt { return [nx, ny]; },
  };
}

const worldDist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const fadeIO = (k: number, i = 0.12, o = 0.25) => Math.min(1, k / i, (1 - k) / o);
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

function glowAt(g: CanvasRenderingContext2D, e: FxEngine, p: Proj, x: number, y: number, r: number, color: string, a = 1) {
  g.save();
  g.globalCompositeOperation = 'lighter';
  g.globalAlpha = Math.max(0, Math.min(1, a));
  g.drawImage(e.glow(color), x - r, y - r, r * 2, r * 2);
  g.restore();
  void p;
}

function ring(g: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, a: number, lw: number, squash = 0.62) {
  if (a <= 0 || r <= 0) return;
  g.save();
  g.globalAlpha = Math.min(1, a);
  g.strokeStyle = color; g.lineWidth = lw;
  g.beginPath(); g.ellipse(x, y, r, r * squash, 0, 0, TAU); g.stroke();
  g.restore();
}

/** Texto con contorno oscuro. */
function label(g: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string, a = 1) {
  g.save();
  g.globalAlpha = Math.max(0, Math.min(1, a));
  g.font = `700 ${size.toFixed(1)}px system-ui, "Segoe UI Emoji", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = 'rgba(8,11,16,0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = color; g.fillText(text, x, y);
  g.restore();
}

// ---------- Impactos ----------

export function explosion(e: FxEngine, at: Pt, o: Opt & { size?: number } = {}) {
  const size = (o.size ?? 1) * (o.str ?? 1);
  e.add({
    delay: o.delay, dur: 1500 + size * 500,
    start: (en) => {
      if (!o.quiet) sfx(size > 1.3 ? 'bigboom' : 'boom', Math.min(1, size));
      if (en.reduced) return;
      const n = Math.round(10 + size * 12);
      en.burst(at[0], at[1], n, { speed: 60 * size, life: 700, r0: 9 * size, r1: 3, color: '#ff9a3c', kind: 0, drag: 2.5 });
      en.burst(at[0], at[1], Math.round(n * 0.6), { speed: 30 * size, life: 500, r0: 12 * size, r1: 4, color: '#ffe08a', kind: 0, drag: 3 });
      en.burst(at[0], at[1], Math.round(n * 0.9), { speed: 170 * size, life: 650, r0: 1.4, r1: 0.6, color: '#ffd27a', kind: 2, drag: 1.6, ay: 60 });
      for (let i = 0; i < 4 + size * 5; i++) {
        en.emit(at[0], at[1], { x: rnd(-6, 6) * size, y: rnd(-4, 2) * size, vx: rnd(-10, 10), vy: rnd(-28, -12) * size, drag: 0.6, life: rnd(1600, 2600), r0: 5 * size, r1: 16 * size, a0: 0.55, color: 'rgba(58,52,50,0.9)', kind: 1 });
      }
      if (size >= 1.2) en.shake(3 + size * 2, 380);
    },
    draw(g, p, k) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const S = size * p.k;
      // Destello inicial
      if (k < 0.3) glowAt(g, e, p, x, y, (18 + 40 * (k / 0.3)) * S, '#ffd27a', 1 - k / 0.3);
      // Onda expansiva
      const r = easeOut(Math.min(1, k * 1.4)) * 58 * S;
      ring(g, x, y, r, '#fff1c9', (1 - k * 1.4) * 0.9, 2.2);
      ring(g, x, y, r * 0.72, '#ff8c3a', (1 - k * 1.6) * 0.6, 1.4);
      // Brasa en el suelo
      glowAt(g, e, p, x, y, 10 * S, '#ff5a2a', (1 - k) * 0.7);
    },
  });
}

export function nuke(e: FxEngine, at: Pt, o: Opt = {}) {
  e.add({
    delay: o.delay, dur: 7000,
    start: (en) => {
      sfx('nuke', 1);
      en.flash('#ffffff', 1100);
      en.shake(14, 1500);
      if (en.reduced) return;
      en.burst(at[0], at[1], 40, { speed: 260, life: 1200, r0: 2, r1: 0.6, color: '#ffe6b0', kind: 2, drag: 1.2 });
      en.burst(at[0], at[1], 30, { speed: 120, life: 1400, r0: 18, r1: 6, color: '#ff8a2a', kind: 0, drag: 2 });
    },
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const S = p.k * 1.15;
      const fade = k > 0.7 ? 1 - (k - 0.7) / 0.3 : 1;
      // Ondas expansivas
      for (let i = 0; i < 3; i++) {
        const kk = Math.min(1, (k - i * 0.06) * 2.4);
        if (kk <= 0) continue;
        ring(g, x, y, easeOut(kk) * (230 - i * 50) * S, i ? '#ffb15a' : '#ffffff', (1 - kk) * 0.9, 3 - i * 0.6, 0.5);
      }
      // Bola de fuego en el suelo
      glowAt(g, e, p, x, y, (40 + 30 * Math.min(1, k * 4)) * S, '#ffb347', (1 - k) * 1.1);
      // Hongo
      const rise = easeOut(Math.min(1, k * 2.2));
      const H = 95 * S * rise;
      const capY = y - H;
      const capR = (16 + 26 * rise) * S;
      g.save();
      g.globalAlpha = fade;
      // Tallo
      const sw = (7 + 6 * rise) * S;
      const grad = g.createLinearGradient(0, y, 0, capY);
      grad.addColorStop(0, 'rgba(255,170,80,0.9)'); grad.addColorStop(0.5, 'rgba(150,110,90,0.85)'); grad.addColorStop(1, 'rgba(120,100,95,0.6)');
      g.fillStyle = grad;
      g.beginPath();
      g.moveTo(x - sw * 1.6, y); g.quadraticCurveTo(x - sw * 0.5, y - H * 0.4, x - sw * 0.7, capY + capR * 0.3);
      g.lineTo(x + sw * 0.7, capY + capR * 0.3); g.quadraticCurveTo(x + sw * 0.5, y - H * 0.4, x + sw * 1.6, y);
      g.closePath(); g.fill();
      // Falda de polvo
      g.fillStyle = 'rgba(140,115,100,0.55)';
      g.beginPath(); g.ellipse(x, y, (20 + 50 * rise) * S, (6 + 12 * rise) * S, 0, 0, TAU); g.fill();
      // Sombrero: bocanadas que ruedan
      const t = el / 1000;
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * TAU + t * 0.8;
        const px = x + Math.cos(a) * capR * 0.95;
        const py = capY + Math.sin(a) * capR * 0.42;
        const pr = capR * (0.42 + 0.08 * Math.sin(i * 1.7 + t * 2));
        const lit = Math.sin(a) > 0 ? 1 : 0.6;
        const cg = g.createRadialGradient(px, py - pr * 0.3, pr * 0.1, px, py, pr);
        cg.addColorStop(0, `rgba(${Math.round(255 * lit)},${Math.round(190 * lit)},${Math.round(120 * lit)},0.95)`);
        cg.addColorStop(0.6, 'rgba(150,110,95,0.85)');
        cg.addColorStop(1, 'rgba(90,75,72,0)');
        g.fillStyle = cg;
        g.beginPath(); g.arc(px, py, pr, 0, TAU); g.fill();
      }
      const top = g.createRadialGradient(x, capY - capR * 0.2, 2, x, capY, capR * 1.05);
      top.addColorStop(0, 'rgba(255,236,190,0.95)'); top.addColorStop(0.5, 'rgba(230,150,90,0.8)'); top.addColorStop(1, 'rgba(110,90,85,0)');
      g.fillStyle = top;
      g.beginPath(); g.ellipse(x, capY - capR * 0.1, capR * 1.05, capR * 0.6, 0, 0, TAU); g.fill();
      g.restore();
      if (k < 0.85) label(g, '☢', x, capY - capR - 14 * S, 18 * S, '#ffe14a', Math.min(1, k * 5) * fade);
    },
  });
}

// ---------- Proyectiles y vehículos ----------

/** Misil balístico con estela luminosa y humo; explota al llegar. */
export function missile(e: FxEngine, a: Pt, b: Pt, o: Opt & { nuke?: boolean; size?: number; lift?: number } = {}) {
  const str = o.str ?? 1;
  const flight = Math.max(1000, Math.min(2600, 850 + worldDist(a, b) * 11));
  const color = o.color ?? '#ffb347';
  e.add({
    delay: o.delay, dur: flight,
    start: (en) => {
      if (!o.quiet) sfx('missile', str);
      if (!en.reduced) en.burst(a[0], a[1], 8, { speed: 40, life: 500, r0: 6, r1: 2, color: '#ffcf7a', kind: 0, drag: 3 });
    },
    draw(g, p, k) {
      const A = p.toScreen(a[0], a[1]), B = p.toScreen(b[0], b[1]);
      const c = arcOf(A, B, o.lift ?? 0.38);
      const t = k * k * 0.35 + k * 0.65; // acelera al caer
      const t0 = Math.max(0, t - 0.42);
      g.globalCompositeOperation = 'lighter';
      g.lineCap = 'round';
      const N = 18;
      let [px, py] = c.at(t0);
      for (let i = 1; i <= N; i++) {
        const tt = t0 + ((t - t0) * i) / N;
        const [qx, qy] = c.at(tt);
        const f = i / N;
        g.globalAlpha = f * f * 0.9 * str;
        g.strokeStyle = f > 0.8 ? '#fff3d6' : color;
        g.lineWidth = (0.6 + f * 3.2) * p.k * str;
        g.beginPath(); g.moveTo(px, py); g.lineTo(qx, qy); g.stroke();
        px = qx; py = qy;
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      const [hx, hy] = c.at(t);
      glowAt(g, e, p, hx, hy, 13 * p.k * str, color, 0.95);
      drawSprite(g, SPR.missile, hx, hy, c.ang(t), 15 * p.k * (o.size ?? 1) * str, '#eef0f2', '#3a3f46', 0.08);
      if (!e.reduced && Math.random() < 0.7) {
        const w = p.toWorld(hx, hy);
        e.emit(w[0], w[1], { vx: rnd(-6, 6), vy: rnd(-6, 6), drag: 1, life: rnd(700, 1100), r0: 2.2 * str, r1: 7 * str, a0: 0.4, color: 'rgba(170,170,175,0.8)', kind: 1 });
      }
    },
  });
  if (o.nuke) nuke(e, b, { delay: (o.delay ?? 0) + flight });
  else explosion(e, b, { delay: (o.delay ?? 0) + flight, size: (o.size ?? 1), str, quiet: o.quiet });
  return flight;
}

/** Escuadrilla de cazas en formación con estelas de condensación; sueltan bombas sobre el objetivo. */
export function jets(e: FxEngine, a: Pt, b: Pt, o: Opt & { n?: number; strike?: boolean } = {}) {
  const n = o.n ?? 3, str = o.str ?? 1;
  const dur = Math.max(2200, Math.min(4200, 1700 + worldDist(a, b) * 14));
  e.add({
    delay: o.delay, dur,
    start: () => { if (!o.quiet) sfx('jet', str); },
    draw(g, p, k) {
      const A = p.toScreen(a[0], a[1]), B = p.toScreen(b[0], b[1]);
      // Pasan por encima del objetivo y siguen un poco
      const B2: Pt = [B[0] + (B[0] - A[0]) * 0.18, B[1] + (B[1] - A[1]) * 0.18];
      const c = arcOf(A, B2, 0.12);
      const nrm = c.normal();
      const alpha = fadeIO(k, 0.08, 0.12) * str;
      for (let i = 0; i < n; i++) {
        const side = i === 0 ? 0 : (i % 2 ? 1 : -1) * Math.ceil(i / 2);
        const t = Math.max(0, easeInOut(k) * 1.0 - Math.abs(side) * 0.025);
        const off = side * 11 * p.k;
        const at = (tt: number): Pt => { const q = c.at(tt); return [q[0] + nrm[0] * off, q[1] + nrm[1] * off]; };
        // Estela
        const t0 = Math.max(0, t - 0.3);
        let prev = at(t0);
        g.lineCap = 'round';
        for (let s = 1; s <= 10; s++) {
          const cur = at(t0 + ((t - t0) * s) / 10);
          g.globalAlpha = (s / 10) * 0.5 * alpha;
          g.strokeStyle = '#e8eef7'; g.lineWidth = 1.3 * p.k;
          g.beginPath(); g.moveTo(prev[0], prev[1]); g.lineTo(cur[0], cur[1]); g.stroke();
          prev = cur;
        }
        const [x, y] = at(t);
        g.globalAlpha = alpha;
        // Sombra en el suelo
        g.save(); g.globalAlpha = alpha * 0.3; drawSprite(g, SPR.jet, x + 6 * p.k, y + 9 * p.k, c.ang(t), 15 * p.k * str, '#000'); g.restore();
        drawSprite(g, SPR.jet, x, y, c.ang(t), 15 * p.k * str, o.color ?? '#c9d3de', '#2a3038', 0.05);
        glowAt(g, e, p, x - Math.cos(c.ang(t)) * 8 * p.k, y - Math.sin(c.ang(t)) * 8 * p.k, 4 * p.k, '#ffb36b', alpha * 0.8);
      }
    },
  });
  if (o.strike !== false) {
    const hitAt = (o.delay ?? 0) + dur * 0.78;
    for (let i = 0; i < Math.min(3, n); i++) {
      const j: Pt = [b[0] + rnd(-1.6, 1.6), b[1] + rnd(-1.2, 1.2)];
      explosion(e, j, { delay: hitAt + i * 140, size: 0.7, str, quiet: i > 0 || o.quiet });
    }
  }
  return dur;
}

/** Barco recorriendo una ruta: carguero (comercio), buque de guerra (bloqueo) o lancha (narco). */
export function ship(e: FxEngine, a: Pt, b: Pt, o: Opt & { kind?: 'cargo' | 'war' | 'boat'; dur?: number } = {}) {
  const str = o.str ?? 1;
  const dur = o.dur ?? Math.max(3200, Math.min(6000, 2600 + worldDist(a, b) * 18));
  e.add({
    delay: o.delay, dur, under: true,
    draw(g, p, k) {
      const A = p.toScreen(a[0], a[1]), B = p.toScreen(b[0], b[1]);
      const c = arcOf(A, B, 0.1);
      const t = easeInOut(k);
      const [x, y] = c.at(t), ang = c.ang(t);
      const al = fadeIO(k, 0.1, 0.15) * str;
      // Ruta punteada
      g.globalAlpha = al * 0.35;
      g.setLineDash([2 * p.k, 5 * p.k]);
      g.strokeStyle = o.kind === 'war' ? '#ff8a7a' : '#9fd3ff'; g.lineWidth = 1.2 * p.k;
      g.beginPath();
      for (let i = 0; i <= 24; i++) { const q = c.at(i / 24); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.stroke(); g.setLineDash([]);
      // Estela en V
      g.globalAlpha = al * 0.6;
      g.strokeStyle = 'rgba(220,240,255,0.9)'; g.lineWidth = 1 * p.k;
      const L = 18 * p.k, ca = Math.cos(ang), sa = Math.sin(ang);
      for (const sgn of [-1, 1]) {
        g.beginPath(); g.moveTo(x - ca * 5 * p.k, y - sa * 5 * p.k);
        g.lineTo(x - ca * L - sa * sgn * 6 * p.k, y - sa * L + ca * sgn * 6 * p.k); g.stroke();
      }
      g.globalAlpha = al;
      drawShip(g, x, y, ang, (o.kind === 'boat' ? 10 : 17) * p.k * str, o.kind ?? 'cargo', o.color);
    },
  });
  return dur;
}

/** Avión (de carga, ayuda o visita) con estela punteada. `back`: vuelve al origen. */
export function plane(e: FxEngine, a: Pt, b: Pt, o: Opt & { kind?: 'cargo' | 'small'; back?: boolean; drop?: boolean; dur?: number; tint?: string } = {}) {
  const str = o.str ?? 1;
  const leg = o.dur ?? Math.max(1600, Math.min(3200, 1300 + worldDist(a, b) * 10));
  const total = o.back ? leg * 2 + 500 : leg;
  e.add({
    delay: o.delay, dur: total,
    start: () => { if (!o.quiet) sfx('whoosh', str * 0.7); },
    draw(g, p, k, el) {
      const A = p.toScreen(a[0], a[1]), B = p.toScreen(b[0], b[1]);
      let from = A, to = B, kk = el / leg;
      if (o.back && el > leg) {
        if (el < leg + 500) { kk = 1; } else { from = B; to = A; kk = (el - leg - 500) / leg; }
      }
      kk = Math.min(1, kk);
      const c = arcOf(from, to, 0.22);
      const t = easeInOut(kk);
      const al = (o.back ? fadeIO(k, 0.05, 0.08) : fadeIO(k, 0.08, 0.15)) * str;
      g.globalAlpha = al * 0.6;
      g.setLineDash([3 * p.k, 4 * p.k]);
      g.strokeStyle = o.color ?? '#bfe3ff'; g.lineWidth = 1.4 * p.k; g.lineCap = 'round';
      g.beginPath();
      const t0 = Math.max(0, t - 0.45);
      for (let i = 0; i <= 14; i++) { const q = c.at(t0 + ((t - t0) * i) / 14); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
      g.stroke(); g.setLineDash([]);
      const [x, y] = c.at(t);
      g.globalAlpha = al * 0.28;
      drawSprite(g, o.kind === 'small' ? SPR.smallPlane : SPR.cargo, x + 5 * p.k, y + 8 * p.k, c.ang(t), (o.kind === 'small' ? 15 : 22) * p.k * str, '#000');
      g.globalAlpha = al;
      drawSprite(g, o.kind === 'small' ? SPR.smallPlane : SPR.cargo, x, y, c.ang(t), (o.kind === 'small' ? 15 : 22) * p.k * str, o.tint ?? '#f1f3f5', '#39414b', 0.05);
    },
  });
  if (o.drop) parachutes(e, b, { delay: (o.delay ?? 0) + leg * 0.85, str });
  return total;
}

export function parachutes(e: FxEngine, at: Pt, o: Opt & { n?: number } = {}) {
  const n = o.n ?? 3, str = o.str ?? 1;
  const offs = Array.from({ length: n }, (_, i) => [(i - (n - 1) / 2) * 16 + rnd(-3, 3), rnd(-6, 6), rnd(0, 300)]);
  e.add({
    delay: o.delay, dur: 3000,
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      for (const [dx, dy, d0] of offs) {
        const kk = Math.max(0, Math.min(1, (el - d0) / 2300));
        if (kk <= 0) continue;
        const fall = easeOut(kk);
        const px = x + dx * p.k + Math.sin(el / 300 + dx) * 3 * p.k, py = y + dy * p.k - (1 - fall) * 46 * p.k;
        g.globalAlpha = Math.min(1, (1 - k) * 4) * str;
        if (kk < 0.97) drawParachute(g, px, py - 9 * p.k, 18 * p.k * str, Math.sin(el / 400 + dx) * 0.15);
        else { g.fillStyle = '#b98a4e'; g.fillRect(px - 3 * p.k, py - 3 * p.k, 6 * p.k, 5 * p.k); }
      }
      if (k > 0.75) ring(g, x, y, (k - 0.75) * 4 * 30 * p.k, '#4fd17a', (1 - k) * 4, 2);
    },
  });
}

// ---------- Diplomacia ----------

/** Línea brillante entre dos países con un icono en el centro (alianzas, tratados). */
export function link(e: FxEngine, a: Pt, b: Pt, o: Opt & { icon?: string; dur?: number } = {}) {
  const color = o.color ?? '#7fe0a8', str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: o.dur ?? 3600,
    start: () => { if (!o.quiet) sfx('sign', str); },
    draw(g, p, k, el) {
      const A = p.toScreen(a[0], a[1]), B = p.toScreen(b[0], b[1]);
      const c = arcOf(A, B, 0.18);
      const grow = easeOut(Math.min(1, k / 0.3));
      const al = (k > 0.75 ? (1 - k) / 0.25 : 1) * str;
      g.lineCap = 'round';
      g.globalCompositeOperation = 'lighter';
      for (const [w, a0] of [[9, 0.12], [4, 0.3], [1.6, 0.95]] as const) {
        g.globalAlpha = al * a0;
        g.strokeStyle = w < 2 ? '#f4fff8' : color; g.lineWidth = w * p.k;
        g.beginPath();
        for (let i = 0; i <= 30; i++) { const q = c.at((i / 30) * grow); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
        g.stroke();
      }
      // Chispas que recorren el lazo
      if (grow >= 1) for (let i = 0; i < 3; i++) {
        const tt = ((el / 1400) + i / 3) % 1;
        const [x, y] = c.at(tt);
        glowAt(g, e, p, x, y, 7 * p.k, color, al);
      }
      g.globalCompositeOperation = 'source-over';
      for (const P of [A, B]) ring(g, P[0], P[1], (6 + 10 * ((el / 900) % 1)) * p.k, color, al * (1 - ((el / 900) % 1)), 2, 1);
      if (o.icon && k > 0.25) {
        const [mx, my] = c.at(0.5);
        const pop = Math.min(1, (k - 0.25) / 0.1);
        const sc = (1 + 0.25 * Math.sin(Math.min(1, pop) * Math.PI)) * p.k * str;
        g.globalAlpha = al;
        g.fillStyle = 'rgba(12,18,26,0.92)'; g.strokeStyle = color; g.lineWidth = 2;
        g.beginPath(); g.arc(mx, my, 14 * sc, 0, TAU); g.fill(); g.stroke();
        label(g, o.icon, mx, my + 1, 15 * sc, '#fff', al);
      }
    },
  });
}

/** Sanciones: haz rojo hacia el objetivo, barrera giratoria y candado que cae. */
export function sanction(e: FxEngine, a: Pt | null, b: Pt, o: Opt & { tariff?: boolean } = {}) {
  const str = o.str ?? 1, color = o.color ?? '#ff5e57';
  e.add({
    delay: o.delay, dur: 3400,
    start: () => { if (!o.quiet) sfx('lock', str); },
    draw(g, p, k, el) {
      const B = p.toScreen(b[0], b[1]);
      const al = (k > 0.75 ? (1 - k) / 0.25 : 1) * str;
      if (a) {
        const A = p.toScreen(a[0], a[1]);
        const c = arcOf(A, B, 0.15);
        const grow = easeOut(Math.min(1, k / 0.25));
        g.globalAlpha = al * 0.8; g.setLineDash([6 * p.k, 5 * p.k]); g.lineDashOffset = -el / 30;
        g.strokeStyle = color; g.lineWidth = 2 * p.k;
        g.beginPath();
        for (let i = 0; i <= 24; i++) { const q = c.at((i / 24) * grow); if (i) g.lineTo(q[0], q[1]); else g.moveTo(q[0], q[1]); }
        g.stroke(); g.setLineDash([]);
      }
      // Barrera: anillo de segmentos que gira
      const R = 30 * p.k * str * easeOut(Math.min(1, k / 0.3));
      g.globalAlpha = al;
      g.lineWidth = 4 * p.k; g.strokeStyle = color;
      for (let i = 0; i < 10; i++) {
        const a0 = (i / 10) * TAU + el / 1200;
        g.beginPath(); g.ellipse(B[0], B[1], R, R * 0.62, 0, a0, a0 + TAU / 20); g.stroke();
      }
      g.globalAlpha = al * 0.15; g.fillStyle = color;
      g.beginPath(); g.ellipse(B[0], B[1], R, R * 0.62, 0, 0, TAU); g.fill();
      // Candado que cae con rebote
      const kk = Math.min(1, Math.max(0, (k - 0.15) / 0.25));
      if (kk > 0) {
        const bounce = kk < 1 ? -(1 - easeOut(kk)) * 40 : 0;
        const sq = kk >= 1 && k < 0.45 ? 1 + Math.sin((k - 0.4) * 60) * 0.06 : 1;
        g.globalAlpha = al;
        if (o.tariff) label(g, '🚧', B[0], B[1] - 4 * p.k + bounce * p.k, 22 * p.k * str * sq, '#fff', al);
        else drawLock(g, B[0], B[1] - 8 * p.k + bounce * p.k, 22 * p.k * str * sq, '#ff6b5e');
        if (kk >= 1 && k < 0.42 && !e.reduced && Math.random() < 0.5) {
          e.burst(b[0], b[1], 2, { speed: 80, life: 400, r0: 1.2, color: '#ffb0a8', kind: 2, dir: -Math.PI / 2, spread: 2.4 });
        }
      }
    },
  });
}

// ---------- Inteligencia ----------

/** Satélite espía que orbita sobre el objetivo y lo barre con un cono de escaneo. */
export function satellite(e: FxEngine, a: Pt | null, b: Pt, o: Opt = {}) {
  const str = o.str ?? 1, color = o.color ?? '#b4a9ff';
  e.add({
    delay: o.delay, dur: 4200,
    start: () => { if (!o.quiet) sfx('scan', str * 0.6); },
    draw(g, p, k, el) {
      const B = p.toScreen(b[0], b[1]);
      const al = fadeIO(k, 0.12, 0.25) * str;
      if (a) {
        const A = p.toScreen(a[0], a[1]);
        g.globalAlpha = al * 0.45; g.setLineDash([1.5 * p.k, 5 * p.k]);
        g.strokeStyle = color; g.lineWidth = 1.2 * p.k;
        g.beginPath(); g.moveTo(A[0], A[1]); g.lineTo(B[0], B[1]); g.stroke(); g.setLineDash([]);
      }
      const ang = el / 900;
      const sx = B[0] + Math.cos(ang) * 34 * p.k, sy = B[1] - 42 * p.k + Math.sin(ang) * 10 * p.k;
      // Cono de escaneo
      const grd = g.createLinearGradient(sx, sy, B[0], B[1]);
      grd.addColorStop(0, withAlpha(color, 0.5 * al)); grd.addColorStop(1, withAlpha(color, 0.05 * al));
      g.globalAlpha = 1; g.fillStyle = grd;
      g.beginPath(); g.moveTo(sx, sy); g.lineTo(B[0] - 16 * p.k, B[1]); g.lineTo(B[0] + 16 * p.k, B[1]); g.closePath(); g.fill();
      g.globalAlpha = al * 0.9;
      g.strokeStyle = color; g.lineWidth = 1.4;
      g.beginPath(); g.ellipse(B[0], B[1], 16 * p.k, 6 * p.k, 0, 0, TAU); g.stroke();
      const sc = (el / 700) % 1;
      ring(g, B[0], B[1], (6 + 24 * sc) * p.k, color, al * (1 - sc), 1.4, 0.4);
      g.globalAlpha = al;
      drawSatellite(g, sx, sy, Math.sin(ang) * 0.3, 18 * p.k * str);
      if (k > 0.2 && k < 0.85) label(g, '👁', B[0], B[1] - 14 * p.k, 12 * p.k, color, al * 0.9);
    },
  });
}

/** Ciberataque: rayos digitales irregulares y dígitos binarios sobre el objetivo. */
export function cyber(e: FxEngine, a: Pt, b: Pt, o: Opt = {}) {
  const str = o.str ?? 1, color = o.color ?? '#5cf2d6';
  let seed = 0, bolts: number[][] = [];
  const digits = Array.from({ length: 10 }, () => [rnd(-26, 26), rnd(-20, 10), rnd(0, 1), Math.random() < 0.5 ? 1 : 0]);
  e.add({
    delay: o.delay, dur: 2800,
    start: () => { if (!o.quiet) sfx('cyber', str); },
    draw(g, p, k, el) {
      const A = p.toScreen(a[0], a[1]), B = p.toScreen(b[0], b[1]);
      const al = fadeIO(k, 0.05, 0.25) * str;
      const step = Math.floor(el / 90);
      if (step !== seed) {
        seed = step;
        bolts = [];
        for (let j = 0; j < 2; j++) {
          const pts: number[] = [];
          const n = 14;
          for (let i = 0; i <= n; i++) {
            const t = i / n;
            const jit = i === 0 || i === n ? 0 : rnd(-1, 1) * 16 * Math.sin(t * Math.PI);
            pts.push(t, jit);
          }
          bolts.push(pts);
        }
      }
      const dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      g.globalCompositeOperation = 'lighter';
      g.lineJoin = 'miter';
      for (const pts of bolts) {
        for (const [w, aa] of [[5, 0.18], [1.6, 0.95]] as const) {
          g.globalAlpha = al * aa * (0.6 + Math.random() * 0.4);
          g.strokeStyle = w > 2 ? color : '#e8fffb'; g.lineWidth = w * p.k;
          g.beginPath();
          for (let i = 0; i < pts.length; i += 2) {
            const x = A[0] + dx * pts[i] + nx * pts[i + 1] * p.k, y = A[1] + dy * pts[i] + ny * pts[i + 1] * p.k;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
          }
          g.stroke();
        }
      }
      glowAt(g, e, p, B[0], B[1], 22 * p.k, color, al * (0.5 + 0.5 * Math.sin(el / 60)));
      g.globalCompositeOperation = 'source-over';
      // Dígitos y bloques de interferencia
      g.font = `700 ${(10 * p.k).toFixed(1)}px ui-monospace, monospace`;
      g.textAlign = 'center';
      for (const d of digits) {
        const tt = (el / 1200 + d[2]) % 1;
        g.globalAlpha = al * (1 - tt);
        g.fillStyle = color;
        g.fillText(String(d[3]), B[0] + d[0] * p.k, B[1] + (d[1] - tt * 22) * p.k);
      }
      if (Math.random() < 0.4) {
        g.globalAlpha = al * 0.5; g.fillStyle = Math.random() < 0.5 ? color : '#ff4fd8';
        g.fillRect(B[0] + rnd(-24, 18) * p.k, B[1] + rnd(-14, 12) * p.k, rnd(6, 22) * p.k, 2.5 * p.k);
      }
    },
  });
}

// ---------- Biológico ----------

/** Nube de contagio que se expande (y, si se indica, viaja desde otro país) con el símbolo ☣. */
export function contagion(e: FxEngine, at: Pt, o: Opt & { from?: Pt; dur?: number } = {}) {
  const color = o.color ?? 'rgba(160,214,80,0.9)', str = o.str ?? 1;
  const puffs = Array.from({ length: 9 }, (_, i) => [(i / 9) * TAU + rnd(-0.3, 0.3), rnd(0.5, 1), rnd(0.7, 1.2)]);
  e.add({
    delay: o.delay, dur: o.dur ?? 4200,
    start: () => { if (!o.quiet) sfx('bio', str * 0.7); },
    draw(g, p, k, el) {
      const T = p.toScreen(at[0], at[1]);
      let cx = T[0], cy = T[1], grow = easeOut(Math.min(1, k * 1.6));
      if (o.from) {
        const F = p.toScreen(o.from[0], o.from[1]);
        const tr = easeInOut(Math.min(1, k / 0.45));
        cx = F[0] + (T[0] - F[0]) * tr; cy = F[1] + (T[1] - F[1]) * tr;
        grow = 0.5 + 0.5 * easeOut(Math.max(0, (k - 0.35) / 0.5));
      }
      const al = fadeIO(k, 0.12, 0.3) * str;
      const R = (14 + 26 * grow) * p.k * str;
      for (const [a0, rr, sz] of puffs) {
        const a = a0 + el / 2600;
        const px = cx + Math.cos(a) * R * rr, py = cy + Math.sin(a) * R * rr * 0.6;
        g.globalAlpha = al * 0.55;
        g.drawImage(e.glow(color, true), px - R * 0.7 * sz, py - R * 0.7 * sz, R * 1.4 * sz, R * 1.4 * sz);
      }
      g.globalAlpha = al * 0.5;
      g.drawImage(e.glow(color, true), cx - R, cy - R, R * 2, R * 2);
      label(g, '☣', cx, cy, 16 * p.k * str, '#e9ff9a', al * (0.75 + 0.25 * Math.sin(el / 250)));
    },
  });
}

// ---------- Interior ----------

export function protest(e: FxEngine, at: Pt, o: Opt & { dur?: number } = {}) {
  const str = o.str ?? 1;
  const ban = Array.from({ length: 6 }, (_, i) => [rnd(-26, 26), rnd(-12, 12), rnd(0, TAU), i % 3 === 0 ? '#e04f43' : i % 3 === 1 ? '#f2c14e' : '#f0efec']);
  e.add({
    delay: o.delay, dur: o.dur ?? 3800,
    start: () => { if (!o.quiet) sfx('crowd', str * 0.6); },
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const al = fadeIO(k, 0.12, 0.25) * str;
      g.globalAlpha = al * 0.25; g.fillStyle = '#e04f43';
      g.beginPath(); g.ellipse(x, y + 4 * p.k, 34 * p.k, 14 * p.k, 0, 0, TAU); g.fill();
      for (const [dx, dy, ph, col] of ban as [number, number, number, string][]) {
        const bob = Math.abs(Math.sin(el / 260 + ph)) * 5;
        g.globalAlpha = al;
        drawBanner(g, x + dx * p.k, y + (dy - bob) * p.k, 18 * p.k * str, Math.sin(el / 380 + ph) * 0.2, col);
      }
      if (!e.reduced && Math.random() < 0.25 * str) e.emit(...p.toWorld(x + rnd(-24, 24) * p.k, y + rnd(-8, 8) * p.k) as [number, number], { vx: rnd(-10, 10), vy: rnd(-50, -25), ay: 30, life: 700, r0: 1.4, r1: 0.5, color: '#ffb35c', kind: 2 });
      if (k > 0.1 && k < 0.85) label(g, '✊', x, y - 30 * p.k, 14 * p.k, '#ffd0c8', al);
    },
  });
}

/** Luces azul/rojo de policía girando sobre el país. */
export function police(e: FxEngine, at: Pt, o: Opt = {}) {
  const str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 3600,
    start: () => { if (!o.quiet) sfx('siren', str * 0.6); },
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const al = fadeIO(k, 0.1, 0.25) * str;
      const on = Math.floor(el / 160) % 2;
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + el / 700;
        const px = x + Math.cos(a) * 22 * p.k, py = y + Math.sin(a) * 12 * p.k;
        const blue = (i + on) % 2 === 0;
        glowAt(g, e, p, px, py, (12 + 6 * Math.sin(el / 80 + i)) * p.k, blue ? '#3b7bff' : '#ff3b3b', al);
      }
      ring(g, x, y, (10 + 30 * ((el / 800) % 1)) * p.k, on ? '#5b8fff' : '#ff5b5b', al * (1 - ((el / 800) % 1)), 2);
      if (k > 0.1 && k < 0.85) label(g, '🚓', x, y - 26 * p.k, 14 * p.k, '#fff', al);
    },
  });
}

export function crane(e: FxEngine, at: Pt, o: Opt = {}) {
  const str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 4200,
    start: () => { if (!o.quiet) sfx('build', str * 0.6); },
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const al = fadeIO(k, 0.12, 0.25) * str;
      const rise = easeOut(Math.min(1, k / 0.25));
      g.globalAlpha = al;
      g.save(); g.beginPath(); g.rect(x - 60, y - 80 * p.k, 120, 80 * p.k + 6); g.clip();
      drawCrane(g, x, y - 20 * p.k + (1 - rise) * 40 * p.k, 40 * p.k * str, Math.sin(el / 900) * 0.6);
      g.restore();
      g.globalAlpha = al * 0.4; g.fillStyle = '#c8b28a';
      g.beginPath(); g.ellipse(x, y + 1, 20 * p.k, 5 * p.k, 0, 0, TAU); g.fill();
    },
  });
}

export function confetti(e: FxEngine, at: Pt, o: Opt & { icon?: string } = {}) {
  const str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 2600,
    start: (en) => {
      if (!o.quiet) sfx('cheer', str * 0.6);
      const cols = ['#ff5e57', '#ffd24a', '#4fd17a', '#5aa9ff', '#c58bff', '#ffffff'];
      for (let i = 0; i < 46 * str; i++) {
        const a = -Math.PI / 2 + rnd(-1.1, 1.1);
        const sp = rnd(70, 190);
        en.emit(at[0], at[1], { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ay: 140, drag: 1.4, life: rnd(1400, 2300), r0: rnd(2, 3.4), color: cols[i % cols.length], kind: 3, vr: rnd(-8, 8) });
      }
    },
    draw(g, p, k) {
      const [x, y] = p.toScreen(at[0], at[1]);
      if (o.icon) label(g, o.icon, x, y - 10 * p.k - easeOut(Math.min(1, k * 3)) * 16 * p.k, 18 * p.k, '#fff', fadeIO(k, 0.1, 0.3) * str);
    },
  });
}

/** Humo y fuego (golpe de Estado, revolución, disturbios graves). */
export function smoke(e: FxEngine, at: Pt, o: Opt & { fire?: boolean; dur?: number; icon?: string } = {}) {
  const str = o.str ?? 1;
  const spots = Array.from({ length: 3 }, () => [rnd(-18, 18), rnd(-8, 8)]);
  e.add({
    delay: o.delay, dur: o.dur ?? 4500,
    start: () => { if (!o.quiet) sfx('alert', str * 0.7); },
    draw(g, p, k) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const emitting = k < 0.7;
      for (const [dx, dy] of spots) {
        const sx = x + dx * p.k, sy = y + dy * p.k;
        if (o.fire !== false) glowAt(g, e, p, sx, sy, (8 + Math.random() * 4) * p.k * str, '#ff6a2a', (emitting ? 0.9 : (1 - k) * 3) * str);
        if (emitting && !e.reduced && Math.random() < 0.5) {
          const w = p.toWorld(sx, sy);
          e.emit(w[0], w[1], { vx: rnd(-6, 10), vy: rnd(-34, -20), drag: 0.4, life: rnd(1800, 2600), r0: 4 * str, r1: 15 * str, a0: 0.7, color: 'rgba(48,44,44,0.95)', kind: 1 });
        }
      }
      if (o.icon) label(g, o.icon, x, y - 34 * p.k, 15 * p.k, '#ffd9c8', fadeIO(k, 0.1, 0.3) * str);
    },
  });
}

// ---------- Desastres ----------

export function quake(e: FxEngine, at: Pt, o: Opt = {}) {
  const str = o.str ?? 1;
  const cracks = Array.from({ length: 5 }, () => { const a = rnd(0, TAU); return [a, rnd(14, 26)]; });
  e.add({
    delay: o.delay, dur: 3600,
    start: (en) => { if (!o.quiet) sfx('quake', str); if (str >= 1) en.shake(5, 900); },
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const al = fadeIO(k, 0.05, 0.3) * str;
      for (let i = 0; i < 3; i++) {
        const kk = ((el / 1100) + i / 3) % 1;
        const R = (8 + 46 * kk) * p.k * str;
        g.globalAlpha = al * (1 - kk);
        g.strokeStyle = '#ffb35c'; g.lineWidth = 2;
        g.beginPath();
        for (let s = 0; s <= 36; s++) {
          const a = (s / 36) * TAU;
          const rr = R + (s % 2 ? 2.5 : -2.5) * p.k;
          const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.6;
          if (s) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
      }
      g.globalAlpha = al * 0.8; g.strokeStyle = 'rgba(255,214,150,0.85)'; g.lineWidth = 1.3 * p.k;
      const grow = easeOut(Math.min(1, k * 3));
      for (const [a, L] of cracks) {
        g.beginPath(); g.moveTo(x, y);
        let px = x, py = y;
        for (let s = 1; s <= 4; s++) { px = x + Math.cos(a + (s % 2 ? 0.25 : -0.25)) * L * (s / 4) * grow * p.k; py = y + Math.sin(a + (s % 2 ? 0.25 : -0.25)) * L * (s / 4) * grow * p.k * 0.6; g.lineTo(px, py); }
        g.stroke();
      }
      if (k > 0.1 && k < 0.85) label(g, '🌋', x, y - 30 * p.k, 14 * p.k, '#fff', al);
    },
  });
}

export function hurricane(e: FxEngine, at: Pt, o: Opt = {}) {
  const str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 4600,
    start: () => { if (!o.quiet) sfx('wind', str); },
    draw(g, p, k, el) {
      const [x0, y0] = p.toScreen(at[0], at[1]);
      const x = x0 + (k - 0.5) * 30 * p.k, y = y0 - (k - 0.5) * 12 * p.k;
      const al = fadeIO(k, 0.15, 0.3) * str;
      const R = 40 * p.k * str * easeOut(Math.min(1, k * 3));
      const rot = -el / 380;
      g.lineCap = 'round';
      for (let arm = 0; arm < 4; arm++) {
        for (let s = 0; s < 22; s++) {
          const t = s / 22;
          const a = rot + arm * (TAU / 4) + t * 3.2;
          const r = R * (0.15 + t);
          const a2 = a + 0.16;
          g.globalAlpha = al * (1 - t) * 0.9;
          g.strokeStyle = '#e6f2ff'; g.lineWidth = (5 - t * 4) * p.k;
          g.beginPath(); g.moveTo(x + Math.cos(a) * r, y + Math.sin(a) * r * 0.75); g.lineTo(x + Math.cos(a2) * r * 1.04, y + Math.sin(a2) * r * 1.04 * 0.75); g.stroke();
        }
      }
      g.globalAlpha = al * 0.35;
      g.drawImage(e.glow('rgba(220,235,255,0.9)', true), x - R, y - R * 0.75, R * 2, R * 1.5);
      g.globalAlpha = al; g.fillStyle = '#0f1a26';
      g.beginPath(); g.arc(x, y, 3.5 * p.k, 0, TAU); g.fill();
    },
  });
}

export function flood(e: FxEngine, at: Pt, o: Opt = {}) {
  const str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 4000,
    start: () => { if (!o.quiet) sfx('water', str); },
    draw(g, p, k, el) {
      const [x, y] = p.toScreen(at[0], at[1]);
      const al = fadeIO(k, 0.12, 0.3) * str;
      const R = 34 * p.k * str * easeOut(Math.min(1, k * 2));
      g.globalAlpha = al * 0.45;
      g.drawImage(e.glow('rgba(70,150,255,0.9)', true), x - R * 1.2, y - R * 0.8, R * 2.4, R * 1.6);
      for (let i = 0; i < 3; i++) {
        const kk = ((el / 1300) + i / 3) % 1;
        ring(g, x, y, (6 + 34 * kk) * p.k * str, '#8cc4ff', al * (1 - kk), 1.6, 0.5);
      }
      g.globalAlpha = al; g.strokeStyle = '#bfe0ff'; g.lineWidth = 1.6 * p.k;
      for (let w = 0; w < 3; w++) {
        g.beginPath();
        for (let s = 0; s <= 16; s++) {
          const px = x - 20 * p.k + (s / 16) * 40 * p.k, py = y - 6 * p.k + w * 6 * p.k + Math.sin(s * 0.8 + el / 200 + w) * 2 * p.k;
          if (s) g.lineTo(px, py); else g.moveTo(px, py);
        }
        g.stroke();
      }
      if (k > 0.1 && k < 0.85) label(g, '🌊', x, y - 28 * p.k, 14 * p.k, '#fff', al);
    },
  });
}

// ---------- Genéricos ----------

export function pulse(e: FxEngine, at: Pt, o: Opt & { r?: number } = {}) {
  const color = o.color ?? '#8fc3ff', str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 1700,
    draw(g, p, k) {
      const [x, y] = p.toScreen(at[0], at[1]);
      for (let i = 0; i < 3; i++) {
        const kk = k * 1.3 - i * 0.18;
        if (kk <= 0 || kk >= 1) continue;
        ring(g, x, y, (6 + kk * (o.r ?? 42)) * p.k, color, (1 - kk) * str, 2.5, 1);
      }
      glowAt(g, e, p, x, y, 16 * p.k, color, (1 - k) * 0.6 * str);
    },
  });
}

/** Cartel flotante (píldora) que sube y se desvanece. */
export function floatText(e: FxEngine, at: Pt, text: string, o: Opt & { offset?: number } = {}) {
  const color = o.color ?? '#4fd17a', str = o.str ?? 1;
  e.add({
    delay: o.delay, dur: 2600,
    draw(g, p, k) {
      const [x, y0] = p.toScreen(at[0], at[1]);
      const y = y0 - 26 - easeOut(k) * 34 + (o.offset ?? 0);
      const al = (k < 0.12 ? k / 0.12 : 1 - Math.max(0, (k - 0.65) / 0.35)) * str;
      const pop = k < 0.12 ? 0.85 + 0.15 * (k / 0.12) : 1;
      g.globalAlpha = al;
      g.font = `700 ${(14 * pop).toFixed(1)}px system-ui, "Segoe UI Emoji", sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      const w = g.measureText(text).width + 18, h = 24 * pop;
      g.fillStyle = 'rgba(10,14,20,0.82)';
      g.strokeStyle = withAlpha(color.startsWith('#') ? color : '#ffffff', 0.85);
      g.lineWidth = 1.4;
      g.beginPath(); g.roundRect(x - w / 2, y - h / 2, w, h, h / 2); g.fill(); g.stroke();
      g.fillStyle = color; g.fillText(text, x, y + 0.5);
    },
  });
}
