# Diseño del repo

Para quien mantiene o extiende ai-env. Lo que usa quien instala los plugins está en el README de cada uno.

## Estructura

```
.claude-plugin/marketplace.json   catálogo: una entrada por plugin
plugins/<plugin>/
  .claude-plugin/plugin.json      nombre, descripción, metadatos (sin version)
  README.md                       qué trae, configuración, límites
  skills/<skill>/SKILL.md         instrucciones; scripts/, references/ y templates/ al lado
  hooks/hooks.json                qué script corre en qué evento
  hooks/*.cjs                     un archivo por hook; lib.cjs es copia de shared/
  agents/*.md                     subagentes
  evals/<caso>/                   prompt.md y graders/ para claude plugin eval
shared/hooks-lib.cjs              fuente única de la librería de hooks
scripts/                          check.cjs (chequeos previos al commit), sync-shared.cjs
tests/                            smoke-test.js y fixtures
install.ps1, install.sh           instalador de un comando
docs/                             este archivo, PRUEBA-REAL.md, ejemplos de CLAUDE.md
```

## Decisiones

| Decisión | Motivo |
|---|---|
| Todo se distribuye como plugin | Un plugin se instala, actualiza y desinstala con la CLI; copiar archivos a cada repo no se actualiza solo y duplica hooks |
| Cinco plugins por propósito | Quien solo quiere las protecciones instala `guard` sin cargar el workflow. `dev-flow` no se parte más porque sus scripts se llaman entre sí y un plugin instalado no puede leer archivos de otro |
| Sin `version` en los manifiestos | Con `version` fija, nadie recibe un commit nuevo hasta que se la cambie. Sin ella, cada commit es una versión. Si el repo gana usuarios que necesiten estabilidad, el paso siguiente es versionar con tags `<plugin>--v<versión>` |
| Hooks en Node, sin dependencias y sin red | Node ya es requisito de Claude Code, se comporta igual en Windows, macOS y Linux, y un hook sin dependencias se puede auditar leyéndolo |
| `shared/hooks-lib.cjs` copiado a cada plugin | Un plugin instalado solo ve su propia carpeta. La copia se genera con `scripts/sync-shared.cjs` y una prueba falla si difiere |
| Lo determinista va en scripts, lo redactado en skills | Decidir si un cambio es chico, si una arquitectura está aprobada o si un plan destruye datos no puede depender del criterio del modelo en ese momento |
| Skills manuales por defecto | Una skill que se activa sola ocupa contexto en cada sesión y puede dispararse cuando no corresponde. Solo son automáticas las que tienen un disparador claro, y esas tienen eval |
| Las aprobaciones las da una persona fuera de Claude | Aprobar la arquitectura, aceptar un riesgo o hacer push son decisiones con dueño. Los hooks impiden que Claude las tome |

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

## Agregar una skill

1. `plugins/<plugin>/skills/<nombre>/SKILL.md` con `name` y `description`. La descripción dice **cuándo** usarla, no cómo funciona.
2. Manual (`disable-model-invocation: true`) salvo que tenga un disparador claro.
3. Los pasos que deben dar siempre el mismo resultado van en `scripts/*.cjs`, citados como `node "${CLAUDE_PLUGIN_ROOT}/skills/<nombre>/scripts/<script>.cjs"`, y se preaprueban con `allowed-tools`.
4. Menos de 60 líneas. El detalle va en `references/`, que se lee solo cuando hace falta.
5. Pruebas del script en `tests/smoke-test.js`. Si la skill es automática, un eval de disparo y uno negativo.
6. Una fila en el README del plugin y una línea en `CHANGELOG.md`.

## Agregar un hook

1. `plugins/<plugin>/hooks/<nombre>.cjs` siguiendo el contrato, y su entrada en `hooks.json` con `timeout`.
2. Si el plugin no tenía hooks: `node scripts/sync-shared.cjs` para generar su `lib.cjs`.
3. Pruebas en `tests/smoke-test.js`: un caso que bloquea, uno que pasa y el interruptor.
4. Si corre procesos o escribe fuera del repo, actualizá `SECURITY.md`.
5. Una fila en el README del plugin y un paso en `docs/PRUEBA-REAL.md`.

## Antes de commitear

```
node scripts/sync-shared.cjs --check
node scripts/check.cjs
node tests/smoke-test.js
claude plugin validate .
```

`check.cjs` corre en el hook de git (`git config core.hooksPath .githooks`) y bloquea GUIDs, emails, secretos y los términos de `.private-terms`. El repo es público: sin nombres de cliente ni datos de tenant en ningún archivo.

Para probar sin instalar: `claude --plugin-dir plugins/guard --plugin-dir plugins/dev-flow`.

## Lo que el CI no puede probar

Una sesión real con cada sistema operativo. Las pruebas ejecutan los hooks con la misma entrada que les da Claude Code, y el instalador corre de verdad en los tres sistemas, pero que un hook de plugin bloquee dentro de una sesión interactiva en Windows solo se confirma a mano con `docs/PRUEBA-REAL.md`.
