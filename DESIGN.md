# World of System — Documento de diseño

Simulador de estrategia geopolítica 2D para navegador, de un jugador, por turnos (1 turno = 1 mes,
inicio en enero de 2026). El jugador dirige un país real; el resto lo gobierna una IA interna basada
en utilidad. La prioridad es la **profundidad de la simulación** y las **consecuencias en cadena**.

---

## 1. Arquitectura

```
src/
  sim/            Lógica pura (sin DOM). Determinista con semilla. Ejecutable en Node.
    rng.ts          RNG propio (sfc32) con estado serializable + ruido por hash
    expr.ts         Mini-lenguaje de expresiones seguro (sin eval) para los datos
    types.ts        Modelo de datos del estado del mundo
    data.ts         Carga y normalización de los JSON de src/data
    init.ts         Creación del mundo y calibración del estado inicial
    vars.ts         Resolución de variables para expresiones ("eco.inflation", "groups.workers"…)
    effects.ts      Efectos, modificadores con duración, efectos retardados
    economy.ts      Macroeconomía, presupuesto, deuda, moneda, sectores
    market.ts       Mercado mundial de materias primas y matriz de comercio (gravedad)
    society.ts      Demografía, educación, sanidad, desigualdad, migración
    politics.ts     Grupos de apoyo, aprobación, estabilidad, parlamento, elecciones, golpes
    regions.ts      Sistema local: regiones, edificios, construcción
    actions.ts      Motor genérico de acciones: requisitos → costes → efectos → retardos → modificadores
    events.ts       Eventos dinámicos ponderados por el estado del mundo
    diplomacy.ts    Relaciones, confianza, tratados, organismos, votaciones, sanciones
    ai.ts           IA de países: personalidad, utilidad, memoria, reacciones, explicabilidad
    military.ts     Fuerzas, mantenimiento, producción, movilización, despliegues
    war.ts          Guerras por frentes, desgaste, paz, escalada nuclear
    intel.ts        Operaciones de inteligencia e incertidumbre de la información
    tech.ts         Árbol tecnológico, transición energética
    globals.ts      Clima, pandemias, tensión global
    goals.ts        Objetivos, condiciones de victoria/derrota, resumen final
    forecast.ts     Previsión de efectos (simulación contrafactual sin IA ni eventos)
    turn.ts         Orquestador del turno mensual
    save.ts         Serialización (localStorage / JSON)
  data/           Todo el contenido del juego en JSON (países, regiones, políticas, eventos…)
    geo/            world.json (polígonos Natural Earth 110m) y adjacency.json (vecindad)
  ui/             Interfaz HTML/CSS + Canvas 2D (mapa global y mapa local)
scripts/
  build-geo.ts    Genera geo/ desde el paquete world-atlas (Natural Earth 110m)
  simulate.ts     Simula N turnos sin jugador e imprime métricas de salud del mundo
tests/            Vitest (solo simulación)
```

Reglas:

- `src/sim` **no importa nada de `src/ui`** ni usa `window`, `document`, `Math.random` ni `Date.now`.
- Todo el azar sale de `world.rng` (sfc32, 4 enteros de 32 bits en el estado → la partida guardada
  reproduce exactamente el futuro). La incertidumbre de la información usa un ruido por hash
  (`hashNoise(seed, claves…)`) que no consume el RNG y no parpadea al redibujar.
- El estado (`World`) es JSON puro (sin `Map`/`Set`/clases) → guardar = `JSON.stringify`.
- La IU solo llama a funciones públicas de la simulación (`applyAction`, `advanceTurn`,
  `previewAction`, `forecast`, `resolveEvent`…) y redibuja.

## 2. Datos (todo dirigido por datos)

