# Dirección (MUESTRA)

Ejemplo de la salida de `design-direction`.

**Idea central:** *el parte de turno*. La pantalla de inicio se lee como el traspaso de guardia de un equipo de operaciones: primero lo que requiere acción, ordenado por urgencia; después lo que cambió desde ayer. El estado se lee antes que el dato.

**Descartado por genérico:** fila de tarjetas KPI con sparkline y delta verde; gráfico de torta; panel de "insights"; tarjetas iguales para todo.

**Color:** la paleta de la marca; el acento solo en la acción principal y el elemento seleccionado. Navegación en tinta oscura, contenido sobre papel claro.
**Tipografía:** `system-ui`; cifras tabulares; escala 12/14/16/20/28; títulos 600, cuerpo 400.
**Forma:** radios por jerarquía (2 px en datos y campos, 6 px en paneles y detalle); sin sombras, solo líneas finas donde separan información.
**Disposición:** navegación fija a la izquierda; barra superior con alcance, búsqueda, rango de tiempo y "actualizado"; inicio en dos columnas (acción 60 %, cambios 40 %); densidad alta.

## Movimiento
| Qué | Cuándo | Duración | Curva |
|---|---|---|---|
| Barras de gasto se dibujan | Primera carga de la sesión, una vez | 400 ms | ease-out |
| Panel de detalle entra por la derecha | Clic en una fila | 250 ms (sale en 180 ms) | ease-out |
| Contenido al cambiar de alcance | Cambio de cliente | 200 ms (opacidad) | ease-out |
| Aviso de confirmación | Acción | 200 ms (sale en 150 ms) | ease-out |
| Esqueleto | Carga lenta | pulso de 1,4 s | lineal |

Con `prefers-reduced-motion: reduce`: todo instantáneo, sin dibujo ni desplazamiento.
