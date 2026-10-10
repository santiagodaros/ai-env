# Tipos de superficie

Cada pantalla tiene un trabajo principal. El tipo de superficie decide densidad, escala tipográfica, movimiento y qué cuenta como "bueno". Se define por pantalla en `design/product-map.md` (una app puede tener las cuatro: landing para convencer, panel para operar, ayuda para leer, onboarding como experiencia).

| | Operar | Convencer | Leer | Experiencia |
|---|---|---|---|---|
| Trabajo | Hacer una tarea repetida, rápido y sin errores | Que alguien entienda y decida (registrarse, comprar, pedir demo) | Entender un contenido largo | Sentir algo; el recorrido es el producto |
| Ejemplos | Panel de costos, consola, admin, ABM, tablero de estado | Landing, página de precio, caso de éxito | Documentación, artículo, informe, ayuda | Onboarding, juego, presentación interactiva, campaña |
| Densidad | Alta (perilla 6-9) | Baja-media (2-5) | Media, columna angosta (3-5) | Libre (0-10) |
| Escala tipográfica | Compacta: base 14-15 px, relación 1,125-1,2 | Amplia: relación 1,25-1,5; el título trabaja | Base 17-18 px, relación 1,2-1,25, línea 60-75 caracteres, interlineado 1,6 | Expresiva; la tipografía puede ser el elemento visual |
| Movimiento | Mínimo (0-3): realimentación y transiciones de estado | Moderado (3-6): un momento orquestado | Casi nulo (0-2) | Alto permitido (5-10) con reduced-motion |
| Color | Neutro dominante; el color codifica estado y acción | La marca con presencia; un acento que guía al CTA | Neutro; acento solo en enlaces | Libre, al servicio del recorrido |
| Qué se mide | Tiempo a la tarea, errores, estados (cargando, vacío, error, desactualizado, sin permiso) | Claridad del mensaje en 5 segundos, una acción principal, prueba (casos, datos reales) | Legibilidad, navegación interna, búsqueda | Ritmo, sorpresa, que se pueda saltar |
| Tics típicos de IA | Fila de 4 KPI con sparkline, torta, panel de "insights" | Hero centrado + 3 tarjetas + degradé, copy de venta | Columnas de diario con filetes por costumbre | Partículas y manchas sin sentido |
| Accesibilidad crítica | Teclado completo, tablas semánticas, foco tras acciones, aria-live | Contraste del CTA, alt de imágenes, nada que se mueva solo sin pausa | Jerarquía de encabezados, zoom 200 %, contraste del cuerpo | Alternativa sin movimiento, controles para pausar, subtítulos |
| Performance | TBT bajo (interacción fluida con tablas grandes) | LCP rápido (la imagen o el título principal) | FCP rápido, fuentes con swap | Presupuesto explícito de JS y medios |

## Cómo usarlo
- `product-map`: asigná un tipo por pantalla. Si una pantalla mezcla dos, elegí el dominante y anotá el secundario.
- `style-quiz`: el tipo fija los valores iniciales de las perillas; las respuestas los mueven dentro del rango.
- `design-direction` y `ui-options`: una dirección que contradice el tipo (por ejemplo, movimiento alto en "operar") tiene que justificarlo.
- `ui-review` y `ui-options`: los hallazgos se ponderan por tipo (un LCP lento es P0 en "convencer"; una tabla sin teclado es P0 en "operar").
