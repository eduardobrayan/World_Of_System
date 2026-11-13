/** Creación del mundo a partir de los datos y calibración del estado inicial. */
import type {
  BudgetItem, Country, Dict, GroupId, Id, Minister, Region, Relation, Sector, TaxId, UnitType, War, World,
} from './types';
import { BUDGET_ITEMS, COMMODITIES, GROUPS, MINISTRIES, SECTORS, TAXES, UNIT_TYPES } from './types';
import type { RawCountry, RawRegion } from './data';
import { DATA, ideologyOf, personalityOf, regimeOf } from './data';
import { Rng, seedRng } from './rng';
import { clamp, gdppc, ymToTurn } from './util';
import { allied, sanctionLevelOn, setNeighbors } from './vars';
import { commodityValue, initMarket, initTrade, updateTradeAccess } from './market';
import { growthTarget, inflationTarget, potentialGrowth, rawRevenueParts, riskPremiumTarget, taylorRate } from './economy';
import { groupTarget, approvalOf, powerBaseOf, stabilityTarget } from './politics';
import { protestTarget } from './society';
import { MOBILIZATION, computePower, rawUpkeep } from './military';
import { initialBuildings, recomputeFx } from './regions';
import { initPolicies } from './policies';
import { initTech } from './tech';
import { snapshot } from './history';
import { ensureHandlers } from './registry';
import { baselineMetrics } from './goals';
import { initSecurity } from './security';
import { initNeeds } from './needs';

export interface NewGameOptions {
  seed: string;
  player: Id | null;
  difficulty?: 'facil' | 'normal' | 'dificil';
  objective?: string;
  /** Partido del jugador: el que gobierna, otro existente o uno nuevo creado por el jugador. */
  party?: { mode: 'gov' } | { mode: 'existing'; name: string } | { mode: 'new'; name: string; ideology: string; color?: string; leader?: string };
}

const DEFAULT_TAXES = (pc: number): Record<TaxId, number> => pc > 30000
  ? { income: 30, corporate: 24, consumption: 18, tariff: 3 }
  : pc > 10000 ? { income: 22, corporate: 24, consumption: 16, tariff: 7 } : { income: 15, corporate: 25, consumption: 12, tariff: 12 };

const DEFAULT_BUDGET = (pc: number): Record<BudgetItem, number> => pc > 30000
  ? { defense: 1.5, education: 5, health: 7, pensions: 8, social: 5, infrastructure: 2.5, research: 0.8, security: 1.5, administration: 3, subsidies: 1 }
  : pc > 10000
    ? { defense: 2, education: 4.5, health: 4, pensions: 5, social: 3, infrastructure: 3, research: 0.4, security: 1.8, administration: 3, subsidies: 2 }
    : { defense: 1.8, education: 3.5, health: 2, pensions: 1.5, social: 2, infrastructure: 3, research: 0.15, security: 1.5, administration: 2.5, subsidies: 2 };

const UNIT_TEMPLATE: Record<UnitType, number> = {
  infantry: 10, mechanized: 5, tanks: 5, artillery: 4, recon: 2, fighters: 4, transport: 2, helicopters: 4, awacs: 0.5,
  frigates: 4, destroyers: 0.5, submarines: 1, carriers: 0, logistic: 1,
};

const SPEC_DEV: Dict<number> = { servicios: 1.15, tecnologia: 1.3, industria: 1.1, energia: 1.05, mineria: 0.9, agricultura: 0.8, turismo: 0.95 };

function makeRegion(c: Country, raw: RawRegion, idx: number, totalP: number): Region {
  const lonlat = raw.geo ? DATA.featureCentroids[raw.geo] ?? [0, 0] : [raw.lon ?? 0, raw.lat ?? 0];
  return {
    id: `${c.id}_${idx}`,
    name: raw.n,
    city: raw.c,
    lon: lonlat[0],
    lat: lonlat[1],
    popShare: raw.p / totalP,
    coastal: !!raw.coast,
    terrain: raw.t,
    spec: raw.s,
    capital: !!raw.cap,
    geoName: raw.geo,
    owner: c.id,
    controller: c.id,
    buildings: {},
    baseBuildings: {},
    queue: [],
    dev: (SPEC_DEV[raw.s] ?? 1) * (raw.cap ? 1.15 : 1),
    pop: 0, unemployment: 0, production: 0, infra: 0, quality: 0, security: 0, education: 0, health: 0, taxes: 0, development: 0,
    damage: 0,
    fx: {},
  };
}