| Fichero | Contenido |
|---|---|
| `countries.json` | 43 países jugables con datos aproximados reales de 2026 |
| `blocks.json` | 17 bloques regionales que agrupan al resto de países (cada miembro es una "región") |
| `regions.json` | Regiones de cada país (ciudad, coordenadas, peso de población, costa, terreno, especialización) |
| `regimes.json` | Tipos de régimen: parlamento, elecciones, riesgo de golpe, influencia de grupos |
| `ideologies.json` | Ideologías: preferencias de presupuesto/impuestos, afinidades diplomáticas |
| `groups.json` | Grupos sociales y los **factores** (expresiones) que determinan su apoyo |
| `policies.json` | Políticas por niveles (migración, regulación, prensa, banco central…) |
| `actions.json` | Acciones de todas las categorías (leyes, economía, diplomacia, militar, inteligencia) |
| `events.json` | Eventos con condición, peso, opciones y consecuencias (algunas ocultas) |
| `personalities.json` | Personalidades de IA (agresividad, pragmatismo, riesgo, fiabilidad, ambiciones, líneas rojas) |
| `organizations.json` | Organismos (ONU, OTAN, UE, BRICS…) con tipo, miembros, veto, efectos |
| `relations.json` | Relaciones iniciales explícitas, tratados y guerras activas al inicio |
| `units.json` | Tipos de unidad (terrestres, aéreas, navales) con poder, coste y mantenimiento |
| `buildings.json` | Edificios del sistema local con coste, plazo, mantenimiento y efectos |
| `techs.json` | Árbol tecnológico (10 ramas) |
| `commodities.json` | Materias primas del mercado mundial |
| `objectives.json` | Objetivos de partida y sus condiciones |
| `names.json` | Nombres para generar ministros y líderes por área cultural |

### 2.1 Esquema de una acción

```jsonc
{
  "id": "reforma_laboral",
  "name": "Reforma laboral flexibilizadora",
  "category": "ley",                  // ley | economia | social | diplomacia | militar | inteligencia | gobierno
  "target": "none",                    // none | foreign | region
  "requires": [{ "expr": "flags.reforma_laboral == 0", "text": "No aprobada antes" }],
  "parliament": true,                  // pasa por el parlamento si el régimen lo exige
  "cost": { "ap": 2, "money": "gdp*0.0005" },
  "effects": [ { "path": "groups.workers", "add": -10 } ],            // inmediatos
  "delayed": [ { "in": 6, "effects": [ { "path": "eco.unemployment", "add": -0.5 } ] } ],
  "modifiers": [ { "id": "reforma_laboral", "name": "Reforma laboral", "duration": -1,
                   "mods": { "potentialGrowth": 0.25, "naturalUnemployment": -0.6, "group.workers": -6 } } ],
  "risks": ["Huelgas convocadas por los sindicatos"],
  "handler": null,                     // lógica especializada (tratados, guerra, operaciones…)
  "ai": { "utility": "(eco.unemployment-7)*0.5 + pers.pragmatism*0.5" }
}
```

- **requisitos** (`requires`) → **costes** (`cost`: capital político, dinero, otros) → **efectos inmediatos**
  (`effects`) → **efectos retardados** (`delayed`) → **modificadores con duración** (`modifiers`,
  `duration: -1` = permanente hasta derogación).
- `effects` usan `path` + `add|mul|set` con número o expresión; `hidden: true` oculta el efecto en la
  previsualización ("consecuencias ocultas").
- `handler` conecta con una mecánica especializada (p. ej. `treaty`, `sanction`, `declareWar`,
  `intelOp`, `build`); los parámetros siguen siendo datos.

### 2.2 Lenguaje de expresiones

`expr.ts` compila (una vez, con caché) expresiones con números, rutas (`eco.inflation`,
`groups.workers`, `target.mil.power`, `world.oilPrice`, `rel`, `pers.aggression`…), operadores
`+ - * / ^ < <= > >= == != && || !`, ternario `c ? a : b` y funciones `min max clamp abs sqrt log exp`.
Sin `eval`: el análisis es un parser de descenso recursivo.

## 3. Modelo de estado (resumen)

