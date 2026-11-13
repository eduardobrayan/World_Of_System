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

## F2 — Política interna, grupos de apoyo, eventos, sistema local
- [ ] Grupos (expresiones de datos), aprobación, estabilidad, protestas, huelgas
- [ ] Régimen, parlamento, partidos, elecciones, golpe, revolución, ministros
- [ ] Motor de acciones genérico (requisitos → costes → efectos → retardos → modificadores)
- [ ] Políticas por niveles y leyes; previsualización con efectos y riesgos
- [ ] Eventos dinámicos ponderados con opciones (y consecuencias ocultas)
- [ ] Edificios y construcción regional con efectos nacionales
- [ ] IU: Gobierno, Sociedad, Territorio, bandeja de eventos, noticias, tooltips con causas

## F3 — Diplomacia e IA
- [ ] Relaciones dirigidas, confianza, memoria, reputación
- [ ] Tratados, alianzas, acuerdos comerciales/energéticos, ayuda, sanciones, aranceles,
      ultimátums, mediación, cumbres, ruptura
- [ ] Organismos con votaciones y veto
- [ ] IA por utilidad con personalidad, amenazas, ruido controlado y motivos
- [ ] Reacciones al jugador y coaliciones de contrapeso; IA ↔ IA
- [ ] IU: Diplomacia, panel de motivos de la IA, capas de alianzas y relaciones

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
