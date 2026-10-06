# ai-env

Marketplace de plugins para Claude Code: hooks de protección, un workflow por features con arquitectura hexagonal, revisión de aplicaciones, operación de Azure y rediseño de front. Todo se instala como plugin; no hay archivos que copiar a mano. Contenido en español rioplatense.

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
| `AI_ENV_PLUGINS="guard dev-flow"` | Instala solo esos plugins (por defecto, los cinco; cada uno es independiente) |
| `AI_ENV_NO_SETUP=1` | No toca `settings.json`: sin statusline ni actualización automática |
| `AI_ENV_FORCE_STATUSLINE=1` | Reemplaza la statusline que ya tengas |
| `AI_ENV_SOURCE=usuario/repo` | Instala desde un fork o una carpeta local |

A mano, sin instalador:

```powershell
claude plugin marketplace add santiagodaros/ai-env
claude plugin install guard@ai-env        # y los que quieras: dev-flow, app-review, cloud-ops, front-studio
```

Si instalaste a mano, una vez por máquina dentro de Claude Code:

```
/dev-flow:setup     # statusline del límite de 5 h y actualización automática del marketplace
/dev-flow:doctor    # diagnóstico: qué está activo y qué falta
```

Y una vez por repo: `/dev-flow:project-init`. Con `--settings` deja el marketplace y los plugins declarados en `.claude/settings.json`, así cargan solos para quien clone el repo y confíe en la carpeta.

**Actualizaciones.** Los plugins no declaran `version`: cada commit es una versión. Claude Code trae la actualización automática apagada para marketplaces de terceros; el instalador (o `/dev-flow:setup`) la enciende. A mano: `claude plugin marketplace update ai-env`.

| Plugin | Qué trae | Costo fijo de contexto |
|---|---|---|
| `guard` | 3 hooks de protección. Sirve en cualquier repo, sin configuración | 0 tokens |
| `dev-flow` | 12 skills manuales y 4 hooks: arquitectura antes del código, features, compuertas, cierre, presupuesto | hasta ~1.500 tokens |
| `app-review` | 3 skills y 2 subagentes de revisión | ~570 tokens |
| `cloud-ops` | 5 skills de Azure y el servidor MCP de Microsoft Learn | ~660 tokens |
| `front-studio` | 8 skills de rediseño y re-auditoría | ~690 tokens |

Los costos son la estimación de `claude plugin details <plugin>@ai-env` (descripciones de skills; los hooks no consumen contexto).

## Qué protege `guard`

| Hook | Evento | Qué hace |
|---|---|---|
| `protect-files` | Edit, Write | Bloquea escrituras en `.git/`, lockfiles y `.env` (salvo `.env.example`), y contenido con apariencia de secreto (claves de Storage, client secrets, claves privadas, JWT). Pide confirmación para tocar `.claude/settings.json` |
| `secret-read` | Read | Bloquea leer `.env`, `secrets/`, claves y certificados privados. Reemplaza las reglas `permissions.deny`, que un plugin no puede distribuir |
| `bash-guard` | Bash, PowerShell | Bloquea leer `.env` por consola, el borrado recursivo de la raíz, el home o una unidad, y `git push --force` a main. Pide confirmación para borrar recursos de Azure (`az ... delete`, `Remove-Az*`), cambios de permisos o credenciales, `terraform destroy` y `apply -auto-approve`, `git reset --hard`, `--no-verify`, `kubectl delete`, y descargar y ejecutar scripts |

Son heurísticas sobre el texto: una red de contención, no un reemplazo de permisos mínimos, locks en los recursos ni gitleaks en CI.

### Interruptores

Variables de entorno del proceso de Claude Code (no de los comandos que corre Claude):

| Variable | Efecto |
|---|---|
| `AI_ENV_HOOKS=off` | Apaga todos los hooks de ai-env |
| `AI_ENV_HOOKS_SKIP=bash-guard,stop-verify` | Apaga los hooks nombrados |
| `AI_ENV_GUARD_STRICT=1` | Lo que pide confirmación pasa a bloquearse |

`/dev-flow:doctor` avisa si hay alguno activo.

## Sesiones por feature sin abusar

`feature-flow` deja cada feature con su contexto en archivos, para continuarla en un chat nuevo con la relectura automática del hook `rehydrate`. Por defecto no abre ninguna sesión: te imprime `claude -w <slug> -n <slug>` para que la abras vos.

Lanzar en segundo plano (`launch.cjs --launch`) es opcional y se rechaza si:

| Condición | Tope por defecto | Techo fijo en el código |
|---|---|---|
| Sesiones en segundo plano vivas | 2 | 3 |
| Lanzamientos por día | 3 | 6 |
| Espera entre lanzamientos | 10 min | no baja de 5 min |
| Misma feature en las últimas 24 h | rechazada | rechazada |
| Documentos sin commitear o `SPEC.md` de menos de 200 caracteres | rechazada | rechazada |
| Pedido desde una sesión que ya fue lanzada por el flujo | rechazada | rechazada |
| Menos del 10 % libre del límite de 5 h, o la feature no entra según la estimación | rechazada | reserva nunca menor a 5 % |
| No se puede contar las sesiones activas | rechazada | rechazada |

Podés bajar los topes en `.claude/feature-flow.json`; no subirlos por encima del techo. Cada lanzamiento pide confirmación en pantalla. El hook `session-guard` viene en el mismo plugin: bloquea `claude --bg`, `-w` y `-p` directos, y el lanzador no sirve de salvoconducto para encadenar otro `claude` en la misma línea.

## Qué hace cada skill

Convención: **manual** = solo se activa si la invocás vos (`/plugin:skill`); **auto** = Claude la carga sola cuando el pedido coincide con su descripción.

### `dev-flow` — del repo vacío al PR

Todas las skills son manuales. Orden típico: `project-init` → `arch-first` → `feature-flow` o `feature-run` → `feature-close` → `pr-prep`.

| Skill | Activación | Qué hace |
|---|---|---|
| `project-init` | manual | Repo nuevo o clonado: detecta stack y scripts reales, completa `CLAUDE.md`, `docs/STATE.md` y `.gitignore` sin pisar nada, con `--settings` deja declarados el marketplace y los plugins en `.claude/settings.json` (cargan solos para quien clone el repo), con `--ci` agrega los workflows, y encadena `arch-first` |
| `arch-first` | manual | Antes de escribir código de un programa, página o automatización: arquitectura hexagonal con puertos y seguridad por capa en `architecture.json` y `ARCHITECTURE.md`, vista previa (diagrama, carpetas, reglas), **aprobación humana con sello por hash** y recién después se habilita el código. El hook `arch-guard` bloquea código sin aprobar, fuera de las capas o que rompa la regla de dependencia; `arch-check.cjs` lo verifica en feature-close y en el CI (TypeScript/JavaScript, Python y PowerShell) |
| `feature-flow` | manual | Parte un trabajo grande en hasta 3 features, crea `docs/features/<slug>/` con `SPEC.md`, `STATE.md` y `HANDOFF.md`, y te da el comando para retomarla en una sesión nueva. Abrir sesiones en segundo plano es opcional y tiene límites duros (ver abajo) |
| `feature-run` | manual | Orquesta una feature de punta a punta: presupuesto, SPEC aprobado, implementación, pruebas, cierre con documentos y `PR.md`. `stage.cjs` dice en qué etapa está mirando archivos y git, así que se puede reanudar. Paradas: SPEC sin aprobar, sin presupuesto, tests rojos tras 2 intentos, push o PR sin tu sí |
| `spec-interview` | manual | Te entrevista para definir una feature grande y escribe un `SPEC.md` autocontenido antes de implementar |
| `budget-plan` | manual | Dice cuánto queda del límite de 5 h, estima cuánto necesita una feature (percentil 75 de las ya medidas) y propone ejecutar ahora, justo o dividida en rebanadas que entren en lo disponible. Mide solo: `rehydrate` inicia y `feature-close` cierra la medición |
| `security-diff` | manual | Revisión de seguridad solo del diff: reglas deterministas sobre las líneas agregadas (secretos, TLS desactivado, ejecución dinámica, inyección, XSS, CORS abierto, permisos amplios, GUIDs, dependencias nuevas). Alta bloquea el cierre; un riesgo aceptado lo declara el usuario en el STATE |
| `adr` | manual | Una página por decisión en `docs/decisions/` con índice automático; las decisiones marcadas `[ADR]` en el STATE se registran al cerrar la feature |
| `feature-close` | manual | Cierra una feature en una corrida: corre typecheck, lint y test y una compuerta de pruebas (rechaza código cambiado sin ningún archivo de prueba, salvo `Sin pruebas: <motivo>` declarado en el STATE); escribe la entrada de `docs/CHANGELOG.md` y el diseño final de punta a punta en `docs/design/<slug>.md` desde los hechos del diff (`collect.cjs`); los valida (`verify.cjs`: secciones completas, rutas citadas que existan, sin GUIDs ni términos privados); arma `PR.md` (título y cuerpo desde lo verificado), marca el STATE como cerrado y commitea solo docs. No cierra si algo falla |
| `pr-prep` | manual | Corre las verificaciones, revisa el diff contra las invariantes del proyecto y redacta la descripción del PR |
| `setup` | manual | Una vez por máquina: instala la statusline (única fuente del límite de 5 h) y activa la actualización automática. Simula antes de escribir, deja copia `.bak` y no reemplaza una statusline ajena sin `--force-statusline` |
| `doctor` | manual | Diagnóstico de solo lectura: herramientas, plugins activos, auto-update, statusline, foto de consumo, interruptores, scripts de verificación y estado de la arquitectura |