`World`: `seed`, `rng`, `turn`, `countries{}`, `rel{a:{b:{op, trust}}}` (opinión **dirigida** de A
hacia B, −100..100 y confianza 0..100), `treaties[]`, `orgs{}`, `wars[]`, `sanctions[]`, `market`,
`trade` (matriz base), `scheduled[]` (efectos retardados), `pendingEvents[]`, `incidents[]`, `news[]`,
`aiLog[]`, `timeline[]`, `global` (clima, pandemia, tensión), `player`, `history`, `gameOver`.

`Country`: `eco` (PIB, crecimiento, inflación, desempleo, deuda, reservas, tipo de interés, moneda,
impuestos, presupuesto por partidas, sectores, exportaciones/importaciones), `res` (producción y
consumo de petróleo, gas, minerales críticos, alimentos, semiconductores), `soc` (población,
natalidad, mortalidad, edad mediana, educación, sanidad, desigualdad, migración, satisfacción,
confianza institucional, protestas, huelgas), `groups` (apoyo de trabajadores, empresarios,
militares, jóvenes, religiosos, minorías), `pol` (régimen, ideología, partidos, parlamento,
elecciones, corrupción, libertad de prensa, estabilidad, legitimidad, aprobación, riesgo de golpe y
revolución, capital político, ministros, políticas por niveles, flags), `mil`, `intel`, `tech`,
`regions[]`, `mods[]` (modificadores activos), `memory[]`, `ai`, `explain` (desglose de causas).

## 4. Fórmulas principales (mensuales; tasas anuales en %)

Convención: `x ← x + (objetivo − x)·k` es **inercia** (k pequeño = cambios lentos). Al crear el mundo
se **calibra** cada objetivo con un término `calib` para que el estado inicial sea casi estacionario;
los `calib` de crecimiento e inflación decaen lentamente (las economías convergen salvo que los
impulsores persistan), los estructurales (desempleo natural) se mantienen.

### 4.1 Economía

- **Crecimiento potencial** `g* = 1.0 + catchUp·inst + demografía + 0.02·(edu−60) + 0.015·(infra−60)
  + 0.012·(tech−50) + 0.08·(inversión−22) + 0.02·(estab−50) + mods + calib`,
  con `catchUp = 3·(1−min(1,pibpc/60000))^1.5` e `inst = 0.4+0.6·(1−corrupción/100)`.
- **Crecimiento efectivo objetivo** `gT = g* + impulsoFiscal + monetario + shockComercial
  + materiasPrimas + confianza − protestas − guerra − sanciones + mods`.
  - impulso fiscal `0.45·(déficit − déficitEstructural)` (el estructural es una media móvil de 24 meses
    → los estímulos se agotan).
  - monetario `−0.35·(tipoReal_media6m − tipoNeutral)`.
  - comercio: `−8·apertura·(pérdidaComercial − pérdidaAdaptada)`; la economía se adapta en ~24 meses
    (shock transitorio + pérdida de nivel duradera).
  - materias primas: `Σ (precio/base − 1)·exportaciónNetaComoParteDelPIB·0.35`.
  - `crecimiento ← crecimiento + (gT − crecimiento)·0.25`; `PIB ← PIB·(1 + crecimiento/1200)`.
  - brecha de producción `gap ← 0.97·gap + (crecimiento − g*)/12`.
- **Inflación objetivo** `πT = ancla + 0.3·gap + importada + energía + alimentos + monetización
  + impuestosConsumo − 0.5·(tipoReal − neutral) + mods + calib`.
  - `ancla = cred·metaBC + (1−cred)·expectativas`; credibilidad alta si el banco central es
    independiente; expectativas siguen a la inflación con 1/12 mensual.
  - importada: depreciación interanual × importaciones/PIB × 0.5.
  - energía/alimentos: `(precio/base − 1) × dependencia × {4, 3}`.
  - monetización: si el déficit no puede financiarse (prima de riesgo alta, reservas bajas).
  - `inflación ← inflación + (πT − inflación)·0.15`.
