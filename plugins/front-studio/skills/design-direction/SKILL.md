---
name: design-direction
description: Define UNA dirección visual y de movimiento para el portal, anclada en la marca y en el mundo del producto, y la contrasta contra los tics de UI generada. Escribe design/direction.md. Etapa 3 del rediseño.
argument-hint: "[notas de gusto: referencias, qué no te gusta de la UI actual]"
disable-model-invocation: true
---

# Dirección de diseño

Requiere `design/brand.md` y `design/product-map.md`. La identidad sale del mundo del producto (consolas, topologías, tableros de estado, runbooks), no de una receta genérica de dashboard. La marca fija color y tipografía; esta etapa decide el resto.

## Pasos

1. **Preguntá qué no le gusta de la UI actual** (una pregunta, con las capturas si hay). Eso pesa más que cualquier gusto declarado.
2. **Elegí UNA idea central** tomada del mundo del producto y escribila en una frase. Ejemplo de forma, no de contenido: "tablero de operaciones donde el estado se lee antes que el dato". Gastá la audacia en un solo lugar y mantené el resto sobrio.
3. **Armá el plan compacto**:
   - Color: la paleta de `brand.md` y qué rol cumple cada uno; dónde aparece el acento (poco).
   - Tipografía: roles y escala (con relación entre niveles de al menos 1,25), cifras tabulares para datos, largo de línea menor a 80 caracteres en texto corrido.
   - Forma: un sistema de radios que dependa de la jerarquía (no un solo radio para todo), bordes y sombras con criterio.
   - Disposición: wireframe ASCII del esqueleto (navegación, barra superior con alcance y búsqueda, área de contenido) y de la pantalla de inicio. Alineación y densidad (alta, salvo que la persona principal pida lo contrario).
4. **Contrastá contra los tics**: leé `references/ai-tells.md`, marcá cuáles aparecen en tu plan, y revisalo. Hacé la prueba de la segunda consulta: si otra consulta parecida llevaría a este mismo plan, es genérico; cambialo. Anotá qué cambiaste y por qué.
5. **Especificá el movimiento** con `references/motion.md`: inventario corto de movimientos permitidos (disparador, duración, curva), el único momento orquestado de carga, y el reemplazo con `prefers-reduced-motion`.
6. **Escribí `design/direction.md`** (una página): idea central, plan, wireframes, tabla de movimiento, qué se descartó y por qué. Si hay una alternativa seria, descríbila en 3 líneas; no generes mockups de ninguna.

## Compuerta
El usuario elige la dirección. Registrala en `design/STATE.md`. No pasar al preview sin elección.
