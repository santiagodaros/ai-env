# front-studio

Pack de skills para rediseñar un front (Hub CSP) y re-auditar su seguridad. Independiente del resto de los plugins.

## Instalar (Windows, PowerShell)

    node install.cjs C:\ruta\al\repo      # copia a <repo>\.claude\skills
    node install.cjs --user               # o a %USERPROFILE%\.claude\skills
    node install.cjs C:\ruta\al\repo --dry

## Flujo de rediseño (manual, una etapa por vez; el estado vive en `design/` y no en el chat)

1. `/front-studio:redesign` — orquesta y mantiene `design/STATE.md`.
2. `/front-studio:brand-intake` — paleta, fuentes, logo; chequea contraste (`node skills/brand-intake/scripts/contrast.cjs "#fondo:#texto"`).
3. `/front-studio:product-map` — rutas, secciones y conceptos cloud reales de la app → navegación.
4. `/front-studio:design-direction` — dirección visual específica + lista anti-"look IA" + movimiento.
5. `/front-studio:live-preview` — UNA página navegable con estados; `node skills/live-preview/scripts/serve.cjs design/preview` recarga sola.
6. `/front-studio:ui-review` — revisión a11y/movimiento/consistencia.
7. `/front-studio:react-port` — pasa el preview aprobado a componentes React + TypeScript.

## Seguridad

`/front-studio:security-reaudit` — superficies, hallazgos con plantilla (`docs/security/FINDINGS.md`), sin datos de tenant ni nombres de clientes.

## Ejemplo

`examples/portal-muestra/` — marca ficticia, para ver el formato de cada documento.

## Verificado / no verificado

Verificado en Linux: scripts (`node --check`), preview de muestra en Chromium (sin errores de consola, sin overflow a 1280/390 px, drawer con teclado, reduced-motion). Pendiente: correr el flujo completo sobre Hub CSP real en Windows.