function buildCountry(raw: RawCountry, isBlock: boolean, rng: Rng): Country {
  const pc = (raw.eco.gdp * 1e9) / (raw.soc.pop * 1e6);
  const taxes = { ...DEFAULT_TAXES(pc), ...(raw.eco.taxes ?? {}) } as Record<TaxId, number>;
  const budget = { ...DEFAULT_BUDGET(pc), ...(raw.eco.budget ?? {}) } as Record<BudgetItem, number>;
  let sectors = raw.eco.sectors as Record<Sector, number> | undefined;
  if (!sectors) {
    const agri = clamp(30 - Math.log10(pc / 500) * 9, 1, 35);
    const energyVal = (Math.max(0, raw.res.oil[0] - raw.res.oil[1]) * 66 * 0.365 + Math.max(0, raw.res.gas[0] - raw.res.gas[1]) * 9 * 0.0353) / raw.eco.gdp * 100;
    const energy = clamp(2 + energyVal * 0.9, 1, 45);
    const tech = clamp(raw.techLevel / 12, 1, 12);
    sectors = { agriculture: agri, energy, industry: 22, tech, services: Math.max(15, 100 - agri - energy - 22 - tech) };
  }
  const sTot = SECTORS.reduce((a, k) => a + (sectors![k] ?? 0), 0);
  const sec = Object.fromEntries(SECTORS.map((k) => [k, ((sectors![k] ?? 0) / sTot) * 100])) as Record<Sector, number>;

  const units = {} as Record<UnitType, number>;
  for (const k of UNIT_TYPES) units[k] = raw.mil.units?.[k] ?? (raw.milScale ? Math.round(UNIT_TEMPLATE[k] * raw.milScale * 10) / 10 : 0);

  const pers = personalityOf(raw.personality);
  const jitter = () => (rng.next() - 0.5) * 0.1;
  const reg = regimeOf(raw.regime);

  const c: Country = {
    id: raw.id, name: raw.name, short: raw.short, isBlock, color: raw.color, flag: raw.flag, capital: raw.capital,
    area: raw.area, terrain: raw.terrain, hazards: raw.hazards ?? {},
    eco: {
      gdp: raw.eco.gdp, growth: raw.eco.growth, potentialGrowth: raw.eco.growth, outputGap: 0,
      inflation: raw.eco.inflation, inflationExpect: raw.eco.inflation, cbTarget: pc > 30000 ? 2 : pc > 10000 ? 3 : 4.5,
      unemployment: raw.eco.unemployment, naturalUnemployment: raw.eco.unemployment,
      debt: (raw.eco.debt * raw.eco.gdp) / 100, debtRate: 3, riskPremium: 0, reserves: raw.eco.reserves,
      policyRate: raw.eco.rate, rateEma: 0, currency: 100, currencyHist: [], reserveCurrency: !!raw.eco.reserveCurrency, euro: !!raw.eco.euro,
      taxes, taxEfficiency: 1, budget, revenue: 0, spending: 0, interest: 0, deficit: raw.eco.deficit, structDeficit: raw.eco.deficit,
      extraSpending: 0, exports: raw.eco.exports, imports: raw.eco.imports, currentAccount: raw.eco.exports - raw.eco.imports,
      baseExports: raw.eco.exports, baseImports: raw.eco.imports, tradeAccess: 1, tradeLoss: 0, tradeLossAdapted: 0,
      investment: raw.eco.investment, sectors: sec, defaulted: (raw.eco as { defaulted?: number }).defaulted ?? -999, defaults: 0, hyperMonths: 0,
      calibGrowth: 0, calibPot: 0, calibInfl: 0, calibRevenueBase: 0, calibDebtRate: 0, calibInvest: 0, calibRate: 0,
      nonCommExports: 0, nonCommImports: 0, aidIn: 0, aidOut: 0,
      infra: clamp(28 + 16 * Math.log10(Math.max(300, pc) / 1000), 12, 92), stateResourceShare: 0.15,
    },
    res: Object.fromEntries(COMMODITIES.map((k) => [k, { prod: raw.res[k][0], cons: raw.res[k][1], baseProd: raw.res[k][0], baseCons: raw.res[k][1], capacityGrowth: 0 }])) as Country['res'],
    soc: {
      pop: raw.soc.pop, birth: raw.soc.birth, death: raw.soc.death, migration: raw.soc.migration, medianAge: raw.soc.medianAge,
      education: raw.soc.education, health: raw.soc.health, gini: raw.soc.gini, urban: clamp(30 + Math.log10(pc / 1000) * 25, 15, 95),
      satisfaction: 50, trust: 50, protest: 0, strikes: 0, calibEdu: 0, calibHealth: 0, calibGini: 0, refugees: 0, needs: {}, pressure: 0,
    },
    groups: Object.fromEntries(GROUPS.map((g) => [g, { support: raw.approval, calib: 0, radical: 20 }])) as Country['groups'],
    pol: {
      regime: raw.regime, ideology: raw.ideology, leaderTitle: raw.leaderTitle ?? (reg.elections ? 'Jefe de Gobierno' : 'Jefe de Estado'),
      leaderName: '', govParty: '', parties: [], nextElection: -1, lastElection: -1,
      corruption: raw.soc.corruption, pressFreedom: raw.soc.pressFreedom, stability: raw.stability, legitimacy: reg.legitimacy,
      approval: raw.approval, powerBase: raw.approval, coupRisk: 0, revolutionRisk: 0, ap: 4, apIncome: 3,
      policies: {}, flags: {}, ministers: [], cooldowns: {}, calibStab: 0, repression: 0, emergency: 0, warWeariness: 0, electionManip: 0,
    },
    mil: {
      units, baseUnits: { ...units }, tech: raw.mil.tech, morale: raw.mil.morale, readiness: 70, logistics: 50, nukes: raw.mil.nukes,
      doctrine: raw.mil.doctrine, mobilization: 0, production: [], deployments: {}, power: 0, landPower: 0, airPower: 0, navalPower: 0,
      upkeep: 0, procurement: 0, personnel: 0, nuclearPosture: 0, casualties: 0, designs: [],
    },
    intel: { level: raw.intel[0], counter: raw.intel[1], networks: {}, ops: [] },
    tech: { level: raw.techLevel, done: [], current: null, progress: 0, points: 0, renewables: raw.renewables, stolen: 0 },
    regions: [],
    mods: [],
    memory: [],
    ai: {
      personality: raw.personality,
      aggression: clamp(pers.aggression + jitter(), 0, 1), pragmatism: clamp(pers.pragmatism + jitter(), 0, 1),
      riskAversion: clamp(pers.riskAversion + jitter(), 0, 1), reliability: clamp(pers.reliability + jitter(), 0, 1),
      ambition: clamp(pers.ambition + jitter(), 0, 1), ideologyZeal: clamp(pers.ideologyZeal + jitter(), 0, 1),
      rivals: [...(raw.rivals ?? [])], claims: [...(raw.claims ?? [])], redLines: [...pers.redLines], lastDecisions: [], threat: {},
      targetDefense: 0, sphere: [...(raw.sphere ?? [])],
    },
    explain: {}, history: [], shocks: [], base: {}, alive: true, reputation: 60,
    police: { size: 300, training: 50, militarization: 30, integrity: 50, crime: 30, effectiveness: 1 },
    corr: { politica: 0, administrativa: 0, judicial: 0, policial: 0, empresarial: 0, electoral: 0 },
    narco: { production: 0, transit: 0, cartels: 0, violence: 0, consumption: 0 },
    bio: { program: 0, lab: 0, defense: 0, designs: [], exposed: -1 },
  };

  // Partidos
  const parties = raw.parties ?? [{ name: 'Gobierno', ideology: raw.ideology, seats: reg.elections ? 55 : 90, gov: true }, { name: 'Oposición', ideology: 'liberal', seats: reg.elections ? 45 : 10 }];
  c.pol.parties = parties.map((p, i) => ({ id: `${raw.id}_p${i}`, name: p.name, ideology: p.ideology, seats: p.seats, gov: !!p.gov }));
  c.pol.govParty = c.pol.parties.find((p) => p.gov)?.name ?? '';

  // Regiones
  const rawRegions = isBlock ? raw.members ?? [] : DATA.regions[raw.id] ?? [];
  const totP = rawRegions.reduce((a, r) => a + r.p, 0) || 1;
  c.regions = rawRegions.map((r, i) => makeRegion(c, r, i, totP));
  if (!c.regions.some((r) => r.capital) && c.regions.length) c.regions[0].capital = true;

  // Apoyo inicial de los grupos según ideología y régimen
  const ideo = ideologyOf(raw.ideology);
  for (const g of GROUPS) {
    let v = raw.approval + (ideo.groups[g] ?? 0) * 0.8;
    if (!reg.competitive) { if (g === 'military') v += 8; if (g === 'youth') v -= 6; if (g === 'minorities') v -= 8; }
    c.groups[g].support = clamp(v, 5, 95);
  }
  const shift = raw.approval - approvalOf(c);
  for (const g of GROUPS) c.groups[g].support = clamp(c.groups[g].support + shift, 3, 97);
  for (const g of GROUPS) c.groups[g].radical = clamp((50 - c.groups[g].support) * 1.2, 0, 100);
  return c;
}