- **Desempleo** (Okun): `uT = uNatural − 0.45·gap + mods`; `u ← u + (uT − u)·0.1`.
- **Tipo de interés**: si el banco central es independiente sigue una regla de Taylor
  `r = neutral + π + 0.5(π − meta) + 0.5·gap`; si no, lo fija el gobierno.
- **Presupuesto**: `ingresos = PIB·Σ(k_i·tipo_i)·eficiencia + aranceles + rentasRecursos`
  (k: renta 0.45, sociedades 0.10, consumo 0.35; la eficiencia se calibra con los ingresos reales y cae
  con la corrupción); `gasto = PIB·Σ partidas + intereses + obras`; `déficit = gasto − ingresos`.
- **Deuda**: `deuda ← deuda + déficit/12 − deuda·π/1200` (deuda real: la inflación la erosiona).
  `tipoDeuda` converge a `tipo + prima` con vencimiento medio ~3 años.
  `prima = 0.03·(deuda%−60) + 0.25·(déficit%−3) + 0.03·(50−estab) + sanciones` (×0.3 con moneda reserva).
- **Moneda** (índice real): `Δ% = 0.08·(tipoReal − tipoRealMundial) + 0.05·cuentaCorriente%
  − 0.03·(π − 3) + 0.006·(estab − 55) − fugaCapitales + 0.2%·(100 − índice)/100`.
- **Reservas** `← reservas + (cuentaCorriente + flujosCapital)/12`; reservas a cero con déficit externo
  → crisis cambiaria (evento).
- **Default**: prima > 12 o (reservas ≈ 0 y financiación imposible) → evento de impago.

### 4.2 Mercado mundial y comercio

- Materias primas: petróleo, gas, minerales críticos, alimentos, semiconductores. Cada país tiene
  producción y consumo. `precio ← precio·exp(0.6·(D−S)/S) · reversión hacia el coste` + shocks
  (guerras en productores, embargos, eventos, tensión global). Producción reacciona al precio con
  retardo (inversión) y consumo con elasticidad negativa.
- Las exportaciones de un país sancionado/embargado pierden parte del acceso → se venden con
  descuento y el suministro mundial efectivo cae.
- **Matriz de comercio por gravedad**: `T_ij ∝ PIB_i^0.8·PIB_j^0.8 / dist_ij · (1+0.5·frontera) ·
  (1+0.4·acuerdo) · f(relación)`, normalizada a las exportaciones de cada país.
  Barreras: aranceles, sanciones (nivel 1: −30 %, 2: −60 %, embargo: −95 %), guerra (−100 %), bloqueo.
  `accesoComercial = Σ T_ij(1−barrera_ij)/Σ T_ij` → crecimiento, inflación, reservas.
- **Dependencias**: las importaciones netas de cada materia prima se reparten entre exportadores
  netos según comercio y relación; un proveedor hostil/embargador eleva el coste (prima de riesgo de
  suministro) y puede provocar escasez energética.

### 4.3 Sociedad

- Población: `Δ = (natalidad − mortalidad + migración)/1000/12`. Natalidad cae con renta y educación;
  mortalidad depende de sanidad, edad, guerras, pandemias y desastres.
- Educación / sanidad: objetivo según gasto (%PIB) y renta + edificios regionales, inercia de 5 y 3 años.
- Desigualdad (Gini): baja con gasto social y fiscalidad progresiva, sube con corrupción y desregulación.
- Migración: atractivo relativo (renta, estabilidad, política migratoria); guerra → emigración.
- Satisfacción, confianza institucional, protestas y huelgas: objetivos a partir de las variables
  anteriores, la represión y los grupos.

### 4.4 Política

- **Apoyo de cada grupo**: `objetivo = 50 + Σ factores(expresiones de groups.json) + afinidad
  ideológica + mods + calib`; inercia 10 %/mes. Los factores se muestran como causas en los tooltips.