| Hook | Evento | Qué hace |
|---|---|---|
| `arch-guard` | Edit, Write | En carpetas con `architecture.json`: no deja escribir código sin arquitectura aprobada por la persona, ni fuera de las capas, ni con imports que rompan la regla de dependencia, ni sellar la aprobación por su cuenta |
| `session-guard` | Bash, PowerShell | Bloquea que Claude abra sesiones por su cuenta y que corra `approve.cjs`; lanzar con `feature-flow` pide confirmación humana |
| `rehydrate` | SessionStart | Tras `/compact` reinyecta `docs/STATE.md`; al arrancar en la rama o worktree de una feature inyecta su `HANDOFF.md` y `STATE.md` e inicia la medición de consumo |
| `stop-verify` | Stop | Si hubo cambios de código, corre `typecheck` y `lint` antes de dar el turno por terminado. Se apaga por repo con `{"stopVerify": false}` en `.claude/dev-flow.json` |

### `app-review` — revisión de código

| Pieza | Tipo | Activación | Qué hace |
|---|---|---|---|
| `app-architecture-review` | skill | auto | Revisa React, TypeScript y backend en tres lentes: identidad, seguridad y costo de llamadas a APIs (`references/identity.md`, `security.md`, `cost.md`). Se activa con "revisá este PR", "auditá esto" o cambios en autenticación, permisos o secretos |
| `frontend-rules` | skill | auto, solo al tocar `**/*.tsx` | Reglas de seguridad para React: variables públicas, PKCE, tokens fuera de `localStorage`, HTML sin sanitizar, autorización del lado servidor |
| `api-call-rules` | skill | auto, solo al tocar `**/*.ts` | Reglas para llamadas a APIs de Microsoft: caché y throttling, reintentos, managed identity, autorización por cliente |
| `reviewer` | subagente | auto | Revisor independiente en contexto limpio para cambios de alto riesgo (identidad, permisos, secretos, APIs de Microsoft). Para antes de mergear o entregar, no para cada commit |
| `explorer` | subagente | auto | Explorador de solo lectura: rastrea dónde se usa una credencial, endpoint o permiso y devuelve solo la conclusión, para no llenar tu contexto |

### `front-studio` — rediseño de front y re-auditoría de seguridad

El estado vive en archivos (`design/`, `docs/security/`), no en el chat: podés cortar, hacer `/clear` y retomar.

| Skill | Activación | Qué hace | Qué deja escrito |
|---|---|---|---|
| `redesign` | manual | Orquesta las etapas 1 a 6 con compuertas: no avanza sin aprobación de la etapa anterior | `design/STATE.md` |
| `brand-intake` | manual | Captura paleta, tipografías, logo y voz; calcula contraste WCAG con `scripts/contrast.cjs` en vez de estimarlo | `design/brand.md`, `design/tokens.css` |
| `product-map` | manual | Lee el repo y el dominio cloud/FinOps; define personas, tareas, navegación, pantallas y estados. Parte de qué necesita decidir quien opera, no de un menú genérico | `design/product-map.md` |
| `design-direction` | manual | Elige UNA dirección visual y de movimiento anclada en la marca y el producto, y la contrasta contra los tics de UI generada por IA (`references/ai-tells.md`) y las reglas de movimiento (`references/motion.md`) | `design/direction.md` |
| `live-preview` | manual | Construye UNA página HTML navegable con rutas, estados y movimiento. En terminal usa `serve.cjs` (recarga sola); en la app de Claude se publica como artifact HTML | `design/preview/index.html` |
| `react-port` | manual | Pasa el preview aprobado al código React/TypeScript del repo por rebanadas, respetando tema, dependencias y convenciones | Código en el repo |
| `ui-review` | auto o manual | Revisa un diff o pantalla contra la dirección, los tics de IA, los estados, la accesibilidad (`references/a11y-checklist.md`) y el movimiento | Informe en la respuesta |
| `security-reaudit` | manual | Re-audita una app web con backend contra una línea base de hallazgos previos: primero verificadores deterministas, después revisión por superficie (`references/surfaces.md`) | `docs/security/` con plantilla de hallazgos |