function initRelations(world: World) {
  const ids = world.order;
  const explicit = new Map<string, number>();
  for (const [a, b, v] of DATA.relations.pairs) {
    if (!world.countries[a] || !world.countries[b]) continue;
    explicit.set(`${a}|${b}`, v);
    explicit.set(`${b}|${a}`, v);
  }
  for (const a of ids) {
    world.rel[a] = {};
    for (const b of ids) {
      if (a === b) continue;
      const base = baseRelation(world, world.countries[a], world.countries[b]);
      const ex = explicit.get(`${a}|${b}`);
      const op = ex ?? base;
      const r: Relation = { op, trust: 50, base: op };
      world.rel[a][b] = r;
    }
  }
  for (const a of ids) for (const b of ids) {
    if (a === b) continue;
    const r = world.rel[a][b];
    r.trust = clamp(45 + r.op * 0.35 + (allied(world, a, b) ? 15 : 0), 2, 98);
  }
}

/** Relación "estructural" entre dos países: ideología, régimen, organismos, rivalidad, esfera de influencia. */
export function baseRelation(world: World, a: Country, b: Country): number {
  const ia = ideologyOf(a.pol.ideology), ib = ideologyOf(b.pol.ideology);
  const dist = Math.hypot(ia.econ - ib.econ, (ia.auth - ib.auth) * 1.4, (ia.relig - ib.relig) * 0.6);
  let v = 22 - dist * 18;
  const ra = regimeOf(a.pol.regime), rb = regimeOf(b.pol.regime);
  if (ra.competitive && rb.competitive) v += 8;
  if (!ra.competitive && !rb.competitive) v += 4;
  for (const o of Object.values(world.orgs)) {
    if (o.type === 'universal') continue;
    if (o.members.includes(a.id) && o.members.includes(b.id)) v += o.type === 'military' ? 14 : o.type === 'economic' ? 8 : 5;
  }
  if (a.ai.rivals.includes(b.id) || b.ai.rivals.includes(a.id)) v -= 35;
  if (a.ai.sphere.includes(b.id)) v += 6;
  return clamp(v, -70, 70);
}