- **Aprobación** = media de apoyos ponderada por peso demográfico.
- **Base de poder** = media ponderada por **influencia** (depende del régimen: los militares pesan más
  en un autoritarismo; la opinión pública en una democracia).
- **Estabilidad** `objetivo = 0.35·basePoder + 0.25·aprobación + 0.2·legitimidad + 0.2·confianza
  − 0.3·protestas − 0.2·cansancioGuerra − penalización(inflación) + baseRégimen + mods`; inercia 8 %.
- **Riesgo de golpe** (%/mes) `= max(0, 0.02(40−apoyoMilitar) + 0.02(45−estab))·factorRégimen`.
- **Riesgo de revolución** cuando protestas > 70 y estabilidad < 25.
- **Elecciones** (democracias e híbridos): voto al gobierno = `0.6·aprobación + 0.2·(crecimiento
  reciente) + incumbencia + manipulación(híbridos)`. El jugador pierde si cae por debajo del 50 %
  del voto necesario para gobernar. En países IA el cambio de gobierno cambia ideología y personalidad.
- **Parlamento**: probabilidad de aprobar = sigmoide((escañosGobierno + apoyos alineados − 50)/8)
  + presión (capital político extra).
- **Capital político** (puntos de acción): `3 + (aprobación−50)/25 + bonusRégimen + dificultad`, acumulable
  hasta 10.

### 4.5 Diplomacia e IA

- **Relaciones dirigidas** `op[a][b]` derivan hacia `base(ideología, bloques, vecindad, rivalidad)
  + memoria + enemigos comunes + interdependencia` (3 %/mes).
- **Memoria**: cada país guarda recuerdos (`traición`, `ayuda`, `amenaza`, `tratado cumplido/roto`,
  `sanción`, `agresión`, `espionaje`…) con magnitud y semivida. Confianza = base + Σ recuerdos decaídos.
- **IA por utilidad**: cada turno genera candidatas (gestión interna, diplomacia, militar,
  inteligencia), las puntúa con `utilidad = Σ peso_personalidad × rasgo` (objetivos, amenaza
  percibida, relaciones, equilibrio de poder, política interna, coste) + ruido de la semilla, y
  ejecuta las mejores que superan el umbral y caben en su capital político. Cada decisión guarda sus
  **motivos** (rasgos con mayor contribución) para el panel de explicabilidad.
- **Reacción al jugador**: cada acción relevante genera un *incidente*; el afectado y sus aliados lo
  evalúan (respuesta proporcional, represalia, acercamiento a rivales, coalición de contrapeso).
- **Organismos** con votaciones trimestrales (resoluciones generadas por el estado del mundo o
  propuestas por el jugador); veto en el Consejo de Seguridad de la ONU.

### 4.6 Militar y guerra

- Poder por dominio `Σ unidades·poder·(0.5+tec/100)·preparación·moral` (+ multiplicador de movilización).
- Mantenimiento vs. presupuesto de defensa → preparación; excedente → producción.
- **Frentes** entre beligerantes vecinos (terrestres o anfibios). Cada mes:
  `ratio = ataque/defensa` (asignación de fuerzas, logística por distancia, terreno, moral,
  superioridad aérea, aliados, bonus defensivo 1.3); `Δcontrol = 5·tanh(1.5·ln ratio) + ruido`;
  bajas proporcionales; cansancio de guerra; coste económico (gasto, comercio, daños en el defensor).
  Las regiones del defensor más cercanas al atacante se ocupan según el control del frente.
- **Paz**: términos configurables (cesión de regiones ocupadas, reparaciones, desmilitarización,
  salida de alianza, paz blanca); la IA acepta según puntuación de guerra, cansancio y personalidad.
- **Escalada nuclear** (0 sin alerta → 4 intercambio estratégico) solo entre potencias nucleares en
  derrota grave; nivel 4 = fin de la partida (derrota de todos).

### 4.7 Inteligencia

