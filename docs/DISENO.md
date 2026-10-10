# Diseño del repo

Para quien mantiene o extiende ai-env. Lo que usa quien instala los plugins está en el README de cada uno.

## Estructura

```
.claude-plugin/marketplace.json   catálogo: una entrada por plugin
plugins/<plugin>/
  .claude-plugin/plugin.json      nombre, versión, descripción, dependencias
  README.md                       qué trae, configuración, límites
  skills/<skill>/SKILL.md         instrucciones; scripts/, references/ y templates/ al lado
  hooks/hooks.json                qué script corre en qué evento
  hooks/*.cjs                     un archivo por hook; lib.cjs es copia de shared/
  lib/                            copias de shared/ que usan los scripts del plugin
  agents/*.md                     subagentes
  evals/<caso>/                   prompt.md y graders/ para claude plugin eval
shared/                           fuente única de lo que usan dos o más plugins
scripts/                          check.cjs, sync-shared.cjs, check-versions.cjs, release.cjs
tests/                            smoke-test.js y fixtures
install.ps1, install.sh           instalador de un comando
docs/                             este archivo, PRUEBA-REAL.md, ejemplos de CLAUDE.md
```

## Decisiones

| Decisión | Motivo |
|---|---|
| Todo se distribuye como plugin | Un plugin se instala, actualiza y desinstala con la CLI; copiar archivos a cada repo no se actualiza solo y duplica hooks |
| Seis plugins por propósito | Quien solo quiere las protecciones instala `guard`; quien solo quiere la disciplina de arquitectura, `arch`. `dev-flow` depende de `arch` y lo declara en `dependencies`, así se instala solo |
| Ningún script sale de la carpeta de su plugin | Un plugin instalado no puede leer archivos de otro, y su ruta cambia con cada versión. Lo que comparten dos plugins vive en `shared/` y se copia. Una prueba recorre todos los `require` y `path.join(__dirname, ...)` y falla si alguno apunta afuera |
| Entre plugins se comparte un contrato de datos, no código | `dev-flow` verifica la arquitectura leyendo `architecture.json` con su propia copia del verificador. No llama al plugin `arch` |
| Versión semver por plugin y un tag por publicación | Quien instala recibe cambios cuando sube la versión, no por cada commit. `check-versions.cjs` falla si un plugin cambió respecto de su tag sin subir la versión, así que no hay cambios que no lleguen a nadie |
| Hooks en Node, sin dependencias y sin red | Node ya es requisito de Claude Code, se comporta igual en Windows, macOS y Linux, y un hook sin dependencias se puede auditar leyéndolo |
| Lo determinista va en scripts, lo redactado en skills | Decidir si un cambio es chico, si una arquitectura está aprobada o si un plan destruye datos no puede depender del criterio del modelo en ese momento |
| Skills manuales por defecto | Una skill que se activa sola ocupa contexto en cada sesión y puede dispararse cuando no corresponde. Solo son automáticas las que tienen un disparador claro, y esas tienen eval |
| Las aprobaciones las da una persona fuera de Claude | Aprobar la arquitectura, aceptar un riesgo o hacer push son decisiones con dueño. Los hooks impiden que Claude las tome |
| Tech Lead + workers: el rol va como system prompt, no con `--agent` | En `claude -p`, `--agent` no resuelve agentes de plugin. `dispatch` lee `agents/<rol>.md` y pasa el cuerpo con `--append-system-prompt`, el frontmatter como `--disallowedTools` y `--model`. Los mismos archivos sirven como subagentes en la sesión del Tech Lead |
| La salida de un worker es un JSON validado | Una tarjeta en texto libre no se puede verificar. `--json-schema` en `claude -p` la valida al salir; `card.cjs verify` la contrasta con el repo (archivos reales, pruebas) |
| El hook de worktrees es idempotente y nativo por defecto | Un `WorktreeCreate` de plugin aplica a subagentes pero no al flag `-w`, que solo lee hooks de settings; el mismo script se registra en ambos lados sin crear dos worktrees. Sin configuración se comporta como Claude Code (`<repo>/.claude/worktrees`), porque al instalarse reemplaza la creación nativa para todos |
| Lo que genera un worker va a `.dev-flow/`, no a `.claude/` | Claude Code protege `.claude/` de escrituras: un worker headless no puede guardar ahí su tarjeta |
| Memoria en tres capas, escrita por scripts | El expediente por ticket (hilo), el mapa del código y la memoria por rol. El índice del expediente y las métricas los genera un script; la memoria por rol solo cambia con aprobación. Así lo que lee el siguiente agente es corto y no lo puede envenenar un worker |
| Se evalúa el destino, no el camino | `harness.cjs check --end` y las evals del arnés califican el estado final con chequeos objetivos; los workers pueden llegar por caminos distintos |
| El Tech Lead recibe referencias | `collect`, `status` y `lead-notify` devuelven una línea y rutas. Pasar contenido de agente en agente degrada la información y llena el contexto del orquestador |
| Perfiles de plugins por repo, no por máquina | Claude Code habilita plugins por proyecto (`enabledPlugins`). Se instalan los seis una vez y cada repo activa los de su perfil (`shared/profiles.json`: core, app, cloud, frontend, full), en `.claude/settings.json` si se comparte o `.claude/settings.local.json` si no. Medido con `claude -p`: core agrega 520 tokens y full 2.170 sobre una base de ~38.800; las skills manuales no cargan su descripción. El beneficio principal es la precisión (de 11 skills automáticas a 1 en core), no el ahorro |
| `-PluginProfile`, no `-Profile` | `$PROFILE` es una variable automática de PowerShell. Con `irm \| iex` no se pasan parámetros: ahí vale `AI_ENV_PROFILE` |
| Un solo archivo de estado del proyecto: `docs/STATE.md` | Los dos modos lo usan (Tech Lead agrega el bloque generado desde GitHub). Un repo que solo tiene `docs/ESTADO.md`, el nombre anterior, lo sigue usando sin configurar nada. Lo de cada feature y cada ticket no se fusiona: es lo que permite retomar |
| Latencia de hooks relativa al arranque de Node | Un umbral absoluto depende de la máquina (Node solo arranca en ~35 ms en Linux y más en Windows). Lo que controla el hook es lo que suma: los de `PreToolUse` y `UserPromptSubmit`, que corren en cada llamada o mensaje, ≤ 30 ms sobre `node -e 0` (prueba en el smoke test). Los de sesión pueden lanzar git o npm y se informan |
| quick-fix: un carril con una sola parada humana | Un arreglo chico no necesita SPEC, PRD, worktree ni auditor: corre en la sesión, con las mismas compuertas deterministas (pruebas, arch-check, secscan) y `stop-verify`. La única decisión humana es confirmar el diff final para commit o push; la exención de pruebas solo existe si la persona la elige |
| El piso del carril mira el contenido, no solo la ruta | Sacar un `requireAuth` es una línea eliminada en un archivo cualquiera: un filtro por nombre de archivo y un escáner de líneas agregadas lo dejaban pasar (lo comprobamos). `risk.cjs` evalúa líneas agregadas y eliminadas (auth, sesión, CORS, TLS, roles, secretos, CSRF, ejecución dinámica) y los hallazgos medios de secscan en código. El script fija el piso; el modelo puede subirlo, nunca bajarlo. No hay flag ni comentario de excepción: el mismo cambio podría agregarlo. Una lista de arreglos legítimos controla los falsos positivos |
| La aprobación de arquitectura no se saltea por ser chico | `approve.cjs` aprueba una arquitectura, no un cambio: quick-fix no la vuelve a pedir, pero si el repo tiene una arquitectura sin aprobar, `arch-guard` sigue bloqueando el código |
| Tamaño T: trivial, sin sesión | `dispatch run` con `Tamaño: T` corre `quick.cjs --plan` con el alcance del ticket y no lanza nada; si las rutas no califican, lo trata como S (worker y auditor) |
| Burn-rate en porcentaje y presupuesto por lote | La statusline entrega el % del límite de 5 h, no tokens: se guardan muestras (una por minuto, 60, ventana actual) y se mide %/min. `dispatch` presupuesta el lote completo (antes solo miraba el primer worker): lanza los k que entran sobre la reserva y deja el resto en cola en el plan, sin lanzamiento automático. Sin datos (API key) no frena |
| Evals de skills sin depender de la expansión de comandos | En `claude -p` la expansión de `/plugin:skill` depende del entorno (en sesiones remotas no se resuelve). El eval arma el prompt como la CLI: el cuerpo de la `SKILL.md` con `$ARGUMENTS` y `${CLAUDE_PLUGIN_ROOT}` reemplazados, así prueba las instrucciones y los scripts reales |
| La macro `feature-run` es opcional | `spec-interview` → implementación → `feature-close` → `pr-prep` es una cadena de primitivas con los mismos contratos de archivos (`docs/features/<slug>/`); `feature-run` solo la recorre de corrido |
| Un solo cupo para features y workers | `launch.cjs` y `dispatch.cjs` comparten `lib/launch-guard.cjs` y el registro: no se duplica el gasto lanzando por dos caminos |
| init en brownfield: frena solo lo que va a tocar | Un árbol sucio no impide inicializar; lo que impide es que init escriba sobre un archivo con cambios sin commitear (`dirty-target`), porque el commit mezclaría las dos cosas. El resto se informa (`dirty-other`) y el commit sale con `git commit -- <archivos>`, que deja afuera lo que estaba en curso. Un repo sin commits no se chequea |
| init es transaccional | `apply` escribe con un diario: si un paso falla a mitad, borra lo que creó, restaura lo que agregó o reescribió y saca las carpetas nuevas (`rolled-back`, exit 1). Si ni el rollback puede, `partial` (exit 3) y la persona mira `git status` |
| `.gitattributes` con `text=auto`, no `eol=lf` | `eol=lf` fuerza LF también en el árbol de trabajo de Windows y rompe herramientas que esperan CRLF (`.cmd`, `.bat`, proyectos de Visual Studio). `text=auto` deja LF en el repo y el nativo al trabajar; `.sh` va fijo en LF y `.cmd`/`.bat` en CRLF. Los archivos ya commiteados con CRLF se informan (`mixed-eol`) y no se renormalizan: es un commit aparte que decide la persona. Ni `.gitattributes` ni `.editorconfig` se tocan si existen; `.editorconfig` toma la indentación que el repo ya usa |
| init no instala dependencias ni inventa scripts | Los huecos del arnés (`no-test`, `no-lint`, `no-typecheck`, `no-build`, `test-watch`) se muestran y el paso `hygiene-plan` los anota en `docs/STATE.md` como primera feature en su rama. Elegir un linter o un framework de pruebas es una decisión de stack (va con `arch:adr`), no de scaffolding |
| Pruebas siempre con `CI=1`, sin `--passWithNoTests` | `quick-fix`, `feature-close` y `stop-verify` corren `npm test` con `CI=1`: jest, vitest y react-scripts salen del modo watch solos. `--passWithNoTests` haría pasar un repo sin pruebas, que es justo lo que el arnés tiene que ver |
| Pre-commit nativo como red de seguridad | Los hooks de ai-env solo corren dentro de Claude Code. El paso opcional `git-hook` deja un shim en `.git/hooks/pre-commit` que llama a una copia en `~/.claude/ai-env/git-hooks/` (la ruta del plugin cambia con cada versión; `setup` la refresca): secscan sobre el índice (frena severidad alta) y arch-check si hay `architecture.json`, en menos de 500 ms. No pisa husky, pre-commit, lefthook ni `core.hooksPath` (`git-hook-other`). `--no-verify` lo saltea: el control obligatorio sigue siendo el CI |