function initTreaties(world: World) {
  for (const t of DATA.relations.treaties) {
    if (!t.parties.every((p) => world.countries[p])) continue;
    world.treaties.push({ id: `t${++world.uid}`, type: t.type, parties: [...t.parties], start: 0, end: -1, name: t.name });
  }
  for (const a of DATA.relations.aid) {
    if (!world.countries[a.from] || !world.countries[a.to]) continue;
    world.treaties.push({ id: `t${++world.uid}`, type: 'aid', parties: [a.from, a.to], start: 0, end: -1, name: `Ayuda de ${world.countries[a.from].short} a ${world.countries[a.to].short}`, terms: { amount: a.amount } });
  }
  for (const s of DATA.relations.sanctions) {
    if (!world.countries[s.by] || !world.countries[s.target]) continue;
    world.sanctions.push({ by: s.by, target: s.target, level: s.level, start: 0 });
  }
  for (const t of DATA.relations.tariffs) {
    if (!world.countries[t.by] || !world.countries[t.target]) continue;
    (world.tariffs[t.by] ??= {})[t.target] = t.value;
  }
}

export function applyAidFlows(world: World) {
  for (const c of Object.values(world.countries)) { c.eco.aidIn = 0; c.eco.aidOut = 0; }
  for (const t of world.treaties) {
    if (t.type !== 'aid') continue;
    const amt = Number(t.terms?.amount ?? 0);
    const [from, to] = t.parties;
    if (world.countries[from]?.alive && world.countries[to]?.alive) {
      world.countries[from].eco.aidOut += amt;
      world.countries[to].eco.aidIn += amt;
    }
  }
}