Operaciones con duración, coste, `éxito = 0.2 + (intel − contraintel)/100 + 0.3·red` y
`descubrimiento = 0.1 + contraintel/150 − 0.2·red + riesgoOp`. Ser descubierto daña relaciones,
confianza (memoria) y reputación. La **precisión de la información** sobre otro país depende de la
red de espionaje, la capacidad de inteligencia, la libertad de prensa del observado y las alianzas;
la IU muestra los datos con ruido y como "≈ valor".

### 4.8 Tecnología, clima y pandemias

- Puntos de investigación/mes `= 3·√(PIB·gastoI+D) · educación/70 · (1 + universidades)`.
  Coste con difusión: más barato cuanto más PIB mundial ya la tiene.
- Clima: emisiones = Σ PIB·intensidad·(1−renovables); la anomalía térmica sube y aumenta el peso
  de los desastres naturales. La transición energética avanza con tecnología y políticas.
- Pandemias: se propagan por la matriz de comercio; frenan la economía y suben la mortalidad según la
  sanidad; terminan por inmunidad o por la tecnología de vacunas.

### 4.9 Eventos

Cada evento (`events.json`) tiene condición, peso (= probabilidad mensual en %, una expresión sobre el estado del
mundo), enfriamiento y opciones. Máximo un evento aleatorio al mes por país IA y dos para el jugador. La IA elige la
opción con mayor utilidad (`ai`) más ruido de la semilla; el jugador debe decidir antes de avanzar. Las consecuencias
marcadas `hidden` se muestran como "consecuencia incierta". La dificultad escala el peso de los eventos buenos y malos.

### 4.10 Elecciones y cambios de régimen

`votoGobierno = 28 + 0.56·aprobación + economía(crecimiento 12 m, paro, inflación) + manipulación − cansancio de guerra (+3/−2 según dificultad)`
± ruido (σ 3.5). Por debajo del 50 % el gobierno pierde: el jugador es derrotado; en un país IA gobierna el mayor partido
de la oposición. Golpe: probabilidad mensual `riesgoGolpe`, éxito `0.35 + 0.015·(35 − apoyoMilitar) + 0.01·(40 − estabilidad)`.
Revolución: análogo con protestas y estabilidad. Todo cambio de gobierno recalcula la relación estructural con cada país,
ajusta la personalidad y suaviza los rencores de la memoria.

### 4.11 Seguridad interior: policía, corrupción y narcotráfico (F7, `security.ts`)
- **Policía**: tamaño (agentes/100.000 hab.) que sigue al presupuesto de seguridad interior
  (`base · (seguridad/seguridad₀)^0.8`), formación, militarización e integridad (= 100 − corrupción policial).
  `eficacia = √(tamaño/300) · (0.6 + formación/250) · (0.55 + integridad/220)`, normalizada a 1 en 2026.
- **Criminalidad**: `crimen₀ · (1 − 0.7·(eficacia − 1)) + 0.4·Δviolencia + Δparo + 0.5·ΔGini (+4 en guerra)`.
  Sus desviaciones restan satisfacción, crecimiento y empujan la emigración. La militarización reprime mejor
  las protestas pero erosiona la confianza.
- **Corrupción en seis tipos** (pesos): política 0.25, administrativa 0.20, judicial 0.15, policial 0.15,
  empresarial 0.15, electoral 0.10. La corrupción general es su media ponderada. Cada tipo tiende a su valor
  inicial + modificadores comunes (leyes, políticas, edificios, ministro del Interior) + modificadores propios
  (`corr.<tipo>`) + impulsores (poder de los cárteles, prensa, gasto en administración, manipulación electoral).
  Efectos específicos: administrativa → recaudación; empresarial y judicial → inversión; electoral → legitimidad;
  policial → eficacia policial. Escándalos: probabilidad ∝ corrupción × libertad de prensa; al destaparse
  la trama baja 3 puntos.