## Lo que un plugin no puede llevar

Statusline, permisos (`permissions.deny`) y `CLAUDE.md` o `rules/`. Se resuelven con `/dev-flow:setup`, con los hooks `secret-read` y `bash-guard`, y con skills que declaran `paths`. Tampoco puede haber una carpeta `bin/` en la raíz de un plugin: impide instalarlo en la app de Claude (una prueba lo verifica).

## Contrato de un hook

- Lee el JSON del evento por stdin con `run(nombre, fn)` de `lib.cjs`. Entrada ilegible o error interno: no bloquea.
- **Bloquear**: `block(mensaje, regla)`. Sale con 2 y Claude recibe el mensaje. El mensaje dice qué hacer en su lugar.
- **Pedir confirmación**: `ask(motivo, regla)`. Solo en `PreToolUse`. En modo estricto o sin persona delante equivale a bloquear.
- **No objetar**: volver de `fn` (sale con 0, sin salida).
- `regla` es un identificador fijo en minúsculas y guiones. Es lo único que se registra junto con el hook y la decisión; nunca el comando, la ruta ni el contenido.
- Respeta los interruptores: `run` ya atiende `AI_ENV_HOOKS` y `AI_ENV_HOOKS_SKIP`.
- La carpeta del proyecto sale de `projectDir(input)`, no de `process.cwd()`.
- Todo hook declara `timeout` en `hooks.json`. Los de `PreToolUse` y `UserPromptSubmit` corren en cada llamada a herramienta o mensaje: sin procesos externos, sin red, sin recorrer el repo y con ≤ 30 ms por encima de `node -e 0` (lo mide el smoke test).
- Un hook `Stop` bloquea como máximo una vez por turno (`stop_hook_active`).
- En Windows `git` se ejecuta sin shell; `npm`, `az` y otros `.cmd` necesitan shell.

