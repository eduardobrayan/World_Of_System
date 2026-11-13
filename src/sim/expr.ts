/**
 * Mini-lenguaje de expresiones para los datos del juego (sin eval).
 *
 *  - Números, rutas con puntos (eco.inflation, groups.workers, target.mil.power)
 *  - Operadores: + - * / % ^, comparaciones, && || !, ternario a ? b : c
 *  - Funciones: min, max, clamp, abs, sqrt, log, log10, exp, round, floor, sign
 *  - Booleanos: true = 1, false = 0
 */
export type Resolver = (path: string) => number;
type Node = (r: Resolver) => number;

const FUNCS: Record<string, (...a: number[]) => number> = {
  min: (...a) => Math.min(...a),
  max: (...a) => Math.max(...a),
  clamp: (x, lo, hi) => Math.max(lo, Math.min(hi, x)),
  abs: Math.abs,
  sqrt: (x) => Math.sqrt(Math.max(0, x)),
  log: (x) => Math.log(Math.max(1e-9, x)),
  log10: (x) => Math.log10(Math.max(1e-9, x)),
  exp: Math.exp,
  round: Math.round,
  floor: Math.floor,
  sign: Math.sign,
};

interface Tok { t: 'num' | 'id' | 'op' | 'end'; v: string }

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t' || c === '\n') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.eE]/.test(src[j])) {
        if ((src[j] === 'e' || src[j] === 'E') && (src[j + 1] === '-' || src[j + 1] === '+')) j++;
        j++;
      }
      out.push({ t: 'num', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      out.push({ t: 'id', v: src.slice(i, j) });
      i = j;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '==', '!=', '&&', '||'].includes(two)) {
      out.push({ t: 'op', v: two });
      i += 2;
      continue;
    }
    if ('+-*/%^<>!()?:,'.includes(c)) {
      out.push({ t: 'op', v: c });
      i++;
      continue;
    }
    throw new Error(`Expresión inválida "${src}": carácter '${c}'`);
  }
  out.push({ t: 'end', v: '' });
  return out;
}

class Parser {
  private p = 0;
  constructor(private toks: Tok[], private src: string) {}
  private peek() { return this.toks[this.p]; }
  private take() { return this.toks[this.p++]; }
  private expect(v: string) {
    const t = this.take();
    if (t.v !== v) throw new Error(`Expresión inválida "${this.src}": se esperaba '${v}'`);
  }
  parse(): Node {
    const n = this.ternary();
    if (this.peek().t !== 'end') throw new Error(`Expresión inválida "${this.src}": sobra '${this.peek().v}'`);
    return n;
  }
  private ternary(): Node {
    const c = this.or();
    if (this.peek().v === '?') {
      this.take();
      const a = this.ternary();
      this.expect(':');
      const b = this.ternary();
      return (r) => (c(r) ? a(r) : b(r));
    }
    return c;
  }
  private or(): Node {
    let l = this.and();
    while (this.peek().v === '||') {
      this.take();
      const a = l, b = this.and();
      l = (r) => (a(r) || b(r) ? 1 : 0);
    }
    return l;
  }
  private and(): Node {
    let l = this.cmp();
    while (this.peek().v === '&&') {
      this.take();
      const a = l, b = this.cmp();
      l = (r) => (a(r) && b(r) ? 1 : 0);
    }
    return l;
  }
  private cmp(): Node {
    let l = this.add();
    for (;;) {
      const op = this.peek().v;
      if (!['<', '<=', '>', '>=', '==', '!='].includes(op)) return l;
      this.take();
      const a = l, b = this.add();
      switch (op) {
        case '<': l = (r) => (a(r) < b(r) ? 1 : 0); break;
        case '<=': l = (r) => (a(r) <= b(r) ? 1 : 0); break;
        case '>': l = (r) => (a(r) > b(r) ? 1 : 0); break;
        case '>=': l = (r) => (a(r) >= b(r) ? 1 : 0); break;
        case '==': l = (r) => (Math.abs(a(r) - b(r)) < 1e-9 ? 1 : 0); break;
        default: l = (r) => (Math.abs(a(r) - b(r)) >= 1e-9 ? 1 : 0);
      }
    }
  }
  private add(): Node {
    let l = this.mul();
    for (;;) {
      const op = this.peek().v;
      if (op !== '+' && op !== '-') return l;
      this.take();
      const a = l, b = this.mul();
      l = op === '+' ? (r) => a(r) + b(r) : (r) => a(r) - b(r);
    }
  }
  private mul(): Node {
    let l = this.unary();
    for (;;) {
      const op = this.peek().v;
      if (op !== '*' && op !== '/' && op !== '%') return l;
      this.take();
      const a = l, b = this.unary();
      if (op === '*') l = (r) => a(r) * b(r);
      else if (op === '/') l = (r) => { const d = b(r); return d === 0 ? 0 : a(r) / d; };
      else l = (r) => { const d = b(r); return d === 0 ? 0 : a(r) % d; };
    }
  }
  private unary(): Node {
    const op = this.peek().v;
    if (op === '-') { this.take(); const a = this.unary(); return (r) => -a(r); }
    if (op === '+') { this.take(); return this.unary(); }
    if (op === '!') { this.take(); const a = this.unary(); return (r) => (a(r) ? 0 : 1); }
    return this.pow();
  }
  private pow(): Node {
    const base = this.atom();
    if (this.peek().v === '^') {
      this.take();
      const e = this.unary();
      return (r) => Math.pow(base(r), e(r));
    }
    return base;
  }
  private atom(): Node {
    const t = this.take();
    if (t.t === 'num') { const v = parseFloat(t.v); return () => v; }
    if (t.v === '(') { const n = this.ternary(); this.expect(')'); return n; }
    if (t.t === 'id') {
      if (t.v === 'true') return () => 1;
      if (t.v === 'false') return () => 0;
      if (this.peek().v === '(') {
        const fn = FUNCS[t.v];
        if (!fn) throw new Error(`Función desconocida '${t.v}' en "${this.src}"`);
        this.take();
        const args: Node[] = [];
        if (this.peek().v !== ')') {
          args.push(this.ternary());
          while (this.peek().v === ',') { this.take(); args.push(this.ternary()); }
        }
        this.expect(')');
        return (r) => fn(...args.map((a) => a(r)));
      }
      const path = t.v;
      return (r) => {
        const v = r(path);
        return Number.isFinite(v) ? v : 0;
      };
    }
    throw new Error(`Expresión inválida "${this.src}": token inesperado '${t.v}'`);
  }
}

const cache = new Map<string, Node>();

export function compile(src: string): Node {
  let n = cache.get(src);
  if (!n) {
    n = new Parser(tokenize(src), src).parse();
    cache.set(src, n);
  }
  return n;
}

/** Evalúa un número o una expresión. */
export function evalExpr(src: string | number | undefined | null, r: Resolver, fallback = 0): number {
  if (src === undefined || src === null || src === '') return fallback;
  if (typeof src === 'number') return src;
  const v = compile(src)(r);
  return Number.isFinite(v) ? v : fallback;
}

/** Comprueba la sintaxis (para validar datos en tests). */
export function validateExpr(src: string): string | null {
  try {
    compile(src);
    return null;
  } catch (e) {
    return (e as Error).message;
  }
}
