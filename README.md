# ai-env

Marketplace público de Claude Code: 6 plugins modulares para orquestación multi-agente, arquitectura aprobada antes del código, defensas deterministas en tiempo de ejecución y operación de Azure.
Las decisiones las toman scripts con reglas fijas o una persona, nunca el criterio del modelo en ese momento. Contenido en español rioplatense.

[![CI](https://github.com/santiagodaros/ai-env/actions/workflows/check.yml/badge.svg?branch=main)](https://github.com/santiagodaros/ai-env/actions/workflows/check.yml)
![Linux · Windows · macOS](https://img.shields.io/badge/CI-Linux%20%7C%20Windows%20%7C%20macOS-informational)
![Evals del arnés](https://img.shields.io/badge/evals%20del%20arn%C3%A9s-7%2F7-success)
![Latencia de hooks](https://img.shields.io/badge/hooks%20por%20llamada-%E2%89%A430%20ms%20sobre%20node-informational)
![Contexto core](https://img.shields.io/badge/contexto%20core-%2B520%20tokens-informational)

El badge de CI es en vivo. Los otros cuatro son mediciones fijadas a mano (dev-flow 2.3.0, octubre de 2026); cómo se reproduce cada una está en [Verificación](#verificación).

## 1. Instalación

Un comando. Verifica requisitos (Node 18+, git, Claude Code), agrega el marketplace, instala los plugins del perfil, configura la statusline y la actualización automática, y termina con `/dev-flow:doctor`. Es idempotente: una segunda corrida actualiza y repara, no duplica.

```powershell
# Windows (PowerShell). Perfil opcional; sin él instala full.
$env:AI_ENV_PROFILE = 'core'
irm https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.ps1 | iex
```

```bash
# Linux / macOS
curl -fsSL https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.sh | AI_ENV_PROFILE=core sh
```

**Qué toca fuera de Claude Code:** `~/.claude/ai-env/statusline.cjs` y dos claves de `~/.claude/settings.json` (`statusLine` y la actualización automática del marketplace), con copia `.bak` previa. No reemplaza una statusline que ya tengas. Nada más.

Con `irm | iex` no se pasan parámetros; por eso todo va por variables de entorno. El script tiene unas 60 líneas: leelo antes de correrlo.

| Variable | Efecto |
|---|---|
| `AI_ENV_PROFILE=core` | Instala los plugins de un perfil: `core`, `app`, `cloud`, `frontend` o `full` (por defecto). Con el script descargado, en PowerShell también `-PluginProfile cloud` (no `-Profile`: `$PROFILE` es una variable automática) |
| `AI_ENV_PLUGINS="guard dev-flow"` | Lista explícita de plugins; gana sobre el perfil |
| `AI_ENV_DRY_RUN=1` | Muestra qué instalaría y sale sin tocar nada |
| `AI_ENV_NO_SETUP=1` | No toca `settings.json`: sin statusline ni actualización automática |
| `AI_ENV_FORCE_STATUSLINE=1` | Reemplaza la statusline existente |
| `AI_ENV_SOURCE=usuario/repo` | Instala desde un fork o una carpeta local |

Sin instalador:

```bash
claude plugin marketplace add santiagodaros/ai-env
claude plugin install guard@ai-env   # arch, dev-flow, app-review, cloud-ops, front-studio
# después, dentro de Claude Code, una vez por máquina:
#   /dev-flow:setup    statusline del límite de 5 h y actualización automática
#   /dev-flow:doctor   qué está activo y qué falta
```

**Versiones.** Semver por plugin y un tag `<plugin>--v<versión>` por publicación: recibís cambios cuando sube la versión, nunca por un commit intermedio. `check-versions.cjs` frena en CI un plugin que cambió sin subir su versión. Historial: [`CHANGELOG.md`](CHANGELOG.md).

## 2. Plugins

| Plugin | Contenido | Costo estimado (`claude plugin details`) |
|---|---|---|
| [`guard`](plugins/guard/README.md) | 3 hooks: secretos, archivos protegidos, comandos con impacto. Sin configuración | 0 tokens |
| [`arch`](plugins/arch/README.md) | 2 skills, 2 hooks: arquitectura hexagonal aprobada por una persona antes del código; registro de decisiones (ADR) | ~280 tokens |
| [`dev-flow`](plugins/dev-flow/README.md) | 15 skills, 5 subagentes, 6 hooks: init, carril rápido, features con compuertas, Tech Lead + workers, presupuesto, evals del arnés. Instala `arch` como dependencia | ~2.000 tokens |
| [`app-review`](plugins/app-review/README.md) | 3 skills, 2 subagentes de revisión de aplicaciones | ~600 tokens |
| [`cloud-ops`](plugins/cloud-ops/README.md) | 6 skills de Azure, 1 hook de verificación de Terraform, Bicep y PowerShell, MCP de Microsoft Learn | ~890 tokens |
| [`front-studio`](plugins/front-studio/README.md) | 12 skills de crítica y rediseño de UI, accesibilidad y performance | ~890 tokens |

`claude plugin details` también cuenta las skills manuales, que no cargan su descripción en la sesión. Lo que de verdad entra al contexto está en la tabla siguiente. Los hooks no consumen contexto.

## 3. Perfiles

Se instalan los seis una vez por máquina; cada repo activa solo los de su perfil mediante `enabledPlugins`. La fuente de verdad es [`shared/profiles.json`](shared/profiles.json); los instaladores llevan una copia literal que una prueba compara.

| Perfil | Plugins | Contexto agregado (medido) | Skills automáticas | Uso típico |
|---|---|---|---|---|
| `core` | guard, arch, dev-flow | +520 tokens | 1 | Backend, librerías, lógica de negocio |
| `app` | core + app-review | +1.160 tokens | 4 | APIs y backends con autenticación o APIs de Microsoft |
| `cloud` | core + cloud-ops | +1.410 tokens | 7 | Terraform, Bicep, gobernanza de Azure |
| `frontend` | core + app-review + front-studio | +1.280 tokens | 5 | UI, React, accesibilidad |
| `full` | los seis | +2.170 tokens | 11 | Todo (por defecto) |

Medición: `claude -p --plugin-dir …` contra una sesión sin plugins (~38.800 tokens de base), con el uso que informa la CLI (dev-flow 2.1.0). 27 de las 38 skills son manuales. La diferencia entre `core` y `full` es ~1.650 tokens, un 4 % de la base: el beneficio principal es la **precisión** (1 skill candidata en vez de 11), no el ahorro.

`/dev-flow:init` sugiere el perfil según el stack (UI → `frontend`, IaC → `cloud`, API sin UI → `app`, UI + IaC → `full`, si no `core`) y pregunta si el repo se comparte:

- **Compartido** → `.claude/settings.json`, versionado: el perfil carga solo para quien clone el repo y confíe en la carpeta.
- **Solo tuyo** → `.claude/settings.local.json`, ignorado por git: no ensucia el repo.

Nunca pisa una clave existente (la informa como conflicto) y respalda el archivo antes de reescribirlo. `/dev-flow:doctor` muestra el perfil activo.

## 4. Dos carriles de trabajo

| | Carril rápido | Carril formal |
|---|---|---|
| Entrada | `/dev-flow:quick-fix <qué>`, o un ticket `Tamaño: T` en `dispatch` | `/dev-flow:feature-run` (por features) o `/dev-flow:dispatch` (Tech Lead + workers) |
| Para | Un bug puntual, un texto, un ajuste menor | Tickets S, M y L; cualquier cambio que el carril rápido rechace |
| Quién decide si califica | `quick.cjs`: 3 archivos de código y 60 líneas por defecto (techo configurable: 5 y 120), rutas protegidas y un filtro de contenido | — |
| Artefactos | Una línea en `docs/CHANGELOG.md` | SPEC por feature, o PRD en rebanadas con tickets en GitHub |
| Aislamiento | La sesión actual, sin worktree | Un worktree por worker (por defecto `<repo>/.claude/worktrees`; fuera del repo con `worktrees.root`, p. ej. `~/worktrees`) |
| Verificación | Pruebas, `arch-check`, `secscan`, `stop-verify` | Las mismas compuertas, más tarjeta de entrega validada por JSON Schema y un auditor adversarial (Opus) |
| Paradas humanas | Una: tu sí al diff final antes de commit o push | Ver abajo |

**Filtro de contenido del carril rápido.** `risk.cjs` evalúa líneas **agregadas y eliminadas**: autenticación, sesión, CORS, TLS, roles, secretos, CSRF, ejecución dinámica, más los hallazgos medios de `secscan` y rutas de dependencias o infraestructura. Sacar un `requireAuth` es una línea eliminada en un archivo cualquiera: un filtro por ruta y un escáner de líneas agregadas lo dejaban pasar, y por eso existe. El script fija el piso; el modelo puede subirlo, nunca bajarlo. No hay flag ni comentario de excepción, porque el mismo cambio podría agregarlo.

**Tamaño T en `dispatch`.** Corre `quick.cjs --plan` con el alcance del ticket y no lanza ninguna sesión. Si las rutas no califican, el ticket se trata como S.

**Carril formal, Tech Lead + workers.** La sesión principal orquesta y no edita código del checkout principal (`lead-guard`). Cada worker es un `claude -p` en frío, en su worktree, con el rol pasado como system prompt. El tamaño fija modelo, turnos y esfuerzo:

| Tamaño | Implementer | Turnos | Esfuerzo |
|---|---|---|---|
| S | Sonnet | 30 | medium |
| M | Sonnet | 60 | medium |
| L | Opus | 100 | high |

El tamaño sube el modelo solo del implementer: `docs` sigue en Haiku y `sre` en Sonnet, y en L escalan turnos y esfuerzo. El auditor corre siempre con Opus. Si un lote no entra en el presupuesto, `dispatch` informa cuántos tickets más entrarían con los implementers L en Sonnet; se aplica solo con `--allow-downgrade-implementer`, y el auditor nunca baja. El Tech Lead recibe referencias (una línea y rutas), no contenido de agente en agente.

**Paradas humanas.** Ningún script las saltea:

1. Aprobar la arquitectura (en tu terminal; `arch-guard` impide que Claude la selle).
2. Aprobar el SPEC.
3. Declarar una exención (`Sin pruebas:` o `Riesgo aceptado:`).
4. Lanzar cada sesión o worker.
5. Push o PR.
6. Merge, con el veredicto del auditor a la vista.

Un repo con arquitectura sin aprobar sigue bloqueado también en el carril rápido: `quick-fix` no vuelve a pedirla, pero tampoco la reemplaza.

## 5. Garantías del runtime

**Contrato de todo hook:**

- Node puro, sin dependencias npm.
- Sin red.
- Los que corren en cada llamada o mensaje (`PreToolUse`, `UserPromptSubmit`) suman **≤ 30 ms sobre `node -e 0`**. Se mide en el smoke test, con la mediana de 9 corridas; el umbral es relativo porque Node solo arranca en ~35 ms en Linux y más en Windows. Los de sesión (`SessionStart`, `Stop`) corren una vez, pueden invocar git o npm, y su latencia se informa sin frenar.

| Hook | Plugin | Evento | Bloquea | Pide confirmación |
|---|---|---|---|---|
| `protect-files` | guard | PreToolUse (Edit, Write) | Escrituras en `.git/`, lockfiles, `.env` (salvo `.env.example`) y contenido con forma de secreto (claves de Storage, client secrets, claves privadas, JWT) | Tocar `.claude/settings.json` |
| `secret-read` | guard | PreToolUse (Read) | Leer `.env`, `secrets/`, claves y certificados privados | — |
| `bash-guard` | guard | PreToolUse (Bash, PowerShell) | Leer `.env` por consola, borrado recursivo de raíz, home o unidad, `git push --force` a main | Borrar recursos de Azure, cambios de permisos o credenciales, `terraform destroy`, `apply` sin plan guardado, ARM/Bicep sin what-if, `git reset --hard`, `--no-verify`, `kubectl delete`, descargar y ejecutar scripts |
| `arch-guard` | arch | PreToolUse (Edit, Write, Bash) | Código sin arquitectura aprobada, fuera de las capas o con imports que rompen la regla de dependencia; que Claude selle la aprobación | — |
| `arch-start` | arch | SessionStart | — (avisa si hay una arquitectura sin aprobar) | — |
| `session-guard` | dev-flow | PreToolUse (Bash, PowerShell) | `claude --bg`, `-w` y `-p` lanzados por Claude; un lanzador encadenado con otro comando | Cada lanzamiento por `feature-flow` |
| `lead-guard` | dev-flow | PreToolUse (Edit, Write) | Con `lead.enforce`: edición de código en el checkout principal | — |
| `lead-notify` | dev-flow | UserPromptSubmit | — (una línea por worker terminado; solo lee `.dev-flow/runs`) | — |
| `rehydrate` | dev-flow | SessionStart | — (reinyecta `docs/STATE.md`, etapa y paso siguiente de la feature) | — |
| `stop-verify` | dev-flow | Stop | Terminar el turno con `typecheck` o `lint` en rojo | — |
| `worktree` | dev-flow | WorktreeCreate, WorktreeRemove | — (rama de ticket, `.worktreeinclude`, cierre de procesos solo dentro del directorio) | — |
| `iac-verify` | cloud-ops | Stop | Terminar el turno con Terraform, Bicep o PowerShell que no validan | — |

**Pre-commit nativo (opcional).** Los hooks de arriba solo corren dentro de Claude Code. El paso `git-hook` de `/dev-flow:init` deja un shim en `.git/hooks/pre-commit` que invoca una copia en `~/.claude/ai-env/git-hooks/`; la ruta del plugin cambia con cada versión, y `/dev-flow:setup` refresca la copia. En cada commit, también los manuales:

- corre `secscan` sobre el índice y frena los hallazgos de severidad alta (los medios solo se informan);
- corre `arch-check` si hay `architecture.json`;
- tarda menos de 500 ms (medido: commit completo en 204 ms);
- no se instala si el repo ya usa husky, pre-commit, lefthook o `core.hooksPath`.

Es una red de seguridad, no un control: `--no-verify` lo saltea y `AI_ENV_GIT_HOOK=off` lo apaga. El control obligatorio es el CI.

Lo que un plugin no puede distribuir (permisos `deny`, statusline, el `WorktreeCreate` de `claude -w`, `CLAUDE.md`) y cómo se resuelve está en [`docs/DISENO.md`](docs/DISENO.md#lo-que-un-plugin-no-puede-llevar). Política de seguridad: [`SECURITY.md`](SECURITY.md).

## 6. Inicialización y repos existentes: `/dev-flow:init`

Flujo:

1. `detect` solo lee.
2. Una pantalla muestra qué se encontró, qué se va a escribir y qué falta.
3. `preview` devuelve un sello.
4. `apply --expect <sello>` se niega si el plan o el repo cambiaron desde la vista previa.
5. `verify`.
6. Se propone el commit en `chore/dev-flow-init` con `git commit -- <archivos>`, que deja afuera cualquier otro cambio en curso.

Nada se escribe sin tu sí. Una segunda corrida no tiene nada para hacer.

| Protección | Comportamiento |
|---|---|
| Árbol sucio | Si init va a tocar un archivo con cambios sin commitear, se niega (`dirty-target`) y pide commit o `git stash`. Cambios en otros archivos solo se informan (`dirty-other`). Un repo sin commits no se chequea |
| Rollback | `apply` escribe con un diario. Ante una falla a mitad borra lo creado, restaura lo agregado o reescrito y quita las carpetas nuevas (`rolled-back`, exit 1). Si ni el rollback puede, `partial` (exit 3) |
| Huecos del arnés | Falta de `test`, `lint`, `typecheck` o `build`, o un test que es relleno (`exit 0`, `echo`): se muestra qué deja de verificarse. El paso `hygiene-plan` lo anota en `docs/STATE.md` como primera feature, para hacer en su propia rama. No instala dependencias ni genera scripts: elegir linter o framework de pruebas es una decisión de stack (`arch:adr`) |
| Modo watch | Detecta `--watch`, `vitest` sin `run`, `react-scripts test`, `ng test`, `nodemon`, `ptw` y `node --watch` (`test-watch`). `quick-fix`, `feature-close` y `stop-verify` corren las pruebas con `CI=1`, que saca a jest, vitest y react-scripts del modo watch. Sin `--passWithNoTests`: un repo sin pruebas tiene que verse |
| Fines de línea | `.gitattributes`, solo si no existe: `* text=auto` (LF en el repo, el nativo en el árbol de trabajo), `*.sh` en LF y `*.cmd`/`*.bat` en CRLF. No se fuerza `eol=lf`, que rompe herramientas de Windows que esperan CRLF. Los archivos ya commiteados con CRLF se informan (`mixed-eol`) y no se renormalizan: `git add --renormalize .` es un commit aparte que decide la persona |
| Editor | `.editorconfig`, solo si no existe: utf-8, línea final, sin espacios al final y la indentación que el repo ya usa. Se toma por extensión, solo con ≥ 5 archivos y ≥ 70 % de acuerdo |
| Datos privados | `.private-terms`, local e ignorado por git: nombres de cliente o datos de tenant que `feature-close` impide subir |

Con código y sin arquitectura, init encadena `/arch:arch-first`.

## 7. Telemetría y presupuesto

- **Fuente.** La statusline es el único lugar donde Claude Code expone el % usado del límite de 5 h. En cada refresco guarda una foto en `~/.claude/.budget/latest.json` con hasta 60 muestras (una por minuto) de la ventana actual.
- **Burn-rate.** `budget-plan burn` calcula %/min con esas muestras y si, al ritmo actual, se llega a la reserva antes del reinicio.
- **Estimación por feature.** Percentil 75 de las features ya medidas. `rehydrate` abre la medición y `feature-close` la cierra.
- **Lotes de workers.** `dispatch` presupuesta el lote completo, no solo el primer worker: lanza los *k* que entran sobre la reserva y deja el resto en cola en el plan, sin lanzamiento automático posterior. No es todo o nada; nunca lanza algo que no entra.
- **Topes.** Menos del 10 % libre (reserva nunca menor a 5 %) o una feature que no entra según la estimación → lanzamiento rechazado. Si no se pueden contar las sesiones activas, también se rechaza. Features y workers comparten un solo cupo (`lib/launch-guard.cjs`).
- **Sin datos** (API key o plan sin límite de 5 h), el presupuesto no frena.

## 8. Referencia rápida

| Comando | Cuándo | Qué hace |
|---|---|---|
| `/dev-flow:init` | Repo nuevo o recién clonado | Detecta, muestra el plan, aplica con tu sí, fija el perfil, propone el commit |
| `/arch:arch-first` | Programa, servicio o automatización nueva | Arquitectura hexagonal; no se escribe código hasta que la apruebes |
| `/dev-flow:quick-fix <qué>` | Arreglo chico | Carril rápido con las mismas compuertas y una parada humana |
| `/dev-flow:feature-run` | Una feature | SPEC → implementación → cierre → PR, con compuertas |
| `/dev-flow:dispatch` | Orquestación | PRD → tickets → workers en worktrees → auditoría. Una vez por repo: init en modo Tech Lead y `/dev-flow:setup --worktrees` |
| `/dev-flow:budget-plan` | Antes de una feature grande | Cuota restante, burn-rate y si conviene dividir |
| `/dev-flow:doctor` | Diagnóstico | Plugins y perfil activos, herramientas presentes; `stats` resume qué bloquearon los hooks |

**Interruptores** (variables del proceso de Claude Code):

| Variable | Efecto |
|---|---|
| `AI_ENV_HOOKS=off` | Apaga todos los hooks de ai-env |
| `AI_ENV_HOOKS_SKIP=bash-guard,stop-verify` | Apaga los hooks nombrados |
| `AI_ENV_GUARD_STRICT=1` | Lo que pide confirmación pasa a bloquearse |
| `AI_ENV_LOG=off` | No registra las decisiones de los hooks |
| `AI_ENV_GIT_HOOK=off` | Saltea el pre-commit nativo |

## Verificación

| Qué | Cómo | Dónde |
|---|---|---|
| Smoke (507 pruebas: hooks, latencia, topes, compuertas, init, presupuesto, instaladores, estructura) | `node tests/smoke-test.js` | CI en Linux, Windows y macOS, cada push |
| Instalador real | Dos corridas con la CLI real en los tres sistemas | CI |
| Estructura de plugins | `claude plugin validate --strict plugins/<plugin>`; versión subida si el plugin cambió | CI |
| Evals del arnés (7 casos: implementación honesta y ambigua, auditoría, evasión del carril rápido) | `node evals/harness/run.cjs` | Local: consume cuota de tu cuenta |
| Evals de disparo de skills automáticas | `claude plugin eval plugins/<plugin> --model haiku --no-publish` | Local |
| Sesión real en tu máquina | [`docs/PRUEBA-REAL.md`](docs/PRUEBA-REAL.md) | Manual |

## Contribuir

Diseño, decisiones con su motivo, contrato de los hooks y cómo agregar una skill o un hook: [`docs/DISENO.md`](docs/DISENO.md). Lo que comparten dos plugins vive en `shared/` y se copia con `scripts/sync-shared.cjs`; ningún script sale de la carpeta de su plugin. Publicar: `node scripts/release.cjs <plugin> patch|minor|major "<nota>"`; el tag lo crea el workflow al mergear a main.

**Qué no va en este repo:** tu `CLAUDE.md` global, `settings.json`, `~/.claude.json` (sesión, MCP, trust), historial ni sesiones. Eso va en un repo privado de dotfiles.

## Licencia

MIT.