function initWars(world: World) {
  for (const w of DATA.relations.wars) {
    if (![...w.attackers, ...w.defenders].every((x) => world.countries[x])) continue;
    const war: War = {
      id: `w${++world.uid}`, name: w.name, attackers: [...w.attackers], defenders: [...w.defenders], leaderA: w.attackers[0], leaderD: w.defenders[0],
      start: w.start, fronts: [{ a: w.attackers[0], d: w.defenders[0], kind: 'land', control: w.control, momentum: 0 }],
      score: w.control * 0.6, exhaustionA: w.exhaustionA, exhaustionD: w.exhaustionD, casualtiesA: 0, casualtiesD: 0,
      goal: w.goal, ceasefire: 0, nuclear: 0, blockade: [],
    };
    for (const occ of w.occupied) {
      const [cid, rname] = occ.split(':');
      const reg = world.countries[cid]?.regions.find((r) => r.name === rname);
      if (reg) reg.controller = w.attackers[0];
    }
    world.wars.push(war);
    world.countries[w.attackers[0]].mil.mobilization = 2;
    world.countries[w.defenders[0]].mil.mobilization = 3;
    world.countries[w.attackers[0]].pol.warWeariness = w.exhaustionA * 0.6;
    world.countries[w.defenders[0]].pol.warWeariness = w.exhaustionD * 0.6;
  }
}

/** Los nombres de líder se generan al azar: el cargo usa la forma genérica (no «Presidenta Eduardo»). */
const NEUTRAL_TITLES: Record<string, string> = { 'Presidenta': 'Presidente', 'Presidenta del Consejo': 'Presidente del Consejo', 'Primera ministra': 'Primer ministro' };
export function neutralTitle(t: string): string {
  return NEUTRAL_TITLES[t] ?? t;
}

function makeName(rng: Rng, area: string): string {
  const pool = DATA.names[area] ?? DATA.names.anglo;
  return `${rng.pick(pool.first)} ${rng.pick(pool.last)}`;
}

export function generateMinister(rng: Rng, c: Country, ministry: Minister['ministry'], profile: Minister['profile'], turn: number): Minister {
  const pcBonus = clamp(Math.log10(gdppc(c) / 2000) * 8, -5, 12);
  let competence = 40 + rng.next() * 30 + pcBonus - c.pol.corruption * 0.1;
  let loyalty = 50 + rng.next() * 30;
  let group: GroupId | undefined;
  if (profile === 'tecnocrata') { competence += 18; loyalty -= 20; }
  if (profile === 'leal') { competence -= 8; loyalty += 18; }
  if (profile === 'grupo') group = rng.pick([...GROUPS]);
  return { ministry, name: makeName(rng, c.area), competence: clamp(competence, 10, 98), loyalty: clamp(loyalty, 5, 100), profile, group, since: turn };
}

