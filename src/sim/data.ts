/** Carga tipada de los datos del juego (src/data/*.json). */
import countriesJson from '../data/countries.json';
import blocksJson from '../data/blocks.json';
import regionsJson from '../data/regions.json';
import regimesJson from '../data/regimes.json';
import ideologiesJson from '../data/ideologies.json';
import commoditiesJson from '../data/commodities.json';
import unitsJson from '../data/units.json';
import buildingsJson from '../data/buildings.json';
import namesJson from '../data/names.json';
import groupsJson from '../data/groups.json';
import personalitiesJson from '../data/personalities.json';
import organizationsJson from '../data/organizations.json';
import relationsJson from '../data/relations.json';
import adjacencyJson from '../data/geo/adjacency.json';
import policiesJson from '../data/policies.json';
import techsJson from '../data/techs.json';
import type { BudgetItem, Commodity, Dict, GroupId, PolicyDef, Sector, TaxId, UnitType } from './types';

export interface RawCountry {
  id: string;
  name: string;
  short: string;
  color: string;
  flag: { stripes: string[]; dir: 'h' | 'v'; emblem?: string; canton?: string };
  capital: string;
  area: string;
  regime: string;
  ideology: string;
  personality: string;
  leaderTitle?: string;
  nextElection?: string | null;
  parties?: { name: string; ideology: string; seats: number; gov?: boolean }[];
  eco: {
    gdp: number; growth: number; inflation: number; unemployment: number; debt: number; deficit: number;
    reserves: number; rate: number; revenue: number; reserveCurrency?: boolean; euro?: boolean;
    taxes?: Partial<Record<TaxId, number>>; budget?: Partial<Record<BudgetItem, number>>;
    exports: number; imports: number; investment: number; sectors?: Partial<Record<Sector, number>>;
  };
  res: Record<Commodity, [number, number]>;
  soc: {
    pop: number; birth: number; death: number; migration: number; medianAge: number; education: number;
    health: number; gini: number; corruption: number; pressFreedom: number;
  };
  approval: number;
  stability: number;
  mil: { tech: number; morale: number; nukes: number; doctrine: string; units?: Partial<Record<UnitType, number>> };
  milScale?: number;
  intel: [number, number];
  techLevel: number;
  renewables: number;
  terrain: string;
  hazards: Dict<number>;
  rivals: string[];
  claims: string[];
  sphere: string[];
  members?: RawRegion[];
  label?: [number, number];
}

export interface RawRegion {
  n: string; c: string; lon?: number; lat?: number; p: number; coast: number; t: string; s: string; cap?: number; geo?: string;
}

export interface RegimeDef {
  name: string; parliament: boolean; elections: boolean; competitive: boolean; electionInterval: number;
  coupFactor: number; apBonus: number; stabilityBase: number; repressionCost: number; pressCap: number;
  cbIndependent: boolean; parliamentBonus: number; influence: Record<GroupId, number>; legitimacy: number;
}

export interface IdeologyDef {
  name: string; color: string; econ: number; auth: number; nat: number; relig: number;
  prefs: { tax: number; welfare: number; defense: number; education: number; health: number; research: number; infrastructure: number; press: number; regulation: number; migration: number; green: number };
  groups: Record<GroupId, number>;
}

export interface CommodityDef {
  id: Commodity; name: string; unit: string; price: number; priceLabel: string; valueFactor: number;
  elasticity: number; supplyResponse: number; demandResponse: number; strategic: boolean; energy: boolean;
}

export interface UnitDef { id: UnitType; name: string; domain: 'land' | 'air' | 'sea'; power: number; cost: number; upkeep: number; build: number; personnel: number; icon: string; desc: string }

export interface BuildingDef {
  id: string; name: string; icon: string; cost: number; months: number; upkeep: number; category: string; ministry: string; desc: string;
  coastal?: boolean; notTerrain?: string[]; spec?: string[]; minTech?: number; requiresBuilding?: string;
  effects: Dict<number>;
}

