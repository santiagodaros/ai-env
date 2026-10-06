---
name: doctor
description: >-
  Diagnostica el entorno ai-env en esta máquina y en este repo: plugins activos, actualización automática, statusline, foto de consumo, interruptores de hooks, scripts de verificación y estado de la arquitectura. Se invoca a mano con /dev-flow:doctor cuando algo no se comporta como se espera o en una máquina nueva.
disable-model-invocation: true
argument-hint: "[stats]"
allowed-tools: Bash(node *skills/doctor/scripts/doctor.cjs*)
---

# doctor

1. Corré `node "${CLAUDE_PLUGIN_ROOT}/skills/doctor/scripts/doctor.cjs"` y mostrá la tabla tal cual.
2. Por cada `FALLA` o `AVISO`, decí en una línea qué hacer (el propio detalle lo indica). No arregles nada sin que te lo pidan.
3. Si todo está `OK`, decilo en una línea y terminá.

## Estadística de uso

Si el argumento es `stats` (`$ARGUMENTS`): corré el mismo script con `--stats` (agregá `--days N` si piden otro período) y mostrá la tabla. Dice qué regla de qué hook bloqueó o pidió confirmación y cuántas veces. Señalá las reglas que más interrumpen y proponé, sin aplicarlo, si conviene apagarlas (`AI_ENV_HOOKS_SKIP`) o ajustarlas. El uso de las skills lo muestra `/skill-doctor`, que ya trae Claude Code.

El script solo lee. No comprueba que los hooks bloqueen en una sesión real: para eso está `docs/PRUEBA-REAL.md` del repo ai-env.