/** Calibra objetivos para que el estado inicial sea casi estacionario. */
function calibrate(world: World, c: Country) {
  const e = c.eco, b = c.base;
  const raw = [...DATA.countries, ...DATA.blocks].find((r) => r.id === c.id)!;
  const pc = gdppc(c);

  // Recursos y comercio exterior
  let commEx = 0, commIm = 0, energyVal = 0;
  for (const k of COMMODITIES) {
    const net = commodityValue(world, k, c.res[k].prod - c.res[k].cons);
    if (net > 0) commEx += net; else commIm -= net;
  }
  for (const k of ['oil', 'gas'] as const) energyVal += commodityValue(world, k, c.res[k].prod);
  e.nonCommExports = Math.max((e.gdp * e.exports) / 100 - commEx, (e.gdp * e.exports) / 100 * 0.25);
  e.nonCommImports = Math.max((e.gdp * e.imports) / 100 - commIm, (e.gdp * e.imports) / 100 * 0.25);
  e.stateResourceShare = e.sectors.energy >= 15 ? 0.65 : e.sectors.energy >= 6 ? 0.3 : 0.12;

  // Deuda: tipo medio inicial
  b.sanc = sanctionLevelOn(world, c.id);
  e.riskPremium = riskPremiumTarget(world, c);
  const dataRate = (raw.eco as unknown as { debtRate?: number }).debtRate;
  const formula = clamp(e.policyRate * 0.7 + 1.0 + e.riskPremium, 0.2, 90);
  const initRate = dataRate ?? clamp(Math.min(formula, 2 + Math.min(e.inflation, 40) * 0.3 + e.riskPremium * 0.5), 0.5, 18);
  e.debtRate = e.reserveCurrency || pc > 40000 ? Math.min(initRate, formula) : initRate;
  e.calibDebtRate = e.debtRate - formula;

  // Ingresos: eficiencia fiscal calibrada para reproducir la recaudación real
  const rawRev = rawRevenueParts(world, c);
  const targetRev = (raw.eco.revenue * e.gdp) / 100;
  const nonTax = rawRev.tariffs + rawRev.resources;
  const eff = (targetRev - nonTax) / Math.max(1, rawRev.taxesAtEff1);
  e.taxEfficiency = clamp(eff, 0.25, 1.6);
  e.calibRevenueBase = targetRev - nonTax - rawRev.taxesAtEff1 * e.taxEfficiency;

  // Gasto: se escalan las partidas para reproducir el déficit inicial
  const interestPct = e.debt * e.debtRate / e.gdp;
  const totalRevPct = raw.eco.revenue + (e.aidIn / e.gdp) * 100;
  const mobCost = MOBILIZATION[c.mil.mobilization].cost;
  const targetBudget = raw.eco.deficit + totalRevPct - interestPct - (e.aidOut / e.gdp) * 100 - mobCost;
  const cur = BUDGET_ITEMS.reduce((a, k) => a + e.budget[k], 0);
  const scale = clamp(targetBudget / cur, 0.35, 2.6);
  for (const k of BUDGET_ITEMS) e.budget[k] = Math.round(e.budget[k] * scale * 100) / 100;

  // Militar: escala de costes para que el mantenimiento sea ~70 % del presupuesto de defensa
  const defenseBn = (e.budget.defense * e.gdp) / 100;
  b.milCostScale = clamp((0.7 * defenseBn) / Math.max(0.05, rawUpkeep(c)), 0.03, 60);
  b.milRatio = 1 / 0.7;
  c.mil.logistics = clamp(25 + 15 * Math.log10(Math.max(500, pc) / 1000) + (c.mil.doctrine === 'expedicionaria' ? 20 : 0), 15, 90);

  initSecurity(world, c);

  // Valores de referencia
  Object.assign(b, {
    gdp: e.gdp, pop: c.soc.pop, gdppc: pc, education: c.soc.education, health: c.soc.health, gini: c.soc.gini,
    birth: c.soc.birth, death: c.soc.death, migration: c.soc.migration, medianAge: c.soc.medianAge,
    unemployment: e.unemployment, inflation: e.inflation, growth: e.growth, stability: c.pol.stability,
    corruption: c.pol.corruption, pressFreedom: c.pol.pressFreedom, techLevel: c.tech.level, renewables: c.tech.renewables,
    investment: e.investment, infra: e.infra, tariff: e.taxes.tariff, tax_income: e.taxes.income, energyValue: energyVal,
    milTech: c.mil.tech, logistics: c.mil.logistics, sanc: sanctionLevelOn(world, c.id), currentAccount: e.exports - e.imports + ((e.aidIn - e.aidOut) / e.gdp) * 100,
  });
  for (const k of BUDGET_ITEMS) b[`budget_${k}`] = e.budget[k];
  for (const k of SECTORS) b[`sector_${k}`] = e.sectors[k];
  for (const k of TAXES) b[`tax_${k}`] = e.taxes[k];

  // Moneda, tipos y expectativas
  e.inflationExpect = e.inflation;
  e.rateEma = clamp(e.policyRate - e.inflation, -8, 12);
  b.rateEma = e.rateEma;
  e.currencyHist = Array(12).fill(100);
  b.business = c.groups.business.support;
  e.calibRate = e.policyRate - taylorRate(c);

  // Sociedad
  c.soc.trust = clamp(100 - c.pol.corruption * 0.65 + (c.pol.pressFreedom - 50) * 0.2, 5, 95);
  c.soc.satisfaction = clamp(c.pol.approval * 0.45 + c.pol.stability * 0.45 + 5, 8, 92);
  c.soc.protest = clamp((60 - c.pol.stability) * 0.8, 0, 80);
  c.soc.strikes = clamp((48 - c.groups.workers.support) * 0.6, 0, 50);
  b.trust = c.soc.trust;
  b.satisfaction = c.soc.satisfaction;
  b.calibProtest = 0;
  b.calibProtest = c.soc.protest - protestTarget(world, c).value;
  const strikeRaw = Math.max(0, (45 - c.groups.workers.support) * 1.5 + Math.max(0, e.inflation - 5) * 0.8 - e.unemployment * 0.4);
  b.calibStrikes = c.soc.strikes - strikeRaw;

  // Economía: calibraciones de crecimiento, inflación y desempleo
  e.naturalUnemployment = e.unemployment + c.mil.mobilization * 0.8;
  e.calibPot = 0;
  e.calibPot = e.growth - potentialGrowth(world, c).value;
  e.potentialGrowth = e.growth;
  e.calibGrowth = 0;
  e.calibGrowth = e.growth - growthTarget(world, c, e.potentialGrowth).value;
  e.calibInfl = 0;
  e.calibInfl = e.inflation - inflationTarget(world, c).value;

  // Política
  c.pol.legitimacy = clamp(regimeOf(c.pol.regime).legitimacy + (c.pol.approval - 50) * 0.2 + (c.soc.trust - 50) * 0.2, 5, 95);
  for (const g of GROUPS) {
    c.groups[g].calib = 0;
    c.groups[g].calib = c.groups[g].support - groupTarget(world, c, g, false).value;
  }
  c.pol.approval = approvalOf(c);
  c.pol.powerBase = powerBaseOf(c);
  c.pol.calibStab = 0;
  c.pol.calibStab = c.pol.stability - stabilityTarget(world, c).value;

  // Regiones: stock inicial de edificios
  for (const r of c.regions) {
    r.buildings = initialBuildings(c, r);
    r.baseBuildings = { ...r.buildings };
    recomputeFx(c, r);
  }
  computePower(c);
  initNeeds(world, c);
}

