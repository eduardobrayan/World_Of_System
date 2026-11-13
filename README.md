# World of System

Simulador de estrategia geopolítica 2D para navegador, de un jugador y por turnos (1 turno = 1 mes, desde enero de 2026).
Diriges un país real; el resto del mundo lo gobierna una IA con personalidad, memoria y motivos explicables.

## Cómo jugar

```bash
npm install
npm run dev        # abre http://localhost:5173
```

```bash
npm run build      # versión estática en dist/ (se puede abrir desde cualquier servidor web)
```

## Desarrollo

```bash
npm test                     # tests de la simulación (Vitest)
npm run simulate -- 200      # 200 turnos sin jugador con métricas de salud del mundo
npm run geo                  # regenera el mapa desde Natural Earth 110m (paquete world-atlas)
```

- `src/sim/`: simulación pura, determinista con semilla, ejecutable en Node.
- `src/data/`: todo el contenido en JSON (países, regiones, políticas, acciones, eventos, tecnologías, IA…).
- `src/ui/`: interfaz HTML/CSS + Canvas 2D.
- [DESIGN.md](DESIGN.md): arquitectura, modelo de datos y fórmulas. [PLAN.md](PLAN.md): fases y estado.

Añadir una ley, un evento o una operación es añadir una entrada en `src/data/*.json`.
