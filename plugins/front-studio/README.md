# front-studio

Rediseño y crítica de UI con números verificables: estilo por preguntas, kit de diseño por página, tres direcciones más la estándar en una sola página, preview en vivo, accesibilidad, performance, detector de look de IA y plan de trabajo con issues. Incluye la re-auditoría de seguridad de apps web. Independiente del resto de los plugins.

## Instalar

Con el instalador del repo (instala todos los plugins) o solo este:

    claude plugin marketplace add santiagodaros/ai-env
    claude plugin install front-studio@ai-env

## Qué hay

| Skill | Para qué | Script determinista |
|---|---|---|
| `redesign` | Orquesta las etapas con compuertas; estado en `design/STATE.md` | — |
| `ui-options` | Crítica completa de una UI existente: Nielsen /40, estados, accesibilidad, performance, look de IA → `PLAN.md` + issues, y tres direcciones + la estándar con selector | `a11y-scan`, `perf-score`, `ai-look`, `plan` |
| `brand-intake` | Marca global con contraste WCAG calculado | `contrast.cjs` |
| `product-map` | Arquitectura de información, con tipo de superficie por pantalla | — |
| `style-quiz` | Preguntas de opción múltiple → perillas en `design/style.json` | `style.cjs` |
| `page-kit` | Kit de una página: tokens CSS/JSON/Tailwind v4, escalas OKLCH con AA verificado en claro y oscuro, tipografía fluida, espaciado, radios, movimiento, hoja de muestra | `page-kit.cjs` |
| `design-direction` | Una dirección o tres opciones + la estándar, contrastadas contra los tics de UI generada | `ai-look` |
| `live-preview` | Un único preview HTML navegable con estados | `serve.cjs` |
| `preview-setup` | `.claude/launch.json` para el panel de preview de la app de escritorio; capturas antes/después en la terminal | `launch-json.cjs`, `shots.cjs` |
| `react-port` | Pasa el preview aprobado al código por rebanadas | — |
| `ui-review` | Revisión de un diff o una pantalla (se activa sola) con plan de corrección | los cuatro analizadores |
| `security-reaudit` | Re-auditoría de seguridad contra una línea base | — |

Las skills se invocan con `/front-studio:<skill>`; todas salvo `ui-review` son manuales.

## Tipos de superficie

`references/surfaces.md`: **operar** (paneles, consolas), **convencer** (landing, precios), **leer** (documentación, informes) y **experiencia** (onboarding, juegos). Cada pantalla tiene uno; fija densidad, escala tipográfica, movimiento, qué se mide y qué pesa en la crítica (un LCP lento es P0 en convencer; una tabla sin teclado es P0 en operar).

## Analizadores (sin dependencias; Playwright opcional)

    node scripts/ai-look.cjs <ruta> [--allow id,id] [--max 15]       # índice de look de IA 0-100, 21 tics con evidencia
    node scripts/a11y-scan.cjs <ruta> [--max-p0 0]                   # WCAG 2.2 estático, puntaje 0-100 + lista manual
    node scripts/perf-score.cjs <build|index.html> [--url URL] [--perfil movil|escritorio]
    node scripts/plan.cjs design/review/*.json --out design/review/PLAN.md --issues design/review/issues

- `perf-score` con `--url` mide FCP, LCP, TBT y CLS en Chromium local con perfil móvil (CPU 4x, red lenta). Es laboratorio local, no Lighthouse ni datos de campo, y así lo informa. Sin URL, es una estimación estática.
- `plan` ordena por severidad y esfuerzo, agrupa en paquetes por fase y área, da un criterio de "hecho" por tarea y deja los `gh issue create` listos para revisar (uno por paquete).
- Todos aceptan `--json` / `--out` y comparten la forma de hallazgo, así se combinan.

## Flujo típico

UI existente: `ui-options` → elegir dirección → `page-kit` → `live-preview` → `react-port` → `ui-review`.
Desde cero: `brand-intake` → `product-map` → `style-quiz` → `page-kit` → `design-direction` → `live-preview` → `react-port`.

## Ejemplo

`examples/portal-muestra/`: marca ficticia, para ver el formato de cada documento.

## Verificado / no verificado

Verificado en Linux con Chromium (Playwright 1.56): los analizadores contra fixtures buenos y malos (`tests/fixtures/front/`), `page-kit` en las cuatro superficies (42 pares de contraste por kit, sin desborde a 390 px, claro y oscuro), `shots.cjs` antes/después/compare contra el preview de muestra, el selector de opciones con teclado y `?dir=`. Pendiente: el panel de preview de la app de escritorio leyendo el `launch.json` generado (en particular en Windows) y una corrida completa sobre una app real.
