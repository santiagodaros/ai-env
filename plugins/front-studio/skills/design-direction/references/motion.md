# Movimiento en un portal de operaciones

Fuentes verificadas: NN/g (duración de animaciones) y W3C WCAG 2.2 (criterios 2.2.2 y 2.3.3). El resto son criterios de diseño de esta skill, marcados como tales.

## Principio
El movimiento explica un cambio o ubica al usuario. Si no hace ninguna de las dos cosas, se saca. El usuario de un portal operativo repite las mismas acciones decenas de veces por día: lo que luce en la primera vez molesta en la centésima.

## Tiempos (NN/g)
- Casi todo entre 100 y 500 ms; más de 500 ms se siente lento.
- Realimentación simple (casilla, interruptor): alrededor de 100 ms.
- Cambios de pantalla grandes (un panel o modal que entra): 200 a 300 ms.
- Movimientos grandes: hasta 400 ms.
- La salida más corta que la entrada (por ejemplo 300 ms entra, 200 a 250 ms sale).
- Curva: ease-out para entradas (arranca rápido, frena suave).

## Inventario permitido (criterio de la skill)
| Movimiento | Disparador | Duración | Nota |
|---|---|---|---|
| Realimentación de botón y casilla | Acción del usuario | 100 ms | Cambio de color o escala mínima |
| Panel lateral o detalle que abre | Acción | 200 a 300 ms | Desde el borde del que viene |
| Fila que se expande | Acción | 200 ms | Altura, no salto |
| Cambio de alcance (cliente o suscripción) | Acción | 200 ms | Desvanecido cruzado del contenido; el esqueleto aparece de inmediato |
| Toast de confirmación | Resultado de acción | 200 ms entra, 150 sale | Mismo verbo que el botón |
| Esqueleto de carga | Consulta lenta (más de 300 ms) | pulso lento | Con la forma final del contenido |
| Gráfico: dibujo de la línea o barras | Primera carga de la página, una sola vez | 400 ms | Es el único momento orquestado |

No usar: entrada con desplazamiento en cada sección, elevación en cada tarjeta, números que cuentan hasta el valor final (retrasan la lectura y el dato real ya estaba), parallax, manchas animadas de fondo.

## Escalonado
Máximo 40 ms entre elementos y no más de 6 elementos; el resto aparece junto.

## Rendimiento (práctica general)
Animar solo `transform` y `opacity`; evitar animar altura, ancho o márgenes en listas largas (usar `grid-template-rows` o animar un contenedor). Usar `will-change` solo durante la animación.

## Accesibilidad
- `prefers-reduced-motion: reduce`: eliminar traslaciones, escalas y dibujo de gráficos; dejar cambios de opacidad cortos o instantáneos. WCAG 2.3.3 (nivel AAA) pide poder desactivar el movimiento disparado por interacciones y apunta al parallax y a efectos decorativos; la consulta de medios es la técnica que recomienda.
- WCAG 2.2.2 (nivel A): el contenido que se mueve o se actualiza solo, que empieza automáticamente, dura más de 5 segundos y convive con otro contenido, necesita un control para pausar, detener u ocultar. Aplica a tableros que se refrescan solos.
- Nada que parpadee más de tres veces por segundo.

## Herramientas
CSS primero (transiciones y `@keyframes`). Una librería de animación solo si hacen falta transiciones de diseño compartidas entre pantallas; en ese caso, preguntar antes de agregar la dependencia.
