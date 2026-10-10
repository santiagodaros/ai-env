---
name: preview-setup
description: Genera .claude/launch.json para el panel de preview de la app de escritorio y saca capturas antes/después con Playwright.
argument-hint: "[launch|before|after|compare] [URL o rutas]"
disable-model-invocation: true
---

# Preview en vivo

Dos caminos según dónde se trabaja. Los dos pueden convivir.

## App de escritorio (pestaña Code): panel de preview
El panel muestra la app corriendo y, con `autoVerify`, Claude la revisa sola (captura, DOM, clics) después de cada cambio. Se configura por proyecto en `.claude/launch.json`; un plugin no puede traerlo instalado, por eso esta skill lo genera.

1. Generá o completá el archivo:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/preview-setup/scripts/launch-json.cjs"`
   Detecta gestor de paquetes por lockfile, script (`dev`, `start`, `preview`, `serve`), framework y puerto (del script, de `vite.config` o el del framework). En monorepos agrega una configuración por app. Si existe `design/`, agrega `design` con el servidor sin dependencias de front-studio (lo copia a `design/serve.cjs`) para ver previews, opciones y kits.
   Opciones: `--app <carpeta>`, `--port N`, `--dry-run` (muestra sin escribir), `--force` (reemplaza configuraciones con el mismo nombre; deja `.bak`), `--no-design`.
2. Mostrale al usuario el resultado y cómo abrir el panel: botón de preview en la pestaña Code o `Ctrl+Shift+B` en Windows (`Cmd+Shift+B` en macOS).
3. Versioná `.claude/launch.json` si el equipo usa la app; no tiene secretos (si una configuración necesita variables sensibles, que las lea de `.env`, nunca escritas en el archivo).
4. Si en Windows el panel informa que arrancó pero no aparece nada, probá `"runtimeExecutable": "npm.cmd"` (o `pnpm.cmd`) en esa configuración: hay reportes abiertos de procesos que no se lanzan en Windows con el ejecutable sin extensión.

## Terminal: capturas de antes y después
Con el servidor corriendo (sin `--url` toma el primer puerto de `.claude/launch.json`):

    node "${CLAUDE_PLUGIN_ROOT}/skills/preview-setup/scripts/shots.cjs" before --routes "/,/costos,#/inicio" --widths 390,1280
    … cambios …
    node "${CLAUDE_PLUGIN_ROOT}/skills/preview-setup/scripts/shots.cjs" after
    node "${CLAUDE_PLUGIN_ROOT}/skills/preview-setup/scripts/shots.cjs" compare

- `after` repite las mismas rutas y anchos que `before`. `--full` captura la página entera; `--dark` en tema oscuro. Las capturas se toman con reduced-motion para que sean estables.
- Cada corrida avisa desbordes horizontales y errores de consola por ruta y ancho.
- `compare` escribe `design/shots/compare.html` (deslizador antes/después y vista lado a lado) con el porcentaje de píxeles que cambió.
- Mirá vos las capturas clave con Read (son PNG) antes de decir que algo quedó bien.
- `design/shots/` va a `.gitignore`: son binarios.
- Necesita Playwright (del proyecto o global). Si no está, el script dice cómo instalarlo. Para explorar a mano también sirve `playwright-cli` (`playwright-cli open <url>`, `playwright-cli resize 1280 800`, `playwright-cli screenshot`), que gasta menos contexto que un MCP de navegador.

## Si hay un navegador conectado a la sesión
El navegador integrado o Claude in Chrome reemplazan a las capturas para revisar en el momento (captura, consola, clics). Las capturas de `shots.cjs` siguen sirviendo como registro de antes y después.