export interface GroupDef { name: string; icon: string; popWeight: number; desc: string; factors: { label: string; expr: string }[] }

export interface PersonalityDef {
  name: string; aggression: number; pragmatism: number; riskAversion: number; reliability: number; ambition: number; ideologyZeal: number;
  priorities: Dict<number>; redLines: string[];
}

export interface OrgDef {
  id: string; name: string; short: string; type: 'military' | 'economic' | 'political' | 'universal';
  members: string[] | '*'; veto: string[]; council: string[]; tradeBonus: number; mutualDefense: boolean; color: string; cartel?: string;
}

export interface RelationsDef {
  pairs: [string, string, number][];
  treaties: { type: string; parties: string[]; name: string }[];
  aid: { from: string; to: string; amount: number }[];
  sanctions: { by: string; target: string; level: number }[];
  wars: { name: string; attackers: string[]; defenders: string[]; start: number; goal: string; occupied: string[]; control: number; exhaustionA: number; exhaustionD: number }[];
  tariffs: { by: string; target: string; value: number }[];
}

export interface TechDef {
  id: string; name: string; branch: string; tier: number; cost: number; req: string[]; start: number; minEdu: number; desc: string; mods: Dict<number>;
}

export interface PolicyData extends PolicyDef { overrides?: Dict<number> }

export interface AdjacencyEntity { land: string[]; sea: string[]; coastal: boolean; centroid: [number, number]; bbox: [number, number, number, number] }

export const DATA = {
  countries: countriesJson as unknown as RawCountry[],
  blocks: blocksJson as unknown as RawCountry[],
  regions: regionsJson as unknown as Dict<RawRegion[]>,
  regimes: regimesJson as unknown as Dict<RegimeDef>,
  ideologies: Object.fromEntries(Object.entries(ideologiesJson).filter(([k]) => !k.startsWith('_'))) as unknown as Dict<IdeologyDef>,
  commodities: commoditiesJson as unknown as CommodityDef[],
  units: unitsJson as unknown as UnitDef[],
  buildings: buildingsJson as unknown as BuildingDef[],
  names: namesJson as unknown as Dict<{ first: string[]; last: string[] }>,
  groups: groupsJson as unknown as Record<GroupId, GroupDef>,
  personalities: Object.fromEntries(Object.entries(personalitiesJson).filter(([k]) => !k.startsWith('_'))) as unknown as Dict<PersonalityDef>,
  organizations: organizationsJson as unknown as OrgDef[],
  relations: relationsJson as unknown as RelationsDef,
  adjacency: (adjacencyJson as unknown as { entities: Dict<AdjacencyEntity> }).entities,
  featureCentroids: (adjacencyJson as unknown as { features: Dict<[number, number]> }).features,
  policies: policiesJson as unknown as PolicyData[],
  techs: (techsJson as unknown as { techs: TechDef[] }).techs,
  techBranches: (techsJson as unknown as { branches: Dict<string> }).branches,
};

export const POLICY_BY_ID: Dict<PolicyData> = Object.fromEntries(DATA.policies.map((p) => [p.id, p]));
export const TECH_BY_ID: Dict<TechDef> = Object.fromEntries(DATA.techs.map((t) => [t.id, t]));

export const UNIT_BY_ID: Dict<UnitDef> = Object.fromEntries(DATA.units.map((u) => [u.id, u]));
export const BUILDING_BY_ID: Dict<BuildingDef> = Object.fromEntries(DATA.buildings.map((b) => [b.id, b]));
export const COMMODITY_BY_ID: Dict<CommodityDef> = Object.fromEntries(DATA.commodities.map((c) => [c.id, c]));

export function regimeOf(id: string): RegimeDef {
  return DATA.regimes[id] ?? DATA.regimes.hibrido;
}

export function ideologyOf(id: string): IdeologyDef {
  return DATA.ideologies[id] ?? DATA.ideologies.conservador;
}

export function personalityOf(id: string): PersonalityDef {
  return DATA.personalities[id] ?? DATA.personalities.bloque_regional;
}
