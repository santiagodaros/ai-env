# ai-env

Marketplace de plugins para Claude Code: hooks de protección, un workflow de desarrollo con arquitectura hexagonal, revisión de aplicaciones, operación de Azure y rediseño de front. Todo se instala como plugin; no hay archivos que copiar a mano. Contenido en español rioplatense.

## Instalar

Un comando. Verifica requisitos (Node 18+, git, Claude Code), agrega el marketplace, instala los plugins, configura la statusline y la actualización automática, y termina con un diagnóstico.

```powershell
# Windows (PowerShell)
irm https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.ps1 | iex
```

```bash
# macOS / Linux
curl -fsSL https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.sh | sh
```

Se puede volver a correr: actualiza y repara en vez de duplicar. Lo único que escribe fuera de Claude Code es `~/.claude/ai-env/statusline.cjs` y dos claves de `~/.claude/settings.json` (deja copia `.bak`, y no reemplaza una statusline que ya tengas).

Si preferís leerlo antes de ejecutarlo, que es lo razonable con cualquier instalador: descargá `install.ps1` o `install.sh`, revisalo (unas 60 líneas) y corrélo. Opciones, por variable de entorno:

| Variable | Efecto |
|---|---|
| `AI_ENV_PLUGINS="guard dev-flow"` | Instala solo esos plugins (por defecto, los seis) |
| `AI_ENV_NO_SETUP=1` | No toca `settings.json`: sin statusline ni actualización automática |
| `AI_ENV_FORCE_STATUSLINE=1` | Reemplaza la statusline que ya tengas |
| `AI_ENV_SOURCE=usuario/repo` | Instala desde un fork o una carpeta local |

A mano, sin instalador:

```powershell
claude plugin marketplace add santiagodaros/ai-env
claude plugin install guard@ai-env        # y los que quieras: arch, dev-flow, app-review, cloud-ops, front-studio
```

Si instalaste a mano, una vez por máquina dentro de Claude Code:

```
/dev-flow:setup     # statusline del límite de 5 h y actualización automática del marketplace
/dev-flow:doctor    # diagnóstico: qué está activo y qué falta
```

Y una vez por repo: `/dev-flow:project-init`. Con `--settings` deja el marketplace y los plugins declarados en `.claude/settings.json`, así cargan solos para quien clone el repo y confíe en la carpeta.

**Versiones y actualizaciones.** Cada plugin tiene su versión (`x.y.z`) y cada publicación su tag `<plugin>--v<versión>`. Recibís una actualización cuando sube la versión, nunca por un commit a medio hacer. Claude Code trae la actualización automática apagada para marketplaces de terceros; el instalador (o `/dev-flow:setup`) la enciende. A mano: `claude plugin marketplace update ai-env` y `claude plugin update <plugin>@ai-env`. Qué cambió en cada versión: [`CHANGELOG.md`](CHANGELOG.md).

## Plugins

| Plugin | Qué trae | Costo fijo de contexto |
|---|---|---|
| [`guard`](plugins/guard/README.md) | 3 hooks de protección: secretos, archivos protegidos y comandos con impacto. Sirve en cualquier repo, sin configuración | 0 tokens |
| [`arch`](plugins/arch/README.md) | 2 skills y 2 hooks: arquitectura hexagonal aprobada por una persona antes del código, y registro de decisiones | ~280 tokens |
| [`dev-flow`](plugins/dev-flow/README.md) | 11 skills manuales y 3 hooks: features, camino corto, compuertas, cierre y presupuesto. Instala `arch` como dependencia | hasta ~1.400 tokens |
| [`app-review`](plugins/app-review/README.md) | 3 skills y 2 subagentes de revisión | ~600 tokens |
| [`cloud-ops`](plugins/cloud-ops/README.md) | 6 skills de Azure, verificación de Terraform, Bicep y PowerShell, y el servidor MCP de Microsoft Learn | ~890 tokens |
| [`front-studio`](plugins/front-studio/README.md) | 8 skills de rediseño de front y re-auditoría de seguridad | ~690 tokens |

Cada plugin tiene su propio README con el detalle de skills, hooks, configuración y límites. Los costos son la estimación de `claude plugin details <plugin>@ai-env`; los hooks no consumen contexto. Las skills se invocan con el prefijo del plugin (`/dev-flow:feature-run`).

## Cómo se usa, en una página

| Momento | Qué hacer |
|---|---|
| Máquina nueva | El instalador. Después, `/dev-flow:doctor` |
| Repo nuevo o recién clonado | `/dev-flow:project-init` (con `--settings` deja los plugins declarados para quien clone el repo) |
| Programa, página o automatización nueva | `/arch:arch-first`: no se escribe código hasta que apruebes la arquitectura |
| Feature | `/dev-flow:feature-run`. Al abrir una sesión en su rama, Claude ya sabe la etapa y el paso siguiente |
| Arreglo puntual | `/dev-flow:quick-fix` |
| Cambio de infraestructura | Pedilo normalmente: `iac-change-review` resume el plan antes de aplicar e `iac-verify` valida al terminar |
| Algo interrumpe de más | `/dev-flow:doctor stats` y los interruptores |

## Interruptores

Variables de entorno del proceso de Claude Code (no de los comandos que corre Claude):

| Variable | Efecto |
|---|---|
| `AI_ENV_HOOKS=off` | Apaga todos los hooks de ai-env |
| `AI_ENV_HOOKS_SKIP=bash-guard,stop-verify` | Apaga los hooks nombrados |
| `AI_ENV_GUARD_STRICT=1` | Lo que pide confirmación pasa a bloquearse |
| `AI_ENV_LOG=off` | No registra las decisiones de los hooks |

## Lo que un plugin no puede instalar

| Pieza | Por qué | Cómo se resuelve acá |
|---|---|---|
| Statusline | El `settings.json` de un plugin solo admite `agent` y `subagentStatusLine` | `/dev-flow:setup` la instala una vez; `rehydrate` la mantiene al día |
| Permisos (`deny`) | No se distribuyen por plugin | Los hooks `secret-read` y `bash-guard` |
| `CLAUDE.md` y `rules/` | Un `CLAUDE.md` en la raíz del plugin no se carga | Las reglas son skills con `paths`; `project-init` completa el `CLAUDE.md` del repo. Ejemplos en `docs/examples/` |

## Verificación

- `node tests/smoke-test.js`: pruebas de hooks, topes, compuertas, presupuesto, instalación y estructura. Corre en Linux, Windows y macOS en cada push.
- El CI además ejecuta el instalador dos veces en los tres sistemas con la CLI real y valida cada plugin con `claude plugin validate --strict`. Un plugin que cambia sin subir su versión no pasa.
- Evals de disparo por plugin (`claude plugin eval plugins/<plugin> --model haiku --no-publish`). Consumen cuota de tu cuenta, por eso no corren en CI.
- [`docs/PRUEBA-REAL.md`](docs/PRUEBA-REAL.md): checklist para confirmar en tu máquina que los hooks bloquean en una sesión real.

## Contribuir

El diseño del repo, el contrato de los hooks y los pasos para agregar una skill o un hook están en [`docs/DISENO.md`](docs/DISENO.md). Seguridad: [`SECURITY.md`](SECURITY.md).

## Qué NO va en este repo

Tu `CLAUDE.md` global, `settings.json`, `~/.claude.json` (sesión, MCP, trust), historial y sesiones. Eso va en un repo privado de dotfiles.

## Licencia

MIT.
