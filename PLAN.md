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

## F4 — Militar y guerras ✅
- [x] 14 tipos de unidad, mantenimiento frente a presupuesto, reposición automática, encargos, movilización (4 niveles),
      6 doctrinas, despliegues en aliados, maniobras, bloqueo naval, ataque limitado
- [x] Guerras por frentes (terrestres y anfibios): fuerza asignada, logística por distancia, terreno, superioridad aérea,
      moral, apoyo material de terceros, ventaja defensiva de quien combate en casa; ocupación regional, bajas, cansancio,
      coste económico e inflación de guerra; aliados que intervienen (o abandonan, con memoria)
- [x] Alto el fuego, paz con términos configurables (cesión ≤35 % de la población, reparaciones, desmilitarización,
      abandono de alianzas, cambio de régimen), capitulación y desaparición de Estados
- [x] Escalada nuclear en 4 niveles (rara y solo en derrota grave); el intercambio estratégico termina la partida
- [x] IA: movilización por amenaza, intimidación, guerras de agresión raras (ventaja clara, disuasión nuclear, coste),
      intervención en guerras de aliados y paz negociada; enfriamiento de 5 años tras una paz
- [x] IU: pestaña Defensa, encargos por pasos, negociación de paz con probabilidad y motivos, acciones militares en el
      panel del país, capa de conflictos con frentes animados y regiones ocupadas rayadas

**Verificación F4:** tests en verde; 200 turnos con 3 semillas: la guerra ruso-ucraniana arranca calibrada en tablas,
1–2 guerras simultáneas, paces negociadas, sin escalada nuclear catastrófica ni colapsos.

## F5 — Inteligencia, tecnología, objetivos, fin de partida, guardado ✅
- [x] 7 operaciones encubiertas (espionaje, financiar oposición, sabotaje, robo de tecnología, desinformación,
      ciberataque, apoyo a golpe) con éxito y riesgo de descubrimiento por capacidad, contrainteligencia y red; la IA
      también las usa; ser descubierto daña relaciones, reputación y da casus belli
- [x] Información incierta: precisión según red, capacidad, transparencia y alianzas ("≈" en la interfaz)
- [x] Árbol tecnológico de 45 tecnologías en 10 ramas, difusión mundial, robo; transición energética y clima
- [x] Pandemias que surgen, se propagan por comercio y fronteras, y terminan por inmunidad o vacunas (con evento propio)
- [x] Impago soberano automático; derrota por quiebra (dos impagos en diez años o 18 meses de hiperinflación)
- [x] 6 objetivos con progreso medible, cambio sugerido por los acontecimientos (gratis) o voluntario (⚡3), victoria,
      límite de 30 años y resumen final con cronología y gráficas
- [x] Guardado: 3 ranuras + autoguardado cada 3 meses en localStorage (gzip) y exportación/importación en JSON
- [x] IU: pestañas Inteligencia, Tecnología y Objetivos; menú de partida; tutorial breve

**Verificación F5:** tests en verde; 200 turnos estables con pandemias e impagos; guardar y cargar probado en navegador.

## F6 — Equilibrado, tutorial y pulido ✅
- [x] Equilibrado de la economía, las guerras (frentes heredados calibrados, sin contraofensivas irreales, escalada
      nuclear rara), la saturación de tratados y la fórmula electoral (pruebas con jugador pasivo en 15 países)
- [x] Rendimiento: cachés por turno de alianzas, barreras comerciales, cuotas de comercio y relaciones (~55 ms/turno)
- [x] Tutorial breve de 9 pasos (se muestra al empezar; repetible desde el menú)
- [x] Diseño adaptable a móvil (paneles desplegables, barra superior compacta, capas desplazables)
- [x] 23 tests: datos (todas las expresiones compilan, todos los handlers existen), sistemas (leyes, previsión,
      presupuestos, eventos, guerra y paz, IA explicable, guardado determinista) y salud del mundo a 200 turnos
- [x] README

## F7 — Ampliaciones pedidas por el usuario ✅
- [x] Jugar con un partido propio o existente (pantalla de inicio: partido del gobierno, otro existente o uno nuevo
      con nombre, ideología y líder)
- [x] Diseño y elección de armamento propio (11 sistemas; diseño nacional con rasgos o compra a otro país con
      dependencia de repuestos; pestaña Armamento; la IA también desarrolla y compra)
