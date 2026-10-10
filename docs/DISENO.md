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
| Un solo cupo para features y workers | `launch.cjs` y `dispatch.cjs` comparten `lib/launch-guard.cjs` y el registro: no se duplica el gasto lanzando por dos caminos |

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
- Todo hook declara `timeout` en `hooks.json`. Los de `PreToolUse` corren en cada llamada a herramienta: sin procesos externos y sin recorrer el repo.
- Un hook `Stop` bloquea como máximo una vez por turno (`stop_hook_active`).
- En Windows `git` se ejecuta sin shell; `npm`, `az` y otros `.cmd` necesitan shell.

## Qué vive en `shared/`

| Fuente | Copias |
|---|---|
| `shared/hooks-lib.cjs` | `hooks/lib.cjs` de cada plugin con hooks |
| `shared/arch/archlib.cjs`, `shared/arch/arch-check.cjs` | `plugins/arch/skills/arch-first/scripts/` y `plugins/dev-flow/lib/arch/` |
| `shared/adr.cjs` | `plugins/arch/skills/adr/scripts/` y `plugins/dev-flow/lib/` |

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
