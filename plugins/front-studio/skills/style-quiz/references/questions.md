# Preguntas del quiz de estilo

Tres rondas de hasta 4 preguntas (el límite de AskUserQuestion). Cada opción mueve una perilla. Si una respuesta ya se deduce del repo, de `design/brand.md` o de `design/product-map.md`, no se pregunta: se aplica y se dice. Con `preview` en las opciones se puede mostrar un ejemplo corto (ASCII o texto) de cómo se vería.

## Ronda 1 — Marco

| Pregunta | Opción → perilla |
|---|---|
| ¿Qué tiene que lograr esta página? | Hacer una tarea repetida rápido → `surface=operar` · Que alguien entienda y decida → `convencer` · Leer algo largo → `leer` · Vivir un recorrido → `experiencia` |
| ¿Cuánta información por pantalla? | Lo esencial, con aire → `density=2` · Equilibrado → `density=5` · Mucha, como una consola → `density=8` |
| ¿Qué tan distinta de lo habitual en su categoría? | Familiar, que nadie tenga que aprender → `variance=2` · Reconocible pero con carácter → `variance=5` · Que se recuerde, aunque arriesgue → `variance=8` |
| ¿Cuánto movimiento? | Solo la respuesta a lo que hago → `motion=1` · Transiciones suaves entre estados → `motion=4` · Expresivo, con un momento especial → `motion=7` |

## Ronda 2 — Carácter

| Pregunta | Opción → perilla |
|---|---|
| ¿Qué temperatura? | Precisa y técnica → `temperature=frio` · Neutra → `neutro` · Cálida y cercana → `calido` |
| ¿Qué forma? | Recta, de documento → `shape=recto` · Suave → `suave` · Redondeada, amable → `redondo` |
| ¿Profundidad? | Plana, separada por líneas y fondos → `depth=plano` · Sutil → `sutil` · Marcada, con capas → `marcado` |
| ¿Qué voz tipográfica? | Geométrica y limpia → `type=geometrica` · Humanista, cercana → `humanista` · Serif editorial → `serif` · Técnica, de ingeniería → `tecnica` |

## Ronda 3 — Color y voz

| Pregunta | Opción → perilla |
|---|---|
| ¿Cuánto color? | Casi todo neutro, color solo para estado y acción → `accentUse=minimo` · Moderado → `moderado` · La marca protagonista → `protagonista` |
| ¿Tema? | Claro → `theme=claro` · Oscuro → `oscuro` · Ambos según el sistema → `ambos` |
| ¿Contraste? | AA (4,5:1, lo mínimo correcto) → `contrast=medio` · AAA en el texto principal (7:1) → `alto` |
| ¿Cómo habla la interfaz? | Sobria → `voice=sobria` · Cercana → `cercana` · Técnica → `tecnica` · Enérgica → `energica` |

## Cierre (texto libre, una pregunta)
"¿Hay algo que no quieras ver?" → `avoid` (lista). Si nombra un tic conocido (degradés, tarjetas iguales, emojis), mapealo al id de `ai-look` para que el detector lo vigile.

## Reglas
- La superficie fija los valores iniciales (`style.cjs --preset`); las respuestas solo mueven lo que el usuario contestó.
- Respuestas contradictorias (densidad 8 en una landing): preguntá una vez cuál pesa más; si insiste, queda y `style.cjs` lo marca como aviso para justificar en la dirección.
- La accesibilidad no es una perilla: AA es el piso siempre.
