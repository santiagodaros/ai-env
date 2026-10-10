---
name: design-direction
description: Dirección visual (una, o tres más la estándar de la categoría) anclada en marca, superficie y dominio, contrastada contra los tics de UI generada. Etapa 3.
argument-hint: "[una|opciones] [notas de gusto: referencias, qué no te gusta de la UI actual]"
disable-model-invocation: true
---

# Dirección de diseño

Requiere `design/brand.md` y `design/product-map.md` (con el tipo de superficie de cada pantalla). Si existe `design/style.json` (de `style-quiz`), sus perillas son el punto de partida. La identidad sale del mundo del producto (sus materiales, instrumentos, unidades y jerga), no de una receta genérica. La marca fija color y tipografía; esta etapa decide el resto.

## Modo
- **`una`** (por defecto si el usuario ya sabe lo que quiere o hay una UI aprobada que se extiende): una sola dirección.
- **`opciones`** (por defecto si no hay gusto declarado, si el usuario pide alternativas o si la UI actual se rechaza entera): tres direcciones distintas y de igual peso, más la **estándar de la categoría** como referencia honesta. Si además hay que criticar la UI existente, usá `/front-studio:ui-options`, que hace la crítica y estas opciones juntas.

## Pasos

1. **Leé el tipo de superficie** de las pantallas en juego en `${CLAUDE_PLUGIN_ROOT}/references/surfaces.md`. Fija rangos de densidad, escala y movimiento. Una dirección que se sale del rango lo justifica por escrito.
2. **Preguntá qué no le gusta de la UI actual** (una pregunta, con capturas si hay). Eso pesa más que cualquier gusto declarado.
3. **Idea central**: una frase tomada del mundo del producto. Ejemplo de forma, no de contenido: "tablero de operaciones donde el estado se lee antes que el dato". Gastá la audacia en un solo lugar y mantené el resto sobrio.
4. **Plan compacto** por dirección:
   - Color: la paleta de `brand.md` y el rol de cada color; dónde aparece el acento (poco).
   - Tipografía: roles y escala (relación entre niveles según la superficie), cifras tabulares para datos, largo de línea menor a 80 caracteres en texto corrido.
   - Forma: radios por jerarquía (no uno solo para todo), bordes y sombras con criterio.
   - Disposición: wireframe ASCII del esqueleto y de la pantalla clave. Alineación y densidad.
   - Movimiento: según `references/motion.md`: inventario corto (disparador, duración, curva), el único momento orquestado y el reemplazo con `prefers-reduced-motion`.
5. **En modo opciones**, las tres direcciones tienen que diferir en al menos tres de estos ejes: estructura de la disposición, voz tipográfica, estrategia de color, densidad, modelo de navegación, movimiento. Si dos se parecen, descartá una y pensá otra. Cada una lleva nombre, idea central, la apuesta (qué gana), el riesgo (qué pierde) y para quién sirve. La **estándar** describe lo que haría un producto competente y convencional de esa categoría: sirve para medir cuánto se arriesga cada opción, no se presenta como peor.
6. **Contrastá contra los tics**:
   - Leé `references/ai-tells.md` y marcá cuáles aparecen en el plan; revisalo. Prueba de la segunda consulta: si otra consulta parecida llevaría al mismo plan, es genérico; cambialo y anotá qué y por qué.
   - Cuando haya CSS o HTML (un preview, una opción armada, la UI actual), corré el detector:
     `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs" design/preview --allow <tics-elegidos-a-propósito>`
     Lo que la dirección decide a propósito va en `--allow` y queda escrito en `direction.md` con el motivo. Objetivo: índice ≤ 15.
7. **Escribí `design/direction.md`** (una página por dirección como máximo): idea central, plan, wireframes, tabla de movimiento, tics permitidos con motivo (`ai-look-allow: id, id`), qué se descartó y por qué. En modo opciones, una sección por dirección y una tabla comparativa (eje × dirección).
8. **Para verlas**: en modo opciones, armá las tres más la estándar en **una sola página con selector** usando `${CLAUDE_PLUGIN_ROOT}/skills/ui-options/templates/options-shell.html` (mismo contenido real, cambia la dirección). No hagas un archivo por opción ni un set de mockups.

## Compuerta
El usuario elige una dirección (o una mezcla explícita: "estructura de B con el color de A"). Registrala en `design/STATE.md` con fecha. No pasar al preview sin elección.
