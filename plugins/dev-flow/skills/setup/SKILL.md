---
name: setup
description: >-
  Configura una sola vez por máquina lo que el plugin no puede instalar solo: la statusline que mide el límite de 5 h y la actualización automática del marketplace ai-env. Se invoca a mano con /dev-flow:setup después de instalar el plugin o en una máquina nueva.
disable-model-invocation: true
---

# setup

Un plugin no puede distribuir la statusline ni tocar los settings del usuario. Este paso lo hace una vez, mostrando antes qué va a cambiar.

1. Simulación: `node "${CLAUDE_PLUGIN_ROOT}/skills/setup/scripts/setup.cjs"`. Mostrale al usuario la salida tal cual.
2. Con su visto bueno: el mismo comando con `--apply`. Deja una copia `.bak` del `settings.json` del usuario antes de escribir.
3. Si avisa que ya hay otra statusline, **no la reemplaces por tu cuenta**: explicá que sin la de ai-env `budget-plan` no tiene datos y que la decisión es suya (`--apply --force-statusline`).
4. Cerrá con `/dev-flow:doctor` para confirmar el estado.

## Reglas
- No edites `~/.claude/settings.json` a mano: solo vía este script.
- Lo que el script lista bajo "A mano" lo hace el usuario; decile exactamente qué.
