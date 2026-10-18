# Cambios

Cada plugin tiene su versión y cada publicación su tag `<plugin>--v<versión>`. Acá va lo que cambia para quien los usa.

## 2026-10-18 — dev-flow 2.6.0

- init deja en CLAUDE.md la forma de trabajo (arranque, qué es terminado, alcance, cierre) y docs/STATE.md con Siguiente paso y Bloqueos, que rehydrate muestra al arrancar y primero tras /compact; stop-verify frena debugger, .only, fit y fdescribe agregados; dispatch next da el próximo paso de cada ticket con su comando (lanzar, reanudar, recoger, PR, auditar, decisión humana, cierre)

## 2026-10-18 — idea-lab 1.0.0

- Plugin nuevo: /idea-lab:shape lleva una idea chica a una idea definida (preguntas cerradas, mercado con fuentes por subagentes scout, 16 ángulos que decide idea.cjs check, escéptico en frío, comunicado y preguntas, preview.html) y termina con la decisión de la persona; /idea-lab:plan arma el plan de product engineer (validar primero, no-gos, rebanadas, hitos usables, métricas, salida a producción) y genera el PRD en el formato de /dev-flow:prd. En todos los perfiles. Catálogo del README generado y chequeado en CI

## 2026-10-18 — dev-flow 2.5.0

- secscan marca texto oculto (ancho cero, bidi, Unicode Tags) como S013 alto, también en el pre-commit y el piso de quick-fix; collect y card verify --issue frenan archivos fuera del Alcance sin justificar (scope_extensions) y cambios de solo formato; noticed_out_of_scope en la tarjeta; tablas de excusas en los agentes y en quick-fix y feature-close; pasos con verificación en feature-flow, dispatch e init

## 2026-10-11 — dev-flow 2.4.0

- dispatch: el tamaño L sube a opus solo al implementer (docs sigue en haiku y sre en sonnet, con turnos y esfuerzo de L); si un lote no entra, informa cuántos tickets más entrarían con los implementers L en sonnet y lo aplica solo con --allow-downgrade-implementer. El auditor nunca baja de modelo

## 2026-10-10 — dev-flow 2.3.0

- init brownfield: frena si va a tocar archivos con cambios sin commitear, rollback automático, .gitattributes y .editorconfig si faltan, huecos del arnés y plan de higiene, pruebas con CI=1 y pre-commit nativo opcional (secscan y arch-check)

## 2026-10-10 — dev-flow 2.2.0

- quick-fix blindado: el piso del carril mira el contenido del diff (líneas agregadas y eliminadas: auth, sesión, CORS, TLS, roles, secretos, CSRF, ejecución dinámica) y los hallazgos medios de secscan, además de la ruta (por palabras, sin falsos positivos como author.ts); --plan antes de editar; una sola parada humana. Tamaño T en tickets sin lanzar sesión. Burn-rate (% por minuto) desde la statusline y presupuesto del lote completo en dispatch, con cola en el plan

## 2026-10-10 — dev-flow 2.1.0

- Perfiles de plugins por repo (core, app, cloud, frontend, full) desde shared/profiles.json: /dev-flow:init sugiere el perfil según el stack y activa solo esos plugins en .claude/settings.json o, si el repo no se comparte, en .claude/settings.local.json; doctor muestra el perfil activo. Un solo archivo de estado, docs/STATE.md, para los dos modos (docs/ESTADO.md sigue funcionando). spec-interview escribe en docs/features/<slug>/ y encadena con feature-close y pr-prep sin pasar por feature-run

## 2026-10-10 — arch 1.0.1

- README: el workflow de arquitectura lo agrega /dev-flow:init (paso opcional de CI)

## 2026-10-10 — dev-flow 2.0.0

- project-init pasa a ser /dev-flow:init, con la forma del init de Pignolo: detect, una pantalla con lo encontrado y lo que se va a escribir, preview con sello y apply --expect que se niega si el plan o el repo cambiaron, verify y commit propuesto en chore/dev-flow-init. Suma .private-terms local para nombres de cliente y respaldo fuera del repo de lo que modifica. Rompe: /dev-flow:project-init y los flags --apply, --agents, --settings y --ci ya no existen

## 2026-10-10 — dev-flow 1.2.0

- Arnés de agentes: chequeos del arnés (pre, worker, cierre), lead-guard, aviso asíncrono de workers, reanudación por sesión, expediente por ticket con índice y resumen versionable, tamaño S/M/L que fija modelo y turnos, explorer, codemap, lotes paralelos con chequeo de alcance, plan persistente, métricas, memoria por rol aprobada por el usuario y evals con workers reales

## 2026-10-10 — app-review 1.0.1

- Corrige el frontmatter de api-call-rules y frontend-rules: la descripción sin comillas rompía el YAML y podía anular paths y user-invocable

## 2026-10-10 — dev-flow 1.1.0