- **Narcotráfico** (`narco.json` para los países relevantes; el resto se deriva de renta y corrupción):
  producción, tránsito, cárteles, violencia y consumo. La demanda mundial se calcula con consumo × población ×
  renta. Cárteles: `+0.4·Δcorrupción + 0.6·Δparo + 18·(demanda − 1) − 22·(eficacia − 1) + 0.2·Δcorrupción judicial`.
  Violencia: `+0.8·Δcárteles + modificadores` (las ofensivas la disparan un año; al terminar, los cárteles se
  fragmentan). Los cárteles corrompen policía, jueces y políticos (realimentación débil, ganancia < 0.1).

### 4.12 Necesidades civiles y presión social (F7, `needs.ts`)
Nueve necesidades con cobertura 0–100: alimentación, vivienda, energía, sanidad, educación, seguridad, empleo,
agua y servicios, pensiones. Se calculan con renta, precios mundiales de alimentos y energía, dependencia de
importaciones, inflación, tipos de interés, gasto público, refugiados, daños de guerra, epidemias y plagas.
La población se acostumbra al nivel de 2026: `presión = Σ peso · (habitual − actual)` (los retrocesos cuentan
×0.9, las mejoras restan ×0.3). La presión suma protestas (×0.55), resta satisfacción, estabilidad y apoyo de
trabajadores y jóvenes, y empuja la emigración.

### 4.13 Armamento propio (F7, `weapons.ts`, `weapons.json`)
Once sistemas (caza, dron, carro, artillería de cohetes, fragata, submarino…), cada uno ligado a un tipo de
unidad. **Diseño nacional**: rasgos potencia, protección y economía (1–5) con un máximo de `9 + tecMilitar/20`
puntos; `mejora = base · (0.4 + 0.16·potencia + 0.1·protección) · min(1.3, tecMilitar/tecIdeal)`; el coste unitario
sube con potencia y protección y baja con economía; el programa se paga cada mes. **Compra**: más barata y rápida,
calidad según la tecnología del proveedor, pero si este te sanciona (nivel ≥ 2) faltan repuestos y la mejora cae a
la mitad. Solo cuenta el mejor sistema por tipo de unidad. La IA desarrolla (potencias) o compra (resto).

### 4.14 Armas biológicas y brotes (F7, `bio.ts`)
- **Programa secreto** (viola la Convención de 1972): capacidad 0–100 que crece con la tecnología y la
  investigación; coste mensual; riesgo de filtración según la mejor inteligencia rival frente a tu
  contrainteligencia. Descubierto: −15 de reputación y memoria negativa en todo el mundo.
- **Diseño de cepas**: objetivo humano, cultivos o ganado; rasgos contagio, letalidad, sigilo y resistencia (1–5)
  con un máximo de `6 + capacidad/8` puntos; vacuna propia opcional (+4 meses, +40 % de coste).
- **Brotes**: se propagan por fronteras y comercio (`0.022 · contagio`), crecen dentro de cada país hasta que llega
  la vacuna (`5 + 3·resistencia − arnm − defensa/25` meses), mutan (2,5 %/mes) y, si no hay vacuna propia, pueden
  volver al creador. Pasan `1 + 1.2·sigilo` meses sin detectar. Humano: mortalidad, crecimiento y protestas; plagas:
  producción de alimentos (y precios mundiales). Atribución mensual `0.03 + 0.02·(5 − sigilo) + inteligencia/2500`:
  −40 de reputación, sanciones máximas de las víctimas y casus belli, sanciones de terceros, +10 de tensión.
- **Fugas de laboratorio** (menos con bioseguridad) y **escudo biológico**, que también frena pandemias naturales.
- La IA solo crea programas con personalidades agresivas y poco prudentes, y solo libera patógenos si pierde una
  guerra de forma clara.

