/** Modelo de datos del estado del mundo. Todo es JSON puro (serializable). */
import type { RngState } from './rng';

export type Id = string;
export type Dict<T> = Record<string, T>;

export const COMMODITIES = ['oil', 'gas', 'minerals', 'food', 'chips'] as const;
export type Commodity = (typeof COMMODITIES)[number];

export const GROUPS = ['workers', 'business', 'military', 'youth', 'religious', 'minorities'] as const;
export type GroupId = (typeof GROUPS)[number];

export const BUDGET_ITEMS = [
  'defense', 'education', 'health', 'pensions', 'social', 'infrastructure', 'research', 'security', 'administration', 'subsidies',
] as const;
export type BudgetItem = (typeof BUDGET_ITEMS)[number];

export const TAXES = ['income', 'corporate', 'consumption', 'tariff'] as const;
export type TaxId = (typeof TAXES)[number];

export const SECTORS = ['agriculture', 'energy', 'industry', 'tech', 'services'] as const;
export type Sector = (typeof SECTORS)[number];

export const UNIT_TYPES = [
  'infantry', 'mechanized', 'tanks', 'artillery', 'recon',
  'fighters', 'transport', 'helicopters', 'awacs',
  'frigates', 'destroyers', 'submarines', 'carriers', 'logistic',
] as const;
export type UnitType = (typeof UNIT_TYPES)[number];

export const MINISTRIES = [
  'economy', 'defense', 'interior', 'foreign', 'education', 'health', 'industry', 'transport', 'energy', 'agriculture',
] as const;
export type Ministry = (typeof MINISTRIES)[number];

export interface Contribution { label: string; value: number }

/** Modificador activo con duración (meses; -1 = permanente). */
export interface Modifier {
  id: string;
  name: string;
  source: string;
  remaining: number;
  mods: Dict<number>;
}

export interface Party { id: string; name: string; ideology: string; seats: number; gov: boolean }

export interface Minister {
  ministry: Ministry;
  name: string;
  competence: number; // 0..100
  loyalty: number; // 0..100
  profile: 'tecnocrata' | 'leal' | 'grupo';
  group?: GroupId;
  since: number;
}

export interface Economy {
  gdp: number; // miles de millones USD constantes 2026 (anual)
  growth: number; // % anual efectivo
  potentialGrowth: number;
  outputGap: number;
  inflation: number;
  inflationExpect: number;
  cbTarget: number;
  unemployment: number;
  naturalUnemployment: number;
  debt: number; // miles de millones
  debtRate: number; // tipo medio de la deuda %
  riskPremium: number;
  reserves: number; // miles de millones
  policyRate: number;
  rateEma: number; // tipo real medio (6 meses)
  currency: number; // índice real (100 = 2026)
  currencyHist: number[]; // últimos 12 meses
  reserveCurrency: boolean;
  euro: boolean; // miembro de una unión monetaria (las reservas propias importan menos)
  taxes: Record<TaxId, number>;
  taxEfficiency: number;
  budget: Record<BudgetItem, number>; // % PIB
  revenue: number; // miles de millones/año (último cálculo)
  spending: number;
  interest: number;
  deficit: number; // % PIB
  structDeficit: number;
  extraSpending: number; // miles de millones este mes (obras, operaciones…) anualizado
  exports: number; // % PIB
  imports: number;
  currentAccount: number; // % PIB
  baseExports: number;
  baseImports: number;
  tradeAccess: number; // 0..1
  tradeLoss: number;
  tradeLossAdapted: number;
  investment: number; // % PIB
  sectors: Record<Sector, number>; // % PIB
  defaulted: number; // turno del último impago (-999 si nunca)
  defaults: number;
  hyperMonths: number;
  calibGrowth: number;
  calibPot: number;
  calibInfl: number;
  calibRevenueBase: number;
  calibDebtRate: number;
  calibInvest: number;
  calibRate: number;
  nonCommExports: number; // miles de millones/año (exportaciones no ligadas a materias primas)
  nonCommImports: number;
  aidIn: number; // ayuda exterior recibida (miles de millones/año)
  aidOut: number;
  infra: number; // índice de infraestructuras 0..100
  stateResourceShare: number; // parte de la renta de recursos que va al Estado
}

