# hub-ai-kit

Skills, subagentes, hooks, reglas y CI para trabajar con Claude Code. Sin nombres de cliente ni datos de tenant.

## Qué trae

| Capa | Piezas | Para qué |
|---|---|---|
| Contexto siempre cargado | `repo/CLAUDE.md`, `repo/.claude/rules/*` (frontend, api-calls), `personal/CLAUDE.md` | Invariantes y comandos; las reglas por capa solo cargan al tocar archivos que coinciden |
| Skills personales | `context-ledger`, `azure-claim-check`, `client-deliverables`, `deliverable-review`, `azure-inventory-kql` | Tareas repetidas fuera de un repo |
| Skills del repo | `app-architecture-review` (3 lentes), `pr-prep` y `spec-interview` (solo manuales) | Revisión, preparación de PR, feature grande |
| Subagentes | `reviewer` (revisión independiente), `explorer` (exploración barata) | Aislar contexto y revisar con ojos frescos |
| Hooks (deterministas) | `rehydrate` (reinyecta STATE tras compactar), `protect-files` (bloquea .git, lockfiles, .env y secretos), `stop-verify` (typecheck y lint antes de terminar) | Lo que tiene que pasar siempre |
| Permisos | `deny` de lectura de `.env`, `.env.*`, `secrets/` (excepto `.env.example`) | Que Claude no vea secretos |
| CI | `security.yml` (CodeQL, gitleaks, dependency review), `dependabot.yml`; opcional `claude-review.yml` | Barrera real, sin IA o con revisión de PR |
| Visibilidad | `personal/statusline.cjs` | Contexto usado, límite de 5 h y costo, siempre a la vista |

## Sesiones por feature (`feature-flow`)

Skill manual `/feature-flow <descripción>`: parte el trabajo en hasta 3 features y deja `docs/features/<slug>/{SPEC,STATE,HANDOFF}.md` commiteados. Por defecto no abre sesiones; imprime `claude -w <slug> -n <slug>`. El hook `rehydrate` inyecta HANDOFF y STATE al arrancar en la rama o worktree de la feature. `scripts/launch.cjs --launch` abre una sesión en segundo plano con topes (2 simultáneas, 3 por día, 10 min de espera; techos 3, 6 y 5 min no modificables por configuración), y el hook `session-guard` bloquea `claude --bg`, `-w` y `-p` fuera de ese lanzador. Configuración opcional: `.claude/feature-flow.json` con `maxConcurrent`, `maxPerDay`, `cooldownMinutes`.

## Cierre de feature (`feature-close`)

Skill manual `/feature-close [slug]`, en una corrida: `collect.cjs --run` junta commits, archivos, SPEC, decisiones y resultado de typecheck/lint/test (si algo falla, no escribe nada); escribe `docs/CHANGELOG.md` (historial) y `docs/design/<slug>.md` (diseño tal como quedó, con "Diferencias contra el SPEC" y "Sin verificar"); `verify.cjs` valida secciones, rutas citadas, GUIDs y términos privados; marca el STATE como cerrado y commitea solo docs.

## Una corrida de punta a punta (`feature-run`) y presupuesto (`budget-plan`)

`/feature-run <descripción o slug>` encadena `feature-flow`, la implementación, la compuerta de pruebas, `feature-close` y la descripción del PR (`PR.md`). `scripts/stage.cjs` decide la etapa desde archivos y git, así que una corrida cortada se retoma sola. Paradas: SPEC sin aprobar, sin presupuesto, tests rojos tras 2 intentos, y push o PR sin tu sí.

`/budget-plan` lee el consumo del límite de 5 h que guarda la statusline del kit en `~/.claude/.budget/latest.json` (solo Pro/Max), estima lo que necesita una feature con las que ya mediste y propone ejecutar ahora, justo o en rebanadas. Sin historial no inventa: lo dice. Configuración opcional: `.claude/budget.json` (`reservePct`, `safetyFactor`). Necesitás tener instalada la statusline (`personal/settings.snippet.json`).

## Arquitectura primero (`arch-first`), seguridad del diff, ADR y arranque de repos

- `/arch-first <qué se construye>`: esqueleto hexagonal sin código (`scaffold.cjs`), diseño en `architecture.json` y `docs/architecture/ARCHITECTURE.md`, vista previa (`preview.cjs`, o `--artifact` para publicarla en la app de Claude) y aprobación humana con `approve.cjs` en tu terminal: sella el diseño con un hash y si cambia hay que aprobar de nuevo. Con el diseño aprobado, el hook `arch-guard` deja escribir código solo dentro de las capas y con la regla de dependencia (`arch-check.cjs` la verifica también en `feature-close` y en `.github/workflows/architecture.yml`).
- `/security-diff`: `secscan.cjs` sobre las líneas agregadas de la rama; las altas frenan el cierre.
- `/adr`: decisiones en `docs/decisions/`.
- `/project-init`: detecta el stack, completa `CLAUDE.md`, `docs/STATE.md` y `.gitignore`, y sigue con `arch-first`.

