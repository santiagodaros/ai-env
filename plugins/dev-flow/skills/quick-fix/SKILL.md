---
name: quick-fix
description: >-
  Camino corto para un arreglo chico y acotado (un bug puntual, un texto, un ajuste menor) sin abrir una feature: un script decide con reglas fijas si el cambio califica y corre las mismas compuertas de pruebas, arquitectura y seguridad. Se invoca a mano con /dev-flow:quick-fix seguido de qué hay que arreglar.
disable-model-invocation: true
argument-hint: "[qué hay que arreglar]"
allowed-tools: Bash(node *skills/quick-fix/scripts/quick.cjs*)
---

# quick-fix

Arreglo: $ARGUMENTS

El flujo completo (arquitectura, SPEC, cierre, ADR) es para features. Un arreglo chico no lo necesita, pero **quién decide si es chico es el script, no vos ni el apuro**.

## Procedimiento

1. **Acotá.** En una línea: qué está mal y qué archivo vas a tocar. Si ya ves que son varios módulos, dependencias nuevas, infraestructura, permisos o esquema de datos, frená y proponé `/dev-flow:feature-flow`.
2. **Reproducí con una prueba** que falle por el motivo del bug. Si el repo no tiene pruebas para esa parte y el usuario decide no agregarla, anotá su motivo textual (se usa en el paso 4).
3. **Arreglá** con el cambio mínimo. No aproveches para refactorizar ni para "ya que estoy".
4. **Evaluá.** `git add` de los archivos del arreglo y después:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/quick-fix/scripts/quick.cjs" --log "<qué se arregló, una línea>"`
   Agregá `--no-test "<motivo que dio el usuario>"` solo si el usuario lo decidió en el paso 2.
   - Sale con 0: pasó las compuertas y quedó anotado en `docs/CHANGELOG.md`. Seguí.
   - Sale con 3 y dice "NO es un cambio chico": no lo fuerces ni lo partas en pedazos para que pase. Mostrá los motivos y pasá a `/dev-flow:feature-flow`; lo escrito se aprovecha.
   - Sale con 3 por una compuerta: corregí y repetí.
5. **Commit** con un mensaje que diga qué se arregló. Push o PR, solo con el sí explícito del usuario.

## Qué cuenta como chico

| Regla | Por defecto | Techo |
|---|---|---|
| Archivos de código (sin contar pruebas ni docs) | 3 | 5 |
| Líneas de código cambiadas | 60 | 120 |

Y además no toca: dependencias, infraestructura o pipelines, `architecture.json` o decisiones registradas, identidad, permisos, secretos o sesión, esquema o datos, ni la configuración de Claude Code del repo. Los umbrales se ajustan en `.claude/dev-flow.json` (`{"quickFix": {"maxFiles": 2, "maxLines": 40}}`), nunca por encima del techo.

## Reglas

- No edites `.claude/dev-flow.json` para que tu propio cambio pase.
- `arch-guard` sigue activo: si el repo tiene arquitectura aprobada, el arreglo respeta las capas.
- Sin nombres de cliente ni datos de tenant en el `CHANGELOG`.