export function createWorld(opts: NewGameOptions): World {
  ensureHandlers();
  const world: World = {
    version: 2, seed: opts.seed, rng: seedRng(opts.seed), turn: 0, countries: {}, order: [], rel: {}, trade: {},
    treaties: [], orgs: {}, resolutions: [], sanctions: [], tariffs: {}, wars: [],
    market: { price: {} as never, base: {} as never, supply: {} as never, demand: {} as never, history: {} as never, shock: {} as never, ema: {} as never, access: {} as never },
    global: { tension: 45, temperature: 1.45, emissions: 0, pandemic: null, worldGrowth: 3.1, worldInflation: 3.5, worldRealRate: 1.0, outbreaks: [] },
    scheduled: [], pendingEvents: [], chains: [], eventCooldowns: {}, incidents: [], proposals: [], news: [], aiLog: [], timeline: [],
    player: null, gameOver: null, uid: 0, worldHistory: [],
  };
  const rng = new Rng(world.rng);

  const land: Dict<string[]> = {}, sea: Dict<string[]> = {};
  for (const [id, a] of Object.entries(DATA.adjacency)) { land[id] = a.land; sea[id] = a.sea; }
  setNeighbors(land, sea);

  for (const raw of DATA.countries) world.countries[raw.id] = buildCountry(raw, false, rng);
  for (const raw of DATA.blocks) world.countries[raw.id] = buildCountry(raw, true, rng);
  world.order = Object.keys(world.countries).sort();
  if (opts.player && opts.party && opts.party.mode !== 'gov' && world.countries[opts.player]) applyPlayerParty(world.countries[opts.player], opts.party);

  for (const o of DATA.organizations) {
    world.orgs[o.id] = {
      id: o.id, name: o.name, short: o.short, type: o.type, members: o.members === '*' ? [...world.order] : o.members.filter((m) => world.countries[m]),
      veto: o.veto, council: o.council, tradeBonus: o.tradeBonus, mutualDefense: o.mutualDefense, color: o.color,
    };
  }
  initTreaties(world);
  initRelations(world);
  initWars(world);
  applyAidFlows(world);

  // Elecciones y ministros
  for (const id of world.order) {
    const c = world.countries[id];
    const reg = regimeOf(c.pol.regime);
    const raw = [...DATA.countries, ...DATA.blocks].find((r) => r.id === id)!;
    if (reg.elections) {
      const t = ymToTurn(raw.nextElection ?? null);
      c.pol.nextElection = t >= 0 ? t : (raw.nextElection === null ? -1 : rng.int(1, reg.electionInterval));
      c.pol.lastElection = c.pol.nextElection >= 0 ? c.pol.nextElection - reg.electionInterval : -24;
    }
    c.pol.ministers = MINISTRIES.map((m) => generateMinister(rng, c, m, rng.next() < 0.5 ? 'leal' : 'tecnocrata', 0));
    c.pol.leaderName = makeName(rng, c.area);
    c.pol.leaderTitle = neutralTitle(c.pol.leaderTitle);
  }
  if (opts.player && opts.party?.mode === 'new' && opts.party.leader?.trim() && world.countries[opts.player]) world.countries[opts.player].pol.leaderName = opts.party.leader.trim().slice(0, 40);

  initPolicies(world);
  initMarket(world);
  initTrade(world);
  updateTradeAccess(world);
  for (const id of world.order) {
    const c = world.countries[id];
    c.eco.tradeLoss = 1 - Math.min(1, c.eco.tradeAccess);
    c.eco.tradeLossAdapted = c.eco.tradeLoss;
  }
  for (const id of world.order) initTech(world, world.countries[id]);
  for (const id of world.order) calibrate(world, world.countries[id]);
  let gw = 0, gg = 0;
  for (const id of world.order) { gw += world.countries[id].eco.gdp; gg += world.countries[id].eco.gdp * world.countries[id].eco.growth; }
  world.global.worldGrowth = gg / gw;
  world.global.worldGrowth0 = gg / gw;

  if (opts.player && world.countries[opts.player] && !world.countries[opts.player].isBlock) {
    const c = world.countries[opts.player];
    world.player = {
      country: c.id, difficulty: opts.difficulty ?? 'normal', objective: opts.objective ?? 'libre',
      objectiveStart: baselineMetrics(world, c), objectiveHistory: [{ turn: 0, objective: opts.objective ?? 'libre', reason: 'Elegido al inicio' }],
      actionsThisTurn: 0, intelAccuracy: {},
    };
    c.pol.ap = 5;
  }
  world.rng = rng.state;
  for (const id of world.order) snapshot(world, world.countries[id], true);
  return world;
}

