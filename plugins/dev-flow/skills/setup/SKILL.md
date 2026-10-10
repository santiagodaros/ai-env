---
name: setup
description: >-
  Configura una sola vez por máquina lo que el plugin no puede instalar solo: la statusline que mide el límite de 5 h, la actualización automática del marketplace ai-env y, si se pide, el hook de worktrees fuera del repo para `claude -w`. Se invoca a mano con /dev-flow:setup después de instalar el plugin o en una máquina nueva.
disable-model-invocation: true
---

# setup

Un plugin no puede distribuir la statusline ni tocar los settings del usuario. Este paso lo hace una vez, mostrando antes qué va a cambiar.

1. Simulación: `node "${CLAUDE_PLUGIN_ROOT}/skills/setup/scripts/setup.cjs"`. Mostrale al usuario la salida tal cual.
2. Con su visto bueno: el mismo comando con `--apply`. Deja una copia `.bak` del `settings.json` del usuario antes de escribir.
3. **Worktrees fuera del repo** (opcional, para la forma de trabajo Tech Lead + workers): con `--worktrees [raíz]` (por defecto `~/worktrees`) registra en tus settings el hook que crea los worktrees de `claude -w` en `<raíz>/<repo>/<nombre>`, con rama de ticket (`feat-12-x` → `feat/12-x`) y los borra cerrando primero los procesos que los tienen abiertos (en Windows evita el EPERM de `node`, `vitest`, `esbuild`). El plugin ya lo hace para subagentes; el flag `-w` solo respeta hooks de settings.
4. Si avisa que ya hay otra statusline, **no la reemplaces por tu cuenta**: explicá que sin la de ai-env `budget-plan` no tiene datos y que la decisión es suya (`--apply --force-statusline`).
5. Cerrá con `/dev-flow:doctor` para confirmar el estado.

## Reglas
- No edites `~/.claude/settings.json` a mano: solo vía este script.
- Lo que el script lista bajo "A mano" lo hace el usuario; decile exactamente qué.
