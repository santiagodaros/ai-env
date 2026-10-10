# Tics de una UI generada (y qué hacer en su lugar)

Los que se pueden ver en el código los detecta `${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs` (cada tic tiene un id; el índice va de 0 a 100). Los de juicio (jerarquía, copy, si una métrica es inventada) quedan para la revisión humana o del modelo.

Un tic no está prohibido: es una decisión por defecto. Si el brief o la marca lo pide, se usa. Si aparece sin que nadie lo haya elegido, se revisa.

## Paleta
- Fondo crema con serif de contraste y acento terracota. Fondo casi negro con un único acento ácido (verde o bermellón). Degradados violeta a azul como decoración.
- Hacer: partir de la paleta de la marca; usar el acento solo donde guía una acción o un estado.

## Estructura
- Todo en tarjetas iguales con el mismo radio y la misma sombra gris suave, independientemente de la jerarquía.
- Cuadrícula tipo "bento" por costumbre; hero centrado con tres tarjetas debajo.
- Hacer: jerarquía asimétrica; tabla o lista donde el contenido es una tabla; agrupar por tarea, no por simetría.

## Tipografía y rótulos
- Etiqueta en mayúsculas espaciadas sobre cada título; una sola palabra del título en cursiva o en color; textos unidos con puntos medios; flechas "→" al final de cada enlace.
- Fuente monoespaciada para cualquier dato chico.
- Hacer: rótulos solo cuando agregan información; monoespaciada o cifras tabulares solo donde se comparan números.

## Contenido y texto
- Saludos ("Hola de nuevo 👋"), frases de venta ("Potenciá tu operación"), métricas inventadas, texto de relleno, emojis como íconos.
- Hacer: copy de interfaz con verbos claros ("Guardar cambios", no "Enviar"), mismo nombre para la misma acción en todo el flujo, errores que dicen qué pasó y cómo corregirlo, vacíos que invitan a actuar.

## Dashboards (específico de este portal)
- Fila de 4 tarjetas KPI con sparkline y delta verde, gráfico de torta, panel de "insights de IA", alturas idénticas.
- Hacer: arrancar de la pregunta "qué cambió y qué requiere acción". Los KPI pueden ir arriba si responden esa pregunta; si no, abajo. Mostrar delta con signo, dirección y período, no solo color.

## Movimiento
- Entrada con desvanecido y desplazamiento hacia arriba en cada sección, elevación al pasar el mouse por cada tarjeta, manchas de degradé flotando, desenfoque tipo vidrio en todo.
- Hacer: ver `motion.md`. Movimiento que responde a una acción o ubica al usuario; un solo momento orquestado.

## Ids del detector
`paleta-crema-terracota`, `negro-acido`, `degrade-violeta`, `texto-degrade`, `radio-unico`, `sombra-gris-suave`, `eyebrow-mayusculas`, `flecha-enlace`, `punto-medio`, `raya-etiqueta`, `emoji-icono`, `vidrio`, `entrada-fade-up`, `hover-elevacion`, `copy-de-venta`, `fuente-por-defecto`, `negro-tintado`, `mono-etiquetas`, `fila-kpi`, `manchas-blur`, `numeracion-decorativa`.

## Prueba final
Quitá un accesorio: eliminá la decoración que no sirve a una tarea. Si la pantalla se entiende igual, sobraba.