### 4.15 Partidos del jugador (F7)
Al empezar se puede gobernar con el partido en el poder, con otro partido existente (gana las elecciones y se
intercambia con el gobierno saliente) o con uno **nuevo** (nombre, ideología y nombre del líder): irrumpe con la
mayoría del gobierno saliente, que se queda con el 35 % de sus escaños. Se aplica antes de calcular relaciones y
calibrar, así que la partida empieza estable con la ideología elegida.

## 5. Sistema local (regiones)

- Los 43 países tienen 4–9 regiones definidas en datos (ciudad principal, coordenadas, peso de
  población, costa, terreno). Las celdas se generan como **Voronoi recortado** por el polígono del país
  (Sutherland–Hodgman sobre semiplanos + recorte por *clip* del canvas). En los bloques, cada país
  miembro es una región con su polígono real.
- Indicadores regionales: población, desempleo, producción, infraestructuras, calidad de vida,
  seguridad, educación, sanidad, ingresos fiscales, desarrollo.
- Edificios (`buildings.json`): carreteras, ferrocarril, puertos, aeropuertos, hospitales,
  universidades, centros administrativos, fábricas, granjas, minas, centrales eléctricas, bases
  militares… Se calibran sobre el estado inicial: **lo que cuenta es el cambio** respecto al stock
  inicial, que se agrega a escala nacional (educación, sanidad, infraestructura → crecimiento
  potencial, empleo, producción energética, alimentos, minerales, preparación militar, corrupción…).

## 6. Decisiones de diseño ante ambigüedades

1. **Turnos mensuales con reloj continuo.** La simulación se resuelve por meses (requisito principal);
   la IU ofrece pausa y 3 velocidades que avanzan meses automáticamente (el contador de días es solo
   visual) y se pausa sola ante eventos que requieren decisión.
2. **Unidades monetarias**: PIB en miles de millones de USD constantes de 2026. La inflación
   afecta a la deuda real y a la moneda, no a la escala del PIB.
3. **Líderes sin nombre propio** en los datos (solo cargo y partido) para evitar inexactitudes sobre
   quién gobierna en 2026; los ministros se generan con nombres ficticios.
4. **Situación inicial**: guerra Rusia–Ucrania activa con ~18 % de ocupación; tensiones altas en
   Taiwán, Corea, India–Pakistán, Irán–Israel y Venezuela–EE. UU. Valores aproximados y editables.
5. **Bloques regionales** como una sola entidad IA (con sus países miembros como regiones).
   Su pertenencia a organismos se simplifica al bloque completo.
6. **Perder unas elecciones es derrota** (tal y como pide el diseño). En regímenes no democráticos
   no hay elecciones competitivas; el peligro son el golpe y la revolución.
7. **Unidades militares abstractas**: brigadas/batallones, escuadrones y buques; conteos aproximados.
8. **Información incierta**: el ruido es determinista por (semilla, trimestre, observador, país, variable).
9. **Tamaño del guardado**: historial mensual para el jugador y trimestral para el resto.
11. **Controles por pasos**: el presupuesto y los impuestos se ajustan con botones de paso fijo (0,1/0,5 pp y 0,5/2 pp)
    en lugar de deslizadores, por preferencia del usuario.
12. **Pandemias sin endemia infinita**: tras la vacuna, cada país exporta muchos menos casos (×0,15–0,2) y un brote
    termina a más tardar a los 5–6 años; antes, el contagio cruzado podía mantener una pandemia indefinidamente.
13. **Armamento**: la mejora de un sistema nuevo se aplica a todo el arsenal de ese tipo al entrar en servicio
    (se asume reequipamiento progresivo de las unidades existentes).
14. **Partidas antiguas**: al cargar una partida de la versión 1 se inicializan policía, corrupción por tipos,
    narcotráfico y necesidades con su estado en ese momento como referencia.
10. **Previsiones**: la previsión de presupuesto/impuestos simula 12 meses con y sin el cambio
    (sin eventos ni IA) para mostrar el efecto aislado; las previsiones de reacciones usan la misma
    función de evaluación de la IA sin ruido.
