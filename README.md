# World of System

Simulador de estrategia geopolítica 2D para navegador, de un jugador y en tiempo real desde enero de 2026: el reloj
corre solo (pausa con la barra espaciadora, velocidades 1/2/3) y el mundo se recalcula cada mes de juego.
Diriges un país real; el resto del mundo lo gobierna una IA con personalidad, memoria y motivos explicables.

Además de economía, política, diplomacia, guerra e inteligencia, puedes gobernar con tu propio partido (o con
cualquiera de los existentes), atender las necesidades civiles de la población, dirigir la policía, combatir seis
tipos de corrupción y el narcotráfico, diseñar o comprar tu armamento y —si te atreves— crear patógenos en un
programa biológico secreto.

## Cómo jugar

Siempre tienes una **misión** a la vista que te dice qué hacer ahora: pulsa «¡Vamos!» y el juego te lleva al sitio
donde se cumple. Al completarla ganas capital político y prestigio (que te sube de rango) y llega la siguiente.

Al empezar, una guía corta te enseña lo básico. El **Panel de mando** resume tu país en seis medidores de color y
tus **consejeros** te proponen lo más urgente con un botón. Haz clic en otro país del mapa para comerciar, aliarte,
ayudar, sancionar, espiar o atacar, y mira el efecto en el mapa. Todo el detalle sigue ahí, en «Avanzado» y en las
secciones de la izquierda.

Para abrirlo hay dos formas:

1. **Sin instalar nada (doble clic):** descarga el repositorio y abre `jugar/WorldOfSystem.html` con doble clic.
   Es un único archivo HTML con todo dentro (código, estilos y mapa), funciona sin conexión y sin servidor.
   Las partidas se guardan en el navegador.
2. **Modo desarrollo:** con Node.js instalado,

   ```bash
   npm install
   npm run dev        # abre http://localhost:5173
   ```

`npm run build` genera `dist/index.html` (también autocontenido, se abre con doble clic) y actualiza la copia jugable
`jugar/WorldOfSystem.html`. Abrir el `index.html` de la raíz directamente no funciona: es la plantilla de desarrollo
y necesita `npm run dev`.

## Desarrollo

```bash
npm test                     # tests de la simulación (Vitest)
npm run simulate -- 200      # 200 meses sin jugador con métricas de salud del mundo
npm run geo                  # regenera el mapa desde Natural Earth 110m (paquete world-atlas)
```

- `src/sim/`: simulación pura, determinista con semilla, ejecutable en Node.
- `src/data/`: todo el contenido en JSON (países, regiones, políticas, acciones, eventos, tecnologías, IA…).
- `src/ui/`: interfaz HTML/CSS + Canvas 2D.
- [DESIGN.md](DESIGN.md): arquitectura, modelo de datos y fórmulas. [PLAN.md](PLAN.md): fases y estado.

Añadir una ley, un evento o una operación es añadir una entrada en `src/data/*.json`.
