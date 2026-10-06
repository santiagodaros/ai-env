# Cambios

Los plugins no declaran `version`: cada commit es una versión. Acá va lo que cambia para quien los usa.

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
3. Instalá los plugins y corré `/dev-flow:setup` y `/dev-flow:doctor`.