export interface ResourceState {
  prod: number;
  cons: number;
  baseProd: number;
  baseCons: number;
  capacityGrowth: number; // % anual de inversión en capacidad
}

export interface Society {
  pop: number; // millones
  birth: number; // ‰
  death: number; // ‰
  migration: number; // ‰
  medianAge: number;
  education: number; // 0..100
  health: number;
  gini: number;
  urban: number;
  satisfaction: number;
  trust: number; // confianza institucional
  protest: number; // 0..100
  strikes: number;
  calibEdu: number;
  calibHealth: number;
  calibGini: number;
  refugees: number; // millones acogidos recientes
}

export interface GroupState {
  support: number;
  calib: number;
  radical: number; // 0..100 radicalización
}

export interface Politics {
  regime: string;
  ideology: string;
  leaderTitle: string;
  leaderName: string;
  govParty: string;
  parties: Party[];
  nextElection: number; // turno; -1 si no hay
  lastElection: number;
  corruption: number; // 0..100 (alto = peor)
  pressFreedom: number; // 0..100
  stability: number;
  legitimacy: number;
  approval: number;
  powerBase: number;
  coupRisk: number; // %/mes
  revolutionRisk: number;
  ap: number; // capital político acumulado
  apIncome: number;
  policies: Dict<number>; // nivel actual de cada política
  flags: Dict<number>;
  ministers: Minister[];
  cooldowns: Dict<number>; // acción → turno disponible
  calibStab: number;
  repression: number; // 0..100 temporal
  emergency: number; // meses restantes de estado de emergencia
  warWeariness: number;
  electionManip: number;
}

export interface Military {
  units: Record<UnitType, number>;
  baseUnits: Record<UnitType, number>;
  tech: number;
  morale: number;
  readiness: number;
  logistics: number;
  nukes: number;
  doctrine: string;
  mobilization: number; // 0..3
  production: { unit: UnitType; qty: number; remaining: number; cost: number }[];
  deployments: Dict<number>; // país → poder desplegado (fracción 0..1 del ejército terrestre)
  power: number;
  landPower: number;
  airPower: number;
  navalPower: number;
  upkeep: number; // miles de millones/año
  procurement: number; // fondos acumulados para reposición automática
  personnel: number; // miles de efectivos
  nuclearPosture: number; // 0..4 nivel de alerta
  casualties: number; // miles acumulados
}

export interface IntelOp {
  id: string;
  op: string;
  target: Id;
  remaining: number;
  success: number;
  discovery: number;
  started: number;
}

export interface Intel {
  level: number;
  counter: number;
  networks: Dict<number>; // país → penetración 0..100
  ops: IntelOp[];
}

export interface TechState {
  level: number; // 0..100
  done: string[];
  current: string | null;
  progress: number;
  points: number; // por mes
  renewables: number; // % del mix energético
  stolen: number;
}

export interface Region {
  id: string;
  name: string;
  city: string;
  lon: number;
  lat: number;
  popShare: number;
  coastal: boolean;
  terrain: string;
  spec: string;
  capital: boolean;
  geoName?: string; // para bloques: nombre del territorio Natural Earth
  owner: Id;
  controller: Id;
  buildings: Dict<number>;
  baseBuildings: Dict<number>;
  queue: { building: string; remaining: number; total: number }[];
  dev: number; // factor relativo de desarrollo
  // indicadores (recalculados cada turno)
  pop: number;
  unemployment: number;
  production: number;
  infra: number;
  quality: number;
  security: number;
  education: number;
  health: number;
  taxes: number;
  development: number;
  damage: number; // daños de guerra/desastres 0..100
  fx: Dict<number>; // efectos acumulados de edificios construidos tras el inicio
}

export interface Memory {
  about: Id;
  kind: string;
  value: number; // impacto en confianza/opinión
  turn: number;
  halfLife: number;
  text: string;
}

export interface AIState {
  personality: string;
  aggression: number;
  pragmatism: number;
  riskAversion: number;
  reliability: number;
  ambition: number;
  ideologyZeal: number;
  rivals: Id[];
  claims: Id[];
  sphere: Id[];
  redLines: string[];
  lastDecisions: AIDecision[];
  threat: Dict<number>;
  targetDefense: number;
}

export interface AIDecision {
  turn: number;
  actor: Id;
  action: string;
  target?: Id;
  score: number;
  accepted?: boolean;
  text: string;
  reasons: string[];
}

