/** Definición de indicadores: nombre, descripción, formato y qué explica su valor (para tooltips). */
import type { Contribution, Country, Snapshot, World } from '../sim/types';
import { DATA } from '../sim/data';
import { gdppc, fmtMoney } from '../sim/util';
import { modParts, sanctionLevelOn } from '../sim/vars';

export interface Indicator {
  key: string;
  name: string;
  desc: string;
  get: (c: Country, w: World) => number;
  fmt: (v: number) => string;
  explain?: (c: Country, w: World) => Contribution[];
  better?: 'up' | 'down';
  hist?: keyof Snapshot;
  noisy?: boolean; // sujeto a incertidumbre de inteligencia
}

const pct = (d = 1) => (v: number) => `${v.toFixed(d)} %`;
const num = (d = 0) => (v: number) => v.toLocaleString('es-ES', { maximumFractionDigits: d, minimumFractionDigits: d });
const ex = (k: string) => (c: Country) => c.explain[k] ?? [];
const mods = (k: string) => (c: Country) => modParts(c, k);

export const IND: Record<string, Indicator> = {
  gdp: { key: 'gdp', name: 'PIB', desc: 'Producto interior bruto anual en dólares constantes de 2026.', get: (c) => c.eco.gdp, fmt: fmtMoney, better: 'up', hist: 'gdp', noisy: true,
    explain: (c) => c.explain.growth ?? [] },
  gdppc: { key: 'gdppc', name: 'PIB per cápita', desc: 'Renta media por habitante (USD). Determina el margen de convergencia y la presión sobre el gasto social.', get: (c) => gdppc(c), fmt: (v) => `${num(0)(v)} $`, better: 'up', noisy: true },
  growth: { key: 'growth', name: 'Crecimiento', desc: 'Crecimiento anualizado del PIB. Converge hacia su objetivo con inercia (25 % al mes).', get: (c) => c.eco.growth, fmt: pct(2), explain: ex('growth'), better: 'up', hist: 'growth', noisy: true },
  potentialGrowth: { key: 'potentialGrowth', name: 'Crecimiento potencial', desc: 'Lo que la economía puede crecer sin generar inflación: depende de demografía, educación, infraestructuras, tecnología, inversión, instituciones e impuestos.', get: (c) => c.eco.potentialGrowth, fmt: pct(2), explain: ex('potentialGrowth'), better: 'up' },
  inflation: { key: 'inflation', name: 'Inflación', desc: 'Subida anual de precios. Depende de las expectativas, la demanda, el tipo de cambio, la energía y los alimentos, y de si se financia el déficit con emisión.', get: (c) => c.eco.inflation, fmt: pct(1), explain: ex('inflation'), better: 'down', hist: 'inflation', noisy: true },
  unemployment: { key: 'unemployment', name: 'Desempleo', desc: 'Tasa de paro. Sigue al ciclo (ley de Okun) y al desempleo estructural, que cambian las reformas, el salario mínimo y la industria regional.', get: (c) => c.eco.unemployment, fmt: pct(1), explain: ex('unemployment'), better: 'down', hist: 'unemployment', noisy: true },
  debt: { key: 'debt', name: 'Deuda pública', desc: 'Deuda del Estado en % del PIB. La inflación la erosiona; los déficits la aumentan. Si es alta, sube la prima de riesgo.', get: (c) => (c.eco.debt / c.eco.gdp) * 100, fmt: pct(0), better: 'down', hist: 'debt', noisy: true,
    explain: (c) => [{ label: 'Prima de riesgo (pp)', value: c.eco.riskPremium }, { label: 'Tipo medio de la deuda (%)', value: c.eco.debtRate }] },
  deficit: { key: 'deficit', name: 'Déficit', desc: 'Gasto público (incluidos intereses) menos ingresos, en % del PIB. Negativo = superávit.', get: (c) => c.eco.deficit, fmt: pct(1), explain: ex('deficit'), better: 'down', hist: 'deficit' },
  revenue: { key: 'revenue', name: 'Ingresos públicos', desc: 'Recaudación anual: impuestos, aranceles, rentas de recursos y ayuda exterior.', get: (c) => c.eco.revenue, fmt: fmtMoney, explain: ex('revenue'), better: 'up' },
  reserves: { key: 'reserves', name: 'Reservas', desc: 'Reservas internacionales del banco central. Sostienen la moneda; si se agotan hay crisis cambiaria.', get: (c) => c.eco.reserves, fmt: fmtMoney, better: 'up', hist: 'reserves', noisy: true },
  rate: { key: 'rate', name: 'Tipo de interés', desc: 'Tipo oficial del banco central. Subirlo enfría la inflación y el crecimiento (con retraso) y fortalece la moneda.', get: (c) => c.eco.policyRate, fmt: pct(2) },
  currency: { key: 'currency', name: 'Moneda (índice)', desc: 'Tipo de cambio real (100 = enero de 2026). Una depreciación encarece las importaciones (inflación) y abarata las exportaciones.', get: (c) => c.eco.currency, fmt: num(1), better: 'up', hist: 'currency' },
  currentAccount: { key: 'currentAccount', name: 'Cuenta corriente', desc: 'Exportaciones menos importaciones (y ayuda exterior), % del PIB.', get: (c) => c.eco.currentAccount, fmt: pct(1), better: 'up' },
  tradeAccess: { key: 'tradeAccess', name: 'Acceso comercial', desc: 'Parte del comercio potencial que fluye hoy (sanciones, aranceles, guerras, bloqueos y acuerdos lo modifican).', get: (c) => c.eco.tradeAccess * 100, fmt: pct(0), better: 'up' },
  approval: { key: 'approval', name: 'Aprobación', desc: 'Apoyo popular al Gobierno: media de los grupos sociales ponderada por su peso demográfico.', get: (c) => c.pol.approval, fmt: num(0), better: 'up', hist: 'approval', noisy: true,
    explain: (c) => Object.entries(c.groups).map(([g, s]) => ({ label: `${DATA.groups[g as keyof typeof DATA.groups].icon} ${DATA.groups[g as keyof typeof DATA.groups].name}`, value: s.support })) },
  stability: { key: 'stability', name: 'Estabilidad', desc: 'Solidez del régimen. Por debajo de 30 se disparan los riesgos de golpe y revolución.', get: (c) => c.pol.stability, fmt: num(0), explain: ex('stability'), better: 'up', hist: 'stability', noisy: true },
  legitimacy: { key: 'legitimacy', name: 'Legitimidad', desc: 'Aceptación del sistema político (no solo del Gobierno). Sube con elecciones limpias y confianza institucional.', get: (c) => c.pol.legitimacy, fmt: num(0), better: 'up', explain: mods('legitimacy') },
  corruption: { key: 'corruption', name: 'Corrupción', desc: 'Percepción de corrupción (0 = ninguna). Reduce la recaudación, la confianza y el crecimiento potencial.', get: (c) => c.pol.corruption, fmt: num(0), better: 'down', explain: mods('corruption') },
  pressFreedom: { key: 'pressFreedom', name: 'Libertad de prensa', desc: 'Pluralismo informativo. Limitada por el régimen y las políticas de medios.', get: (c) => c.pol.pressFreedom, fmt: num(0), better: 'up', explain: mods('pressFreedom') },
  protest: { key: 'protest', name: 'Protestas', desc: 'Intensidad de las movilizaciones (0–100). Frenan la economía, bajan la estabilidad y, extremas, pueden acabar en revolución.', get: (c) => c.soc.protest, fmt: num(0), explain: ex('protest'), better: 'down', hist: 'protest', noisy: true },
  strikes: { key: 'strikes', name: 'Huelgas', desc: 'Conflictividad laboral (0–100), impulsada por el descontento de los trabajadores y la inflación.', get: (c) => c.soc.strikes, fmt: num(0), better: 'down' },
  satisfaction: { key: 'satisfaction', name: 'Satisfacción', desc: 'Bienestar percibido: empleo, precios, sanidad, educación, desigualdad y calidad de vida regional.', get: (c) => c.soc.satisfaction, fmt: num(0), explain: ex('satisfaction'), better: 'up' },
  trust: { key: 'trust', name: 'Confianza institucional', desc: 'Confianza en instituciones: cae con la corrupción y la censura.', get: (c) => c.soc.trust, fmt: num(0), better: 'up' },
  pop: { key: 'pop', name: 'Población', desc: 'Habitantes (millones). Evoluciona con natalidad, mortalidad y migración.', get: (c) => c.soc.pop, fmt: (v) => `${v.toFixed(v < 10 ? 2 : 1)} M`, hist: 'pop' },
  education: { key: 'education', name: 'Educación', desc: 'Índice de capital humano (0–100). Responde al gasto educativo y a las universidades con años de retraso.', get: (c) => c.soc.education, fmt: num(1), better: 'up' },
  health: { key: 'health', name: 'Sanidad', desc: 'Índice de salud (0–100). Depende del gasto sanitario, los hospitales, la renta y las pandemias.', get: (c) => c.soc.health, fmt: num(1), better: 'up' },
  gini: { key: 'gini', name: 'Desigualdad (Gini)', desc: 'Índice de Gini (0–100). Baja con gasto social e impuestos progresivos; sube con corrupción y desregulación.', get: (c) => c.soc.gini, fmt: num(1), better: 'down' },
  migration: { key: 'migration', name: 'Migración neta', desc: 'Saldo migratorio por cada mil habitantes y año.', get: (c) => c.soc.migration, fmt: (v) => `${v.toFixed(1)} ‰` },
  birth: { key: 'birth', name: 'Natalidad', desc: 'Nacimientos por mil habitantes y año.', get: (c) => c.soc.birth, fmt: (v) => `${v.toFixed(1)} ‰` },
  death: { key: 'death', name: 'Mortalidad', desc: 'Defunciones por mil habitantes y año.', get: (c) => c.soc.death, fmt: (v) => `${v.toFixed(1)} ‰` },
  medianAge: { key: 'medianAge', name: 'Edad mediana', desc: 'El envejecimiento reduce el crecimiento potencial y eleva el gasto en pensiones y sanidad.', get: (c) => c.soc.medianAge, fmt: (v) => `${v.toFixed(1)} años` },
  power: { key: 'power', name: 'Poder militar', desc: 'Índice de poder: unidades × tecnología × preparación × moral (tierra + aire + mar).', get: (c) => c.mil.power, fmt: num(0), better: 'up', hist: 'power', noisy: true },
  readiness: { key: 'readiness', name: 'Preparación', desc: 'Disponibilidad de las fuerzas. Cae si el presupuesto de defensa no cubre el mantenimiento.', get: (c) => c.mil.readiness, fmt: num(0), better: 'up' },
  morale: { key: 'morale', name: 'Moral', desc: 'Moral de las tropas: apoyo de los militares, victorias y cansancio de guerra.', get: (c) => c.mil.morale, fmt: num(0), better: 'up' },
  techLevel: { key: 'techLevel', name: 'Nivel tecnológico', desc: 'Índice tecnológico (0–100). Sube con cada investigación y con la difusión mundial.', get: (c) => c.tech.level, fmt: num(1), better: 'up' },
  renewables: { key: 'renewables', name: 'Energía limpia', desc: 'Peso de las fuentes limpias en el mix energético. Reduce la dependencia del petróleo y el gas.', get: (c) => c.tech.renewables, fmt: pct(0), better: 'up' },
  ap: { key: 'ap', name: 'Capital político', desc: 'Puntos de acción disponibles. Se ganan cada mes (más con alta aprobación) y se acumulan hasta 12.', get: (c) => c.pol.ap, fmt: (v) => v.toFixed(1), better: 'up',
    explain: (c) => [{ label: 'Ingreso mensual', value: c.pol.apIncome }] },
  coupRisk: { key: 'coupRisk', name: 'Riesgo de golpe', desc: 'Probabilidad mensual estimada de intento de golpe de Estado.', get: (c) => c.pol.coupRisk, fmt: pct(1), better: 'down' },
  revolutionRisk: { key: 'revolutionRisk', name: 'Riesgo de revolución', desc: 'Probabilidad mensual estimada de levantamiento revolucionario.', get: (c) => c.pol.revolutionRisk, fmt: pct(1), better: 'down' },
  sanctions: { key: 'sanctions', name: 'Sanciones sufridas', desc: 'Peso de las sanciones que pesan sobre el país (nivel × tamaño del sancionador).', get: (c, w) => sanctionLevelOn(w, c.id), fmt: num(1), better: 'down' },
};

export function explainOf(ind: Indicator, c: Country, w: World): Contribution[] {
  return ind.explain ? ind.explain(c, w) : [];
}
