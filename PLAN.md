# PLAN — fases de desarrollo

Cada fase deja el juego jugable. Al terminar cada una: `npm test`, `npm run simulate -- 200`
(200 turnos sin jugador: el mundo no debe colapsar ni quedarse estático), correcciones y
actualización de este fichero.

## F1 — Mapa, datos, bucle de turnos, economía y presupuesto ✅
- [x] Geo: Natural Earth 110m → `world.json` + grafo de vecindad terrestre/marítima (176 territorios → 60 entidades)
- [x] Datos: 43 países + 17 bloques, regiones (Voronoi) y países miembro, materias primas, regímenes, ideologías, políticas, tecnologías
- [x] Núcleo: RNG sfc32, expresiones, tipos, carga/normalización de datos, calibración del estado inicial
- [x] Economía: crecimiento potencial y efectivo, inflación, desempleo, deuda, presupuesto, moneda, reservas, prima de riesgo
- [x] Mercado mundial de materias primas + matriz de comercio por gravedad + dependencias y bloqueos de suministro
- [x] Bucle de turnos mensual + historial; gestión fiscal automática de los gobiernos IA
- [x] IU: mapa (zoom/arrastre/pellizco, selección, 10 capas), barra superior, panel del país, pestaña Economía con
      presupuesto, impuestos, tipos y previsión contrafactual a 12 meses, voto parlamentario previsto, mapa local de regiones
      con construcción de edificios, Mercado y Mundo
- [x] Tests (12) + `npm run simulate`

**Verificación F1:** `npm test` en verde; 200 turnos: PIB mundial +1.9–2.3 %/año, inflación mundial 2–4 %, petróleo 61–66 $,
sin NaN ni colapsos. ~17 ms/turno.

**Notas:** la deriva inicial (reservas que se agotaban y emisión monetaria espuria) se corrigió calibrando la financiación
estructural de la cuenta corriente, haciendo relativos al punto de partida los efectos de tipos y sanciones y añadiendo
una "regla fiscal" a los gobiernos IA. Los tipos efectivos de la deuda de países con inflación alta o en impago se fijan en datos.

## F2 — Política interna, grupos de apoyo, eventos, sistema local ✅
- [x] Grupos con factores definidos como expresiones en `groups.json`; aprobación, base de poder, estabilidad, protestas, huelgas
- [x] Régimen, parlamento (voto por ideología de cada partido), elecciones con voto previsto, golpes, revoluciones,
      cambios de gobierno con efectos en cadena (ideología, personalidad, relaciones, ministros, "luna de miel")
- [x] Motor de acciones genérico (`actions.ts` + `actions.json`): requisitos → costes → efectos → retardos → modificadores,
      con *handlers* para mecánicas especiales (políticas, ministros, elecciones anticipadas, referéndum, fraude, cambio de régimen)
- [x] 10 políticas por niveles y 33 leyes, programas y acciones de gobierno; previsualización con efectos, voto y riesgos
- [x] 31 eventos dinámicos ponderados por el estado del mundo, con opciones y consecuencias ocultas o retardadas
- [x] Edificios regionales con efectos nacionales (hecho en F1) y efectos de los ministros (competencia y lealtad)
- [x] IU: pestañas Gobierno y Sociedad, ventana de eventos obligatoria, bandeja de eventos, fin de partida con cronología
- [x] Controles de presupuesto por pasos (−− / − / + / ++) en lugar de deslizadores (petición del usuario)

**Verificación F2:** tests en verde; 200 turnos estables (PIB mundial ~2 %/año, ~48 cambios de gobierno en 60 entidades,
cientos de eventos), ~25 ms/turno.

## F3 — Diplomacia e IA ✅
- [x] Relaciones dirigidas (opinión y confianza) que derivan hacia un objetivo explicable: afinidad estructural, memoria,
      enemigos comunes, tratados, interdependencia, sanciones, guerra y reputación
- [x] Memoria con 21 tipos de recuerdo (ayuda, traición, tratado roto, amenaza, espionaje…) con semivida propia
- [x] Tratados (libre comercio, alianza, no agresión, cooperación tecnológica, energía, ayuda), sanciones por niveles,
      aranceles, ultimátums con casus belli, mediación, ruptura de relaciones, expulsión de diplomáticos
- [x] Organismos (13) con ingreso por votación, líneas rojas (p. ej. OTAN en la frontera rusa) y resoluciones de la ONU
      (condena, sanciones con veto del Consejo de Seguridad, alto el fuego, ayuda, clima); el jugador vota
- [x] IA por utilidad: amenazas percibidas, candidatas internas y diplomáticas ponderadas por personalidad, ruido de la
      semilla, capital político y saturación de tratados; evalúa propuestas con motivos explicables
- [x] Reacciones a incidentes (represalias, acercamiento a rivales, solidaridad de aliados) y coaliciones de contrapeso
- [x] IU: pestaña Diplomacia (propuestas, votaciones, relaciones, tratados, sanciones, organismos, registro de la IA con
      motivos) y acciones diplomáticas en el panel del país con probabilidad de aceptación

**Verificación F3:** tests en verde; 200 turnos estables (~270 tratados en equilibrio, sin NaN), ~50 ms/turno tras
indexar alianzas, barreras comerciales y relaciones por turno.

## F4 — Militar y guerras
- [ ] Unidades por tipo, mantenimiento, producción, movilización, despliegues, maniobras, bloqueos
- [ ] Guerras por frentes con ocupación regional, desgaste, coste económico, cansancio
- [ ] Alto el fuego y paz con términos configurables; escalada nuclear
- [ ] IU: Militar, guerras, negociación de paz, capa de conflictos, iconos de fuerzas en el mapa

## F5 — Inteligencia, tecnología, objetivos, fin de partida, guardado
- [ ] Operaciones encubiertas con riesgo de descubrimiento; información incierta
- [ ] Árbol tecnológico, transición energética, clima, pandemias
- [ ] Objetivos (cambiantes), victorias y derrotas, resumen final con cronología y gráficas
- [ ] Guardado en localStorage + exportar/importar JSON

## F6 — Equilibrado, tutorial y pulido
- [ ] Ajuste de parámetros con simulaciones largas
- [ ] Tutorial breve
- [ ] Pulido de interfaz, accesibilidad, rendimiento