export interface Snapshot {
  t: number;
  gdp: number;
  growth: number;
  inflation: number;
  unemployment: number;
  debt: number;
  deficit: number;
  approval: number;
  stability: number;
  power: number;
  pop: number;
  protest: number;
  reserves: number;
  currency: number;
}

export interface Country {
  id: Id;
  name: string;
  short: string;
  isBlock: boolean;
  color: string;
  flag: { stripes: string[]; dir: 'h' | 'v'; emblem?: string; canton?: string };
  capital: string;
  area: string; // área cultural para nombres
  terrain: string;
  hazards: Dict<number>;
  eco: Economy;
  res: Record<Commodity, ResourceState>;
  soc: Society;
  groups: Record<GroupId, GroupState>;
  pol: Politics;
  mil: Military;
  intel: Intel;
  tech: TechState;
  regions: Region[];
  mods: Modifier[];
  memory: Memory[];
  ai: AIState;
  explain: Dict<Contribution[]>;
  history: Snapshot[];
  shocks: { key: string; label: string; value: number }[]; // efectos transitorios de este mes
  base: Dict<number>; // valores de referencia iniciales (calibración)
  alive: boolean;
  reputation: number; // 0..100 reputación global
  annexedBy?: Id;
}

export interface Relation { op: number; trust: number; base: number }

export interface Treaty {
  id: string;
  type: string; // alliance | defense | nonaggression | trade | energy | cooperation | ceasefire | aid
  parties: Id[];
  start: number;
  end: number; // -1 indefinido
  name: string;
  terms?: Dict<number | string>;
}

export interface Organization {
  id: string;
  name: string;
  short: string;
  type: 'military' | 'economic' | 'political' | 'universal';
  members: Id[];
  veto: Id[];
  council: Id[];
  tradeBonus: number;
  mutualDefense: boolean;
  color: string;
}

export interface Resolution {
  id: string;
  org: string;
  turn: number;
  kind: string; // condemn | sanction | climate | peace | aid
  target?: Id;
  proposer: Id;
  text: string;
  votes: Dict<'si' | 'no' | 'abs'>;
  passed: boolean;
  vetoedBy?: Id;
}

export interface Sanction { by: Id; target: Id; level: number; start: number; multilateral?: string }

export interface Front {
  a: Id; // atacante
  d: Id; // defensor
  kind: 'land' | 'sea';
  control: number; // % del territorio del defensor controlado por el atacante (0..100); negativo = contraofensiva en suelo atacante
  momentum: number;
}

export interface War {
  id: string;
  name: string;
  attackers: Id[];
  defenders: Id[];
  leaderA: Id;
  leaderD: Id;
  start: number;
  fronts: Front[];
  score: number; // -100..100 (positivo favorece atacantes)
  exhaustionA: number;
  exhaustionD: number;
  casualtiesA: number;
  casualtiesD: number;
  goal: string; // territory | regime | punitive | defense
  ceasefire: number; // meses restantes de alto el fuego
  nuclear: number; // nivel máximo de escalada alcanzado
  blockade: Id[];
}

export interface NewsItem { turn: number; text: string; type: string; countries: Id[]; importance: number }

export interface PendingEvent {
  uid: string;
  id: string;
  country: Id;
  turn: number;
  vars: Dict<string | number>;
}

export interface Scheduled {
  turn: number;
  country: Id;
  source: string;
  effects: EffectDef[];
  mods?: ModifierDef[];
  text?: string;
  target?: Id;
}

export interface Incident {
  turn: number;
  actor: Id;
  target: Id;
  kind: string;
  magnitude: number;
  text: string;
}

export interface Proposal {
  id: string;
  from: Id;
  to: Id;
  kind: string;
  terms: Dict<number | string>;
  turn: number;
  text: string;
}

export interface GlobalState {
  tension: number; // 0..100
  temperature: number; // anomalía ºC
  emissions: number;
  pandemic: { name: string; severity: number; infected: Dict<number>; months: number; vaccine: number } | null;
  worldGrowth: number;
  worldGrowth0?: number;
  worldInflation: number;
  worldRealRate: number;
}