Orden típico: `redesign` → `brand-intake` → `product-map` → `design-direction` → `live-preview` → `ui-review` → `react-port`. `security-reaudit` es independiente. Ejemplo de los documentos que produce cada etapa: `plugins/front-studio/examples/portal-muestra/` (marca ficticia; es una muestra del formato, no un estándar de calidad visual).

### `cloud-ops` — trabajo en Azure y entregables

| Skill | Activación | Qué hace |
|---|---|---|
| `azure-claim-check` | auto | Antes de afirmar un límite, cuota, SKU, estado GA/Preview, flag de CLI o parámetro de API, lo verifica contra Microsoft Learn |
| `azure-inventory-kql` | auto | Arma consultas de inventario con Resource Graph (KQL) vía `az` CLI entre suscripciones: servidores SQL, storage, VMs, exposición pública (`queries.md`) |
| `client-deliverables` | auto | Reglas para mails formales, informes, resúmenes ejecutivos y propuestas a cliente o management |
| `deliverable-review` | auto | Checklist binaria (pasa/falla) antes de enviar un entregable |
| `context-ledger` | auto | Mantiene un `STATE` del proyecto para sobrevivir a `/compact` y `/clear`; se activa con "checkpoint", "handoff" o "retomemos" |

> Las skills de `cloud-ops` y `app-review` fueron escritas con un flujo de trabajo concreto (Azure, React + TypeScript, español). Leelas y adaptá las reglas a tu contexto antes de confiar en ellas.

`cloud-ops` declara el servidor MCP remoto de Microsoft Learn (`https://learn.microsoft.com/api/mcp`), que usa `azure-claim-check`.

## Lo que un plugin no puede instalar

| Pieza | Por qué | Cómo se resuelve acá |
|---|---|---|
| Statusline | El `settings.json` de un plugin solo admite `agent` y `subagentStatusLine` | `/dev-flow:setup` la instala una vez; `rehydrate` la mantiene al día |
| Permisos (`deny`) | No se distribuyen por plugin | Los hooks `secret-read` y `bash-guard` |
| `CLAUDE.md` y `rules/` | Un `CLAUDE.md` en la raíz del plugin no se carga | Las reglas son skills con `paths`; `project-init` completa el `CLAUDE.md` del repo. Ejemplos en `docs/examples/` |

## Verificación

- `node tests/smoke-test.js`: 173 pruebas de hooks, topes, compuertas, presupuesto, setup y estructura de los plugins. Corre en Linux, Windows y macOS en cada push.
- Evals de disparo (¿la skill se activa cuando debe y no cuando no?): `claude plugin eval plugins/cloud-ops --model haiku --no-publish`. Consumen cuota de tu cuenta, por eso no corren en CI.
- `docs/PRUEBA-REAL.md`: checklist para confirmar en tu máquina que los hooks bloquean en una sesión real.

## Mantener el repo (contribuir)

- `plugins/` es la única fuente. Para probar un cambio sin instalar: `claude --plugin-dir plugins/guard --plugin-dir plugins/dev-flow`.
- Los hooks no tienen dependencias y no usan la red. Mantenelos así: un plugin con hooks ejecuta código en la máquina de quien lo instala (ver `SECURITY.md`).
- Chequeos: `node scripts/check.cjs` (GUIDs, emails, secretos, frontmatter, sintaxis) y `claude plugin validate .`.
- Activar el hook local: `git config core.hooksPath .githooks`.
- Repo público: copiá `.private-terms.example` a `.private-terms` (ignorado por git) y listá nombres de clientes, dominios internos e IDs de tenant. `check.cjs` bloquea el commit si aparece alguno.
- Cambios visibles para quien usa los plugins: una línea en `CHANGELOG.md`.

## Qué NO va en este repo

Tu `CLAUDE.md` global, `settings.json`, `~/.claude.json` (sesión, MCP, trust), historial y sesiones. Eso va en un repo privado de dotfiles.

## Licencia

MIT.
