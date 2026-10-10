# Cambios

Cada plugin tiene su versión y cada publicación su tag `<plugin>--v<versión>`. Acá va lo que cambia para quien los usa.

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