export interface MarketState {
  price: Record<Commodity, number>;
  base: Record<Commodity, number>;
  supply: Record<Commodity, number>;
  demand: Record<Commodity, number>;
  history: Record<Commodity, number[]>;
  shock: Record<Commodity, number>;
  ema: Record<Commodity, number>; // media móvil larga del precio
  access: Record<Commodity, number>; // fracción del suministro accesible al mercado
}

export interface PlayerState {
  country: Id;
  difficulty: 'facil' | 'normal' | 'dificil';
  objective: string;
  objectiveStart: Dict<number>;
  objectiveHistory: { turn: number; objective: string; reason: string }[];
  actionsThisTurn: number;
  intelAccuracy: Dict<number>;
}

export interface GameOver {
  turn: number;
  victory: boolean;
  reason: string;
  text: string;
}

export interface World {
  version: number;
  seed: string;
  rng: RngState;
  turn: number;
  countries: Dict<Country>;
  order: Id[];
  rel: Dict<Dict<Relation>>;
  trade: Dict<Dict<number>>; // comercio base i→j (miles de millones/año)
  treaties: Treaty[];
  orgs: Dict<Organization>;
  resolutions: Resolution[];
  sanctions: Sanction[];
  tariffs: Dict<Dict<number>>; // aranceles bilaterales extra (%)
  wars: War[];
  market: MarketState;
  global: GlobalState;
  scheduled: Scheduled[];
  pendingEvents: PendingEvent[];
  chains: { id: string; country: Id; turn: number; target?: Id }[]; // eventos encadenados programados
  eventCooldowns: Dict<number>; // "pais:evento" → turno
  incidents: Incident[];
  proposals: Proposal[];
  news: NewsItem[];
  aiLog: AIDecision[];
  timeline: { turn: number; text: string; kind: string }[];
  player: PlayerState | null;
  gameOver: GameOver | null;
  uid: number;
  worldHistory: { t: number; gdp: number; oil: number; tension: number; temp: number; wars: number }[];
  forecast?: boolean;
}

// ---- Definiciones de datos ----

export interface EffectDef {
  path?: string;
  add?: number | string;
  mul?: number | string;
  set?: number | string;
  hidden?: boolean;
  type?: string; // relation | news | event | memory | modifier | target | sanction...
  target?: string; // self | target | allies | all
  value?: number | string;
  text?: string;
  id?: string;
  in?: number;
}

export interface ModifierDef {
  id: string;
  name: string;
  duration: number;
  mods: Dict<number | string>;
  target?: 'self' | 'target';
}

export interface Requirement { expr: string; text: string }

export interface ActionDef {
  id: string;
  name: string;
  category: string;
  desc: string;
  target: 'none' | 'foreign' | 'region' | 'self';
  requires?: Requirement[];
  targetRequires?: Requirement[];
  parliament?: boolean;
  cost: { ap?: number; money?: number | string; reputation?: number };
  effects?: EffectDef[];
  targetEffects?: EffectDef[];
  delayed?: { in: number; effects: EffectDef[]; mods?: ModifierDef[]; text?: string }[];
  modifiers?: ModifierDef[];
  groups?: Partial<Record<GroupId, number>>;
  risks?: string[];
  handler?: string;
  params?: Dict<number | string | boolean>;
  incident?: { kind: string; magnitude: number };
  cooldown?: number;
  ai?: { utility: string; maxPerYear?: number };
  regimes?: string[];
  hidden?: boolean;
}

export interface PolicyLevel {
  name: string;
  desc: string;
  mods: Dict<number>;
  groups: Partial<Record<GroupId, number>>;
}

export interface PolicyDef {
  id: string;
  name: string;
  category: string;
  desc: string;
  levels: PolicyLevel[];
  default: string | number;
  ap: number;
  parliament: boolean;
}

export interface EventOption {
  text: string;
  effects?: EffectDef[];
  targetEffects?: EffectDef[];
  delayed?: { in: number; effects: EffectDef[]; mods?: ModifierDef[]; text?: string }[];
  modifiers?: ModifierDef[];
  groups?: Partial<Record<GroupId, number>>;
  requires?: string;
  ai?: string;
  hint?: string;
}

export interface EventDef {
  id: string;
  title: string;
  text: string;
  scope: 'country' | 'global' | 'pair';
  category: string;
  condition?: string;
  weight: string | number;
  cooldown: number;
  once?: boolean;
  options: EventOption[];
  pickTarget?: string; // para eventos con otro país implicado
  news?: string;
}