- [x] Necesidades civiles y presión social (9 necesidades con causas en tooltip, presión → protestas, emigración;
      eventos de vivienda y pensiones)
- [x] Armas biológicas y patógenos diseñables (programa secreto, cepas humano/cultivos/ganado con 4 rasgos,
      vacuna propia, liberación, mutaciones, fugas, atribución, escudo biológico, bioespionaje, capa «Brotes»)
- [x] Cuerpos policiales (tamaño, formación, militarización, integridad, eficacia, criminalidad; 5 acciones)
- [x] Corrupción de seis tipos con efectos distintos, escándalos y 8 medidas (incluido el clientelismo)
- [x] Narcotráfico (producción, tránsito, cárteles, violencia y consumo; demanda mundial; ofensivas, sustitución de
      cultivos, regulación, blanqueo, pactos secretos, cooperación antidroga, financiar cárteles rivales; capa del mapa)
- [x] Pestaña Seguridad, nuevas capas (corrupción, narcotráfico, brotes), 7 eventos y migración de partidas v1 → v2

**Verificación F7:** 34 tests en verde (11 nuevos); 200 turnos estables con dos semillas (crecimiento ~2,5 %,
corrupción media 52 → 45 por reformas graduales, cárteles 24 → 21, sin NaN, ~72 ms/turno). Se corrigió una pandemia
natural que podía volverse endémica para siempre.

## F8 — Pulido, versión jugable con doble clic y tiempo real ✅
- [x] Científico arrepentido: desmantelar destruye también las cepas; el evento es secreto (no sale en noticias de la IA)
- [x] Cargo genérico con nombres de líder aleatorios (no «Presidenta Eduardo»)
- [x] Integridad policial inicial más plausible en países con cárteles (México 8 → 19), media ponderada intacta
- [x] Capa Narcotráfico con escala de raíz; leyendas de Corrupción y Brotes corregidas; ruido de inteligencia en
      corrupción, cárteles, criminalidad, presión y violencia de países extranjeros (paneles, tabla y capas)
- [x] Gráficas sin historial: una línea discreta en vez de un lienzo vacío; ejes sin etiquetas repetidas
- [x] Resumen final con presión social, corrupción, cárteles, criminalidad y brotes provocados
- [x] Previsión a 12 meses sin azar en brotes (sin mutaciones ni atribuciones) y sin noticias
- [x] modSum con caché por array de modificadores (idéntico bit a bit): ~69 → ~59 ms/mes
- [x] Nombres legibles y colores correctos de los efectos nuevos (cárteles, corrupción por tipos, policía…) en las previsiones
- [x] Limpieza de imports y `void` sobrantes; tabla de focos del narco sin desbordar
- [x] Build en un único HTML autocontenido (sin aviso de bundle) y copia jugable `jugar/WorldOfSystem.html`
- [x] Tiempo real: reloj continuo con días, pausa con espacio, 1/2/3, «Próximo mes» secundario, eventos no críticos
      a la bandeja con decisión del gabinete al mes, noticias en directo, cifras animadas, frentes y brotes animados

- [x] Interfaz sencilla y visual: Panel de mando con 6 medidores y tendencia, consejeros con acción directa,
      6 secciones con subpestañas, acciones rápidas con icono sobre otro país, efectos en el mapa por cada acción y
      suceso, cifras animadas, guía interactiva que resalta dónde hacer clic, textos más cortos y «Avanzado» plegable

**Verificación F8:** 38 tests en verde (4 nuevos); 200 meses estables; build sin avisos; recorrido con Playwright
desde `file://` (escritorio y móvil) sin errores de consola; el reloj avanza solo sin interacción.


## F9 — Todo a la vista ✅
- [x] Barra de acciones siempre visible bajo el mapa: un botón grande por tema (Economía, Bienestar, Política, Policía,
      Corrupción, Narcotráfico, Ejército, Biológico, Otros países, Ciencia)
- [x] Cada tema abre un catálogo de tarjetas con frase corta, efectos en verde/rojo, coste y motivo si está bloqueada
- [x] Buscador de acciones (botón 🔎 o tecla B): «paro», «policía», «armas»…
- [x] Los medidores del panel de mando abren directamente las acciones que los mejoran
- [x] Capas del mapa plegadas en un solo botón con iconos; el panel derecho solo aparece al elegir otro país o región
