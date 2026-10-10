---
name: live-preview
description: Construye UNA página HTML navegable con la dirección aprobada, con pantallas, estados y movimiento, y la muestra en vivo (navegador local con recarga, o artifact). Etapa 4 del rediseño; reemplaza los sets de mockups.
argument-hint: "[pantalla a trabajar primero]"
disable-model-invocation: true
---

# Preview vivo

Requiere `design/brand.md`, `design/tokens.css`, `design/product-map.md` y `design/direction.md` aprobados. Si la pantalla tiene kit propio (`design/pages/<slug>/tokens.css`, de `page-kit`), usá ese en lugar de los tokens globales. Se trabaja sobre **un solo archivo**, `design/preview/index.html`, que se edita en el lugar.

## Reglas
- Un archivo, sin build, sin dependencias. CSS y JS inline; solo las fuentes pueden venir de afuera.
- **No hagas varios mockups.** Las pantallas son rutas dentro de la misma página (`#/inicio`, `#/costos`...); los estados se ven con `?state=loading|empty|error|stale|noperm|partial`; si hay una decisión abierta (por ejemplo dos navegaciones), una sola variante alternativa con `?nav=b`.
- Datos de ejemplo realistas y sin nombres de cliente ni IDs reales.
- El esqueleto `templates/preview-shell.html` no tiene estilo. La identidad sale de `direction.md`. Si lo que armás se parece al esqueleto, no está terminado.
- Cada bloque que será un componente de React lleva `data-component="nombre"` (lo usa `react-port`).
- Piso de calidad: foco visible, navegación por teclado, `prefers-reduced-motion` respetado, contraste verificado con `node "${CLAUDE_PLUGIN_ROOT}/skills/brand-intake/scripts/contrast.cjs"`, responsive hasta 360 px (los hijos de una grilla que contienen tablas llevan `min-width: 0` o columnas `minmax(0, 1fr)`; las tablas anchas se desplazan dentro de su contenedor).

## Pasos
1. Si falta `design/preview/index.html`, copiá `templates/preview-shell.html` y pegá los tokens (de la página o globales) entre los marcadores `TOKENS`. Copiá también `scripts/serve.cjs` a `design/serve.cjs` (queda versionado y con ruta estable). Para la app de escritorio, `/front-studio:preview-setup` genera `.claude/launch.json` y el panel de preview lo muestra y lo verifica solo.
2. Construí primero el **esqueleto** (barra superior con alcance, navegación) y **una pantalla clave** (la de inicio). Mostrala antes de seguir con las demás.
3. Agregá las pantallas de a una, con sus estados. Después, el movimiento según la tabla de `direction.md` y nada más.
4. Editá con cambios dirigidos (Edit). No regeneres el archivo entero: se pierde lo aprobado y se gastan tokens.
5. Antes de mostrar, abrilo con una herramienta de navegador si hay una disponible (navegador integrado o Claude in Chrome), sacá una captura, revisá la consola y corregí lo que se vea roto. Sin navegador, `shots.cjs` de `preview-setup` captura a 390 y 1280 px y avisa desbordes y errores de consola.
6. Antes de pedir aprobación: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs" design/preview --allow <ids de direction.md>` (objetivo ≤ 15) y `node "${CLAUDE_PLUGIN_ROOT}/scripts/a11y-scan.cjs" design/preview` (sin P0).

## Cómo mostrarlo
- **En Claude Code (terminal):** `node design/serve.cjs design/preview` abre el navegador y recarga solo al guardar. Si la terminal es de Windows, corre igual. Dejalo corriendo en segundo plano.
- **En la app de Claude con artifacts (verificado):** hay dos caminos y no son intercambiables.
  - Tipo *Design* (si `Artifact` con `action: quickstart`, `intent: design` lo lista): usa formato propio (`.dc.html`, `<x-dc>`, `project/canvas.json`), sin DOM armado por script ni listeners globales de teclado. Sirve para lienzos de diseño editables; **no** sirve para pegar un preview con rutas, estados y JS.
  - Artifact HTML a mano (recomendado para este preview): una sola página sin `<!doctype>/<head>/<body>`, `<title>` de 2–4 palabras, tokens en `:root` + overrides oscuros (`:root:not([data-theme="light"])` y `:root[data-theme="dark"]`), `body` con fondo explícito, gutter ≥16 px, `icon` en el primer publish. Para cambios, republicá el mismo archivo.
  - No crees un artifact de tipo Design "para probar": queda vacío y borrarlo requiere pedido explícito del usuario.
- Sin navegador ni artifacts: entregá el archivo y pedile al usuario que lo abra (`start design\preview\index.html` en Windows).

## Compuerta
El usuario aprueba mirando el preview, pantalla por pantalla y con los estados. Registralo en `design/STATE.md`. Cada ronda de cambios es una edición del mismo archivo.
