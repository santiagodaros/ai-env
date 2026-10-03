# ai-env

Marketplace de plugins para Claude Code, más un kit de proyecto con hooks y CI. Contenido en español rioplatense.

## Instalar los plugins

```powershell
claude plugin marketplace add santiagodaros/ai-env
claude plugin install front-studio@ai-env
claude plugin install app-review@ai-env
claude plugin install cloud-ops@ai-env
```

O con el script: `bootstrap\bootstrap.ps1 -Repo santiagodaros/ai-env` (Windows) / `bootstrap/bootstrap.sh santiagodaros/ai-env` (macOS, Linux).

Actualizar: `/plugin marketplace update ai-env`. Los plugins no declaran `version`, así que cada commit cuenta como versión nueva. Las skills quedan con prefijo de plugin (por ejemplo `front-studio:redesign`).

## Qué hace cada skill

Convención: **manual** = solo se activa si la invocás vos (`/plugin:skill`); **auto** = Claude la carga solo cuando el pedido coincide con su descripción.

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

### `app-review` — revisión de código y de PRs

| Pieza | Tipo | Activación | Qué hace |
|---|---|---|---|
| `app-architecture-review` | skill | auto | Revisa React, TypeScript y backend en tres lentes: identidad, seguridad y costo de llamadas a APIs (`references/identity.md`, `security.md`, `cost.md`). Se activa con "revisá este PR", "auditá esto" o cambios en autenticación, permisos o secretos |
| `pr-prep` | skill | manual | Corre las verificaciones, revisa el diff contra las invariantes del proyecto y redacta la descripción del PR |
| `spec-interview` | skill | manual | Te entrevista para definir una feature grande y escribe un `SPEC.md` autocontenido antes de implementar |
| `reviewer` | subagente | auto | Revisor independiente en contexto limpio para cambios de alto riesgo (identidad, permisos, secretos, APIs de Microsoft). Para antes de mergear o entregar, no para cada commit |
| `explorer` | subagente | auto | Explorador de solo lectura: rastrea dónde se usa una credencial, endpoint o permiso y devuelve solo la conclusión, para no llenar tu contexto |

### `cloud-ops` — trabajo en Azure y entregables

| Skill | Activación | Qué hace |
|---|---|---|
| `azure-claim-check` | auto | Antes de afirmar un límite, cuota, SKU, estado GA/Preview, flag de CLI o parámetro de API, lo verifica contra Microsoft Learn |
| `azure-inventory-kql` | auto | Arma consultas de inventario con Resource Graph (KQL) vía `az` CLI entre suscripciones: servidores SQL, storage, VMs, exposición pública (`queries.md`) |
| `client-deliverables` | auto | Reglas para mails formales, informes, resúmenes ejecutivos y propuestas a cliente o management |
| `deliverable-review` | auto | Checklist binaria (pasa/falla) antes de enviar un entregable |
| `context-ledger` | auto | Mantiene un `STATE` del proyecto para sobrevivir a `/compact` y `/clear`; se activa con "checkpoint", "handoff" o "retomemos" |

> Las skills de `cloud-ops` y `app-review` fueron escritas con un flujo de trabajo concreto (Azure, React + TypeScript, español). Leelas y adaptá las reglas a tu contexto antes de confiar en ellas.

## Kit de proyecto (hooks, permisos, CI)

Los hooks necesitan rutas del proyecto, por eso no van como plugin: `kits/hub-ai-kit` se instala con script.

| Pieza | Qué hace |
|---|---|
| Hook `protect-files` | Bloquea ediciones a `.git/`, lockfiles, `.env` (salvo `.env.example`) y contenido que parece un secreto |
| Hook `stop-verify` | Antes de dar el trabajo por terminado corre typecheck y lint si hubo cambios, incluso en carpetas nuevas |
| Hook `rehydrate` | Tras `/compact` reinyecta `docs/STATE.md` para no perder decisiones |
| `deny` de lectura | Claude no lee `.env`, `.env.*` ni `secrets/` |
| `.github/` | CodeQL, gitleaks, dependency review y Dependabot; opcional revisión de PR con Claude |
| `rules/`, `CLAUDE.md` | Invariantes y reglas por capa (frontend, llamadas a API); las reglas solo cargan al tocar archivos que coinciden |
| `statusline.cjs` | Contexto usado, límite de 5 h y costo, siempre a la vista |

```powershell
node kits\hub-ai-kit\install.js --repo "C:\ruta\a\tu-repo" --dry-run
node kits\hub-ai-kit\install.js --repo "C:\ruta\a\tu-repo"
node kits\hub-ai-kit\smoke-test.js --repo "C:\ruta\a\tu-repo"
```

Detalle en `kits/hub-ai-kit/README.md`. Verificado en Windows con Claude Code 2.1.x (hooks en `.cjs`, forma shell).

## Mantener el repo (contribuir)

- `kits/hub-ai-kit` es la fuente de skills/agentes de `app-review` y `cloud-ops`; `plugins/front-studio` es fuente propia.
- Después de editar el kit: `node scripts/sync-plugins.cjs` y commitear `plugins/`. El CI falla si no coinciden.
- Chequeos: `node scripts/check.cjs`. Detecta GUIDs, emails, secretos, frontmatter roto y errores de sintaxis.
- Activar el hook local: `git config core.hooksPath .githooks`.
- Repo público: copiá `.private-terms.example` a `.private-terms` (ignorado por git) y listá nombres de clientes, dominios internos e IDs de tenant. `check.cjs` bloquea el commit si aparece alguno.
- Validar el marketplace: `claude plugin validate .`

## Qué NO va en este repo

Tu `CLAUDE.md` global, `settings.json`, `~/.claude.json` (sesión, MCP, trust), historial y sesiones. Eso va en un repo privado de dotfiles.

## Licencia

MIT.