- Forma de trabajo Tech Lead + workers: skills prd (PRD en rebanadas por id), ticket (issues desde el PRD, PR con Closes #N y tarjeta, estado generado desde GitHub), dispatch (workers efímeros headless con salida validada por esquema) y audit (diff adversarial y honestidad de las pruebas); subagentes implementer, auditor, sre y docs; hook de worktrees fuera del repo con cierre seguro de procesos y gc; project-init --agents, setup --worktrees; topes compartidos con techos 4/20/2

## 2026-10-10 — front-studio 2.0.0

- Crítica y rediseño de UI con números verificables: detector de look de IA, accesibilidad WCAG estática, score de performance (laboratorio en Chromium con --url), plan de trabajo con issues, quiz de estilo, kit por página (OKLCH, AA verificado, Tailwind v4, DTCG), ui-options con tres direcciones más la estándar en una página con selector, preview-setup (launch.json y capturas antes/después), tipos de superficie y rutas de scripts corregidas

## 2026-10-10 — guard 1.0.1, dev-flow 1.0.1

- Corrige el README: la tabla de interruptores de guard y qué hooks quedaron en arch tras la separación.

## 2026-10-06 — Versión 1.0.0 de los seis plugins

Primera publicación con versiones: `guard 1.0.0`, `arch 1.0.0`, `dev-flow 1.0.0`, `app-review 1.0.0`, `cloud-ops 1.0.0`, `front-studio 1.0.0`.

- **Versionado.** Cada plugin declara `version` y cada publicación queda con su tag. Las actualizaciones llegan cuando sube la versión, no por cada commit.
- **Plugin nuevo `arch`**, separado de `dev-flow`: las skills `arch-first` y `adr`, el hook `arch-guard` (que ahora también bloquea que Claude corra `approve.cjs`) y el aviso de arquitectura sin aprobar al arrancar.
- **`dev-flow`** queda con el workflow de features y declara `arch` como dependencia: al instalar `dev-flow`, `arch` se instala solo. Sus compuertas siguen verificando la arquitectura.
- Cambia cómo se invocan dos skills: `/arch:arch-first` y `/arch:adr` (antes `/dev-flow:arch-first` y `/dev-flow:adr`).
- `project-init --settings` declara también `arch@ai-env`.

## 2026-10-06 — Carril de infraestructura, camino corto y flujo que se conduce solo

- **`cloud-ops`**: skill `iac-change-review` (resume un plan de Terraform o un what-if de Bicep/ARM y marca borrado de datos, permisos, locks, exposición pública y cambios de SKU) y hook `iac-verify` (al terminar el turno verifica los `.tf`, `.bicep` y `.ps1` que cambiaron, con las herramientas que haya en la máquina).
- **`guard`**: `terraform apply` sin plan guardado y los despliegues de ARM o Bicep sin what-if piden confirmación.
- **`dev-flow`**: skill `quick-fix` para arreglos chicos, con umbral fijo (3 archivos y 60 líneas de código por defecto) y las mismas compuertas que una feature.
- **`dev-flow`**: al abrir una sesión en la rama de una feature, `rehydrate` dice la etapa y el paso siguiente; si hay una arquitectura sin aprobar, lo avisa.
- **Registro de uso**: cada bloqueo o pedido de confirmación queda en `~/.claude/ai-env/usage.jsonl` (hook, decisión y regla; nunca comandos ni rutas). `/dev-flow:doctor stats` lo resume. Se apaga con `AI_ENV_LOG=off`.
- La compuerta de pruebas ya no exige pruebas unitarias a cambios que son solo `.tf` o `.bicep`.
- `project-init` agrega `tfplan`, `plan.json` y `whatif.json` al `.gitignore`.
- `feature-flow`: el tope de lanzamientos pasa de día calendario a ventana móvil de 24 horas (antes se reiniciaba a medianoche).
- Todos los hooks declaran `timeout` y comparten una única librería (`shared/hooks-lib.cjs`).
- Cada plugin tiene su README; el diseño del repo y el contrato de los hooks están en `docs/DISENO.md`.

## 2026-10-05 — Instalador de un comando

- `install.ps1` e `install.sh` en la raíz: requisitos, marketplace, plugins, statusline, actualización automática y diagnóstico en una corrida. Reemplazan a `bootstrap/`. Se pueden volver a correr para actualizar.

## 2026-10-05 — Todo como plugins

Cambio incompatible para quien había instalado el kit con `install.js`.

- **Se elimina `kits/hub-ai-kit` y `install.js`.** Los hooks ahora vienen dentro de los plugins y cargan al instalarlos.
- **Plugin nuevo `guard`**: `protect-files`, `secret-read` (reemplaza los `deny` de lectura) y `bash-guard` (comandos destructivos de git, rm, Azure y Terraform).
- **Plugin nuevo `dev-flow`**: recibe el workflow que estaba en `app-review` (`arch-first`, `feature-flow`, `feature-run`, `feature-close`, `budget-plan`, `spec-interview`, `pr-prep`, `adr`, `security-diff`, `project-init`) con sus hooks (`arch-guard`, `session-guard`, `rehydrate`, `stop-verify`), más `setup` y `doctor`.
- **`app-review`** queda con la revisión: `app-architecture-review`, los subagentes y las reglas de React y de llamadas a APIs, que pasan de `.claude/rules/` a skills con `paths`.
- **`cloud-ops`** declara el servidor MCP de Microsoft Learn.
- Las skills se invocan con el prefijo del plugin: `/dev-flow:feature-flow`, no `/feature-flow`.
- Interruptores por variable de entorno: `AI_ENV_HOOKS`, `AI_ENV_HOOKS_SKIP`, `AI_ENV_GUARD_STRICT`.
- `session-guard`: nombrar el lanzador en la misma línea ya no habilita otro `claude`.
- Evals de disparo para `app-review` y `cloud-ops`.

### Migrar desde el kit

1. En cada repo donde corriste `install.js`: borrá `.claude/hooks/`, `.claude/skills/`, `.claude/agents/`, `.claude/rules/` y el bloque `hooks` de `.claude/settings.json`. Si quedan, los hooks corren dos veces.
2. En `~/.claude/`: borrá las cinco skills personales (`azure-claim-check`, `azure-inventory-kql`, `client-deliverables`, `context-ledger`, `deliverable-review`) y `statusline.cjs`.
3. Corré el instalador (ver README).