## Instalación (Windows, macOS o Linux)

Requisitos: Node 18+, git y Claude Code instalados. Todo el kit usa Node, así que los comandos son los mismos en cualquier sistema.

```powershell
# 1) Descomprimí el ZIP y entrá a la carpeta
cd C:\ruta\a\hub-ai-kit

# 2) Simulación: no escribe nada, muestra qué copiaría
node install.js --repo "C:\ruta\a\hub-csp" --dry-run

# 3) Instalación real (no pisa archivos existentes; --force para reemplazar)
node install.js --repo "C:\ruta\a\hub-csp"

# 4) Prueba de humo (hooks, settings, skills, subagentes)
node smoke-test.js --repo "C:\ruta\a\hub-csp"
```

`install.js` copia las skills y `statusline.cjs` a `~/.claude`, y `.claude/`, `.github/` y `docs/STATE.md` al repo. Si ya tenés `CLAUDE.md` (personal o del repo), no lo toca: deja `CLAUDE.kit.md` para fusionar a mano. No edita `~/.claude/settings.json`: pegá ahí el bloque de `personal/settings.snippet.json` (status line) cambiando `TU_USUARIO` por tu usuario de Windows. Usa ruta absoluta con `/` porque `~` puede no expandirse en PowerShell.

Pasos manuales que el instalador te imprime: agregar `repo/.gitignore.snippet` a tu `.gitignore`, poner los comandos reales en `CLAUDE.md`, completar dónde corre el backend en `docs/STATE.md`, y (opcional) copiar `optional/claude-review.yml` a `.github/workflows/` tras revisar la política de la empresa.

Conector de documentación y servidor de lenguaje (una vez):

```powershell
claude mcp add --transport http microsoft-learn https://learn.microsoft.com/api/mcp
npm install -g typescript-language-server typescript
# dentro de Claude Code:
#   /plugin install typescript-lsp@claude-plugins-official
```

### Forma de los hooks

Los hooks usan forma shell: `node "$CLAUDE_PROJECT_DIR/.claude/hooks/<script>.cjs"`. Se probó en Windows real con Claude Code 2.1.81: la forma exec (`command` + `args`) no pasó los argumentos en esa versión y `node` quedó leyendo el JSON de stdin como si fuera código. La forma shell corre en Git Bash (instalado con Git for Windows). Si no hay Git Bash, caería a PowerShell y `$CLAUDE_PROJECT_DIR` no se expandiría; `smoke-test.js` avisa si no encuentra bash. Los scripts son `.cjs` para que funcionen en repos con `"type": "module"`.

## Antes de usarlo (obligatorio)

1. En `CLAUDE.md`, reemplazá los comandos de la sección "Comandos" por los reales de Hub CSP.
2. En `docs/STATE.md`, completá dónde corre el backend.
3. `security.yml`: si el repo es de una organización, gitleaks-action necesita `GITLEAKS_LICENSE`. `dependabot.yml` asume un `package.json` en la raíz.
4. **Revisá los hooks antes de commitear `.claude/`:** ejecutan comandos con tus permisos y los ejecuta también quien clone el repo.

## Verificar dentro de Claude Code (5 minutos)

Abrí `claude` en la raíz del repo y:

1. `/context`: deben aparecer `CLAUDE.md` y las skills. Las reglas de `.claude/rules/` cargan recién al leer archivos `.ts`/`.tsx`.
2. `/hooks`: deben listarse `SessionStart` (compact), `PreToolUse` (Edit|Write) y `Stop`.
3. `/mcp`: debe figurar `microsoft-learn`.
4. Pedile: "creá un archivo `.env` con `A=1`". Tiene que rechazarlo.
5. Pedile un cambio con un error de tipos a propósito: `stop-verify` debe frenarlo al terminar el turno.
6. Corré `/compact` y confirmá que el contenido de `docs/STATE.md` se reinyecta.
7. Si algo no aparece o falla: `claude --debug`.

## Cómo probar cada hook a mano

`node smoke-test.js` ya lo hace con carpetas temporales. Para probar uno solo:

```powershell
'{"tool_name":"Write","tool_input":{"file_path":".env","content":"A=1"}}' | node .claude\hooks\protect-files.cjs; $LASTEXITCODE
```