## Qué vive en `shared/`

| Fuente | Copias |
|---|---|
| `shared/hooks-lib.cjs` | `hooks/lib.cjs` de cada plugin con hooks |
| `shared/arch/archlib.cjs`, `shared/arch/arch-check.cjs` | `plugins/arch/skills/arch-first/scripts/` y `plugins/dev-flow/lib/arch/` |
| `shared/adr.cjs` | `plugins/arch/skills/adr/scripts/` y `plugins/dev-flow/lib/` |
| `shared/profiles.json` | `plugins/dev-flow/lib/` (los instaladores llevan una copia literal; `tests/profiles.cjs` verifica que coincidan) |

Se edita siempre la fuente y se corre `node scripts/sync-shared.cjs`. Editar una copia a mano hace fallar el hook de git y el CI. Un cambio en `shared/` cambia varios plugins a la vez: todos suben su versión.

## Publicar una versión

1. Hacé el cambio. `node scripts/check-versions.cjs` dice qué plugins cambiaron respecto de su última versión publicada.
2. `node scripts/release.cjs <plugin>[,<plugin>] <patch|minor|major> "<qué cambia para quien lo usa>"`, o `--changed` para todos los que cambiaron. Sube la versión en `plugin.json` y agrega la entrada en `CHANGELOG.md`.
   - `patch`: arreglo que no cambia el comportamiento esperado.
   - `minor`: skill, hook o regla nueva; nada de lo anterior deja de funcionar.
   - `major`: cambia cómo se invoca algo, se quita una skill o un hook bloquea algo que antes pasaba sin aviso.