/**
 * El jugador gobierna con otro partido existente o con uno nuevo: ese partido acaba de ganar
 * y toma el gobierno y los escaños del anterior (que pasa a la oposición). Se aplica antes de
 * calibrar, así que el punto de partida sigue siendo estable.
 */
export function applyPlayerParty(c: Country, party: NonNullable<NewGameOptions['party']>) {
  if (party.mode === 'gov') return;
  const gov = c.pol.parties.find((p) => p.gov);
  const govSeats = gov?.seats ?? 50;
  let mine = party.mode === 'existing' ? c.pol.parties.find((p) => p.name === party.name) : undefined;
  if (party.mode === 'existing' && !mine) return;
  if (party.mode === 'new') {
    const ideology = DATA.ideologies[party.ideology] ? party.ideology : c.pol.ideology;
    mine = { id: `${c.id}_p${c.pol.parties.length}`, name: party.name.trim().slice(0, 50) || 'Nuevo partido', ideology, seats: 0, gov: false, color: party.color, custom: true, founded: 0 };
    // Un partido nuevo arrebata escaños a todos (sobre todo al gobierno saliente)
    for (const p of c.pol.parties) p.seats *= p.gov ? 0.35 : 0.8;
    const rest = c.pol.parties.reduce((a, p) => a + p.seats, 0);
    mine.seats = Math.max(govSeats, 100 - rest);
    c.pol.parties.push(mine);
  } else if (mine && gov && mine !== gov) {
    const s = mine.seats;
    mine.seats = gov.seats;
    gov.seats = s;
  }
  const tot = c.pol.parties.reduce((a, p) => a + p.seats, 0) || 1;
  for (const p of c.pol.parties) { p.seats = Math.round((p.seats / tot) * 1000) / 10; p.gov = false; }
  mine!.gov = true;
  c.pol.govParty = mine!.name;
  c.pol.ideology = mine!.ideology;
}
