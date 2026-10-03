# Checklist de accesibilidad para UI de operaciones

Criterios de WCAG 2.2 que más se incumplen en portales de datos. Entre paréntesis, el criterio y su nivel.

## Percepción
- Texto normal con contraste mínimo 4,5:1; texto grande y componentes de UI (bordes de campos, íconos que transmiten información, foco) 3:1 (1.4.3 AA, 1.4.11 AA). Verificar con el script, no a ojo.
- Nada se comunica solo por color: estados, deltas y severidad llevan ícono o texto (1.4.1 A).
- El contenido funciona a 320 px de ancho sin scroll horizontal de página (1.4.10 AA); las tablas pueden desplazarse dentro de su contenedor.
- Texto escalable al 200 % sin perder contenido.

## Operación
- Todo funciona con teclado, sin trampas de foco (2.1.1 A, 2.1.2 A).
- Foco siempre visible y no tapado por barras fijas (2.4.7 AA, 2.4.11 AA en 2.2).
- Objetivos táctiles o de clic de al menos 24 × 24 px o con separación suficiente (2.5.8 AA en 2.2).
- Al cambiar de ruta, el foco va al contenido y el título de página cambia (2.4.2 A).
- Atajos de teclado de una sola tecla se pueden desactivar o remapear (2.1.4 A).

- Si Enter o Espacio abre un panel y el foco salta a un botón dentro de él, llamar a `preventDefault()`: el navegador aplica la tecla al nuevo elemento enfocado y puede cerrar el panel al instante. Al cerrar, devolver el foco al elemento que lo abrió.

## Estructura y nombres
- Puntos de referencia: `header`, `nav` (con nombre), `main`.
- Tablas con `th` y `scope`; encabezados reales (`h1` a `h6`) en orden.
- Campos con etiqueta visible asociada; botones de solo ícono con nombre accesible (3.3.2 A, 4.1.2 A).
- Errores identificados en texto y asociados al campo, con la forma de corregirlos (3.3.1 A, 3.3.3 AA).

## Dinámico
- Toasts, resultados de carga y errores se anuncian con una región `aria-live` (4.1.3 AA).
- Contenido que se refresca solo por más de 5 segundos necesita pausar, detener u ocultar (2.2.2 A).
- Movimiento: `prefers-reduced-motion` (2.3.3 AAA como referencia) y sin destellos más de tres veces por segundo (2.3.1 A).

## Verificación mínima antes de dar por bueno
Recorrer la pantalla solo con teclado; hacer zoom a 200 %; ver a 320 px; activar "reducir movimiento" del sistema; revisar con un lector de pantalla las acciones principales.