3. Commit y push a `main`. El workflow `release` crea y sube el tag `<plugin>--v<versión>` de cada versión nueva.

No se reescribe una versión publicada: si algo salió mal, se publica otra.

## Agregar una skill

1. `plugins/<plugin>/skills/<nombre>/SKILL.md` con `name` y `description`. La descripción dice **cuándo** usarla, no cómo funciona.
2. Manual (`disable-model-invocation: true`) salvo que tenga un disparador claro.
3. Los pasos que deben dar siempre el mismo resultado van en `scripts/*.cjs`, citados como `node "${CLAUDE_PLUGIN_ROOT}/skills/<nombre>/scripts/<script>.cjs"`, y se preaprueban con `allowed-tools`.
4. Menos de 60 líneas. El detalle va en `references/`, que se lee solo cuando hace falta.
5. Pruebas del script en `tests/smoke-test.js`. Si la skill es automática, un eval de disparo y uno negativo.
6. Una fila en el README del plugin y la versión subida con `release.cjs`.

## Agregar un hook

1. `plugins/<plugin>/hooks/<nombre>.cjs` siguiendo el contrato, y su entrada en `hooks.json` con `timeout`.
2. Si el plugin no tenía hooks: `node scripts/sync-shared.cjs` para generar su `lib.cjs`.
3. Pruebas en `tests/smoke-test.js`: un caso que bloquea, uno que pasa y el interruptor.
4. Si corre procesos o escribe fuera del repo, actualizá `SECURITY.md`.
5. Una fila en el README del plugin, un paso en `docs/PRUEBA-REAL.md` y la versión subida con `release.cjs`.

## Antes de commitear

```
node scripts/sync-shared.cjs --check
node scripts/check-versions.cjs
node scripts/check.cjs
node tests/smoke-test.js
claude plugin validate --strict .
```

Los tres primeros corren en el hook de git (`git config core.hooksPath .githooks`). `check.cjs` bloquea GUIDs, emails, secretos y los términos de `.private-terms`. El repo es público: sin nombres de cliente ni datos de tenant en ningún archivo.

Para probar sin instalar: `claude --plugin-dir plugins/guard --plugin-dir plugins/dev-flow`.

## Lo que el CI no puede probar

Una sesión real con cada sistema operativo. Las pruebas ejecutan los hooks con la misma entrada que les da Claude Code, y el instalador corre de verdad en los tres sistemas, pero que un hook de plugin bloquee dentro de una sesión interactiva en Windows solo se confirma a mano con `docs/PRUEBA-REAL.md`.