Resultado esperado: mensaje "Bloqueado" y código 2.

## Qué se agregó tras la investigación y por qué

| Pieza | Fuente | Estado |
|---|---|---|
| Comandos de verificación en CLAUDE.md + hook Stop | Mejores prácticas oficiales: "dar a Claude una forma de verificar su trabajo" | Documentado |
| Reglas con `paths` (frontend, api-calls) | Documentación de memoria: las reglas con `paths` cargan solo al tocar archivos que coinciden | Documentado |
| `deny` de `Read` para secretos | Documentación de permisos (un deny de Read también bloquea Edit y Write sobre esa ruta) | Documentado |
| Instrucción "Al compactar" en CLAUDE.md | Mejores prácticas oficiales (personalizar la compactación) | Documentado |
| `pr-prep`, `spec-interview` con `disable-model-invocation` | Mejores prácticas: skills con efectos secundarios solo manuales; entrevista para features grandes | Documentado |
| Revisión independiente con subagente, sin pedir "gaps" | Mejores prácticas oficiales (revisión adversarial acotada a correctitud) | Documentado, ya aplicado en `reviewer` |
| Status line con `rate_limits` y costo | Documentación de status line (campos verificados) | Documentado |
| Plugin `typescript-lsp` | Documentación de code intelligence (diagnósticos tras cada edición, menos lecturas de archivos) | Documentado; efecto en tokens sin medir |
| `claude-review.yml` | Documentación de GitHub Actions (acción `claude-code-action@v1`) | Opcional; requiere política y secretos |

## Qué decidí NO agregar

- **`.claudeignore`:** una nota de la comunidad lo recomienda, pero no lo encontré en la documentación oficial. El mecanismo documentado son las reglas `deny` de `Read`, que ya están.
- **Agent teams y workflows dinámicos:** la propia documentación marca los agent teams como experimentales y desactivados por defecto, y consumen muchos tokens. No encajan con tu presupuesto.
- **Muchos servidores MCP:** una guía de la comunidad sugiere 2 o 3 y no más de 5 o 6 por proyecto; la documentación dice que cada herramienta cargada ocupa contexto. Quedan Microsoft Learn y la CLI `gh` (la documentación la recomienda como la forma más económica de usar GitHub).
- **Hook PostToolUse de formateo:** si el repo ya usa Prettier o ESLint con `--fix`, conviene agregarlo; no sé qué usa Hub CSP.
- **Cifras de productividad de artículos de la comunidad** ("55 % más rápido", "5-10x"): no las uso. La primera proviene de una investigación de GitHub sobre otra herramienta, y no encontré evidencia controlada para Claude Code.

## Mantenimiento y trabajo diario

- `/doctor prompt-audit` revisa CLAUDE.md, skills y subagentes por contradicciones y contenido obsoleto (requiere Claude Code v2.1.283 o posterior según la documentación).
- Un chat por módulo; `/clear` entre tareas no relacionadas; después de dos correcciones fallidas sobre lo mismo, `/clear` y un prompt mejor.
- `/rewind` para volver atrás; checkpoints no reemplazan a git.
- Agregá a CLAUDE.md lo que Claude se equivoque dos veces; no lo corrijas solo en el chat.
- Para trabajo en paralelo, worktrees de git.

## Prueba sugerida (medí antes de adoptar)

1. Elegí un módulo de Hub CSP y abrí una sesión nueva.
2. Pedí: "revisá `src/<módulo>` con app-architecture-review". Anotá fallas halladas y consumo (`/context`, y la status line).
3. Repetí con tu forma actual (subagentes de auditoría) y compará.
4. Cerrá una decisión, decí "checkpoint", corré `/compact` y verificá que el STATE se reinyecte y el resumen de 5 líneas sea correcto.
5. Pedí un cambio con un error de tipos a propósito y verificá que `stop-verify` lo frene.

## Qué no está verificado

- Ejecución en una máquina Windows real y dentro de Claude Code real: el instalador y el smoke test pasaron 29 de 29 en Linux (Node 22), con rutas estilo Windows simuladas. Corré `node smoke-test.js` en tu máquina para cerrar esta brecha.
- Hooks en versiones de Claude Code distintas de 2.1.81 en Windows.
- Las consultas KQL, contra un tenant real.
- Versiones de las acciones de GitHub de `security.yml` (`@v3`, `@v4`, `@v2`); la documentación de Claude Code usa `actions/checkout@v6`.
- Los ítems marcados "práctica general" en `references/` de `app-architecture-review`.
- Ahorro de tokens: es lo que tiene que mostrar la prueba.
