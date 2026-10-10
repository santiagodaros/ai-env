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

1. **Acotá.** En una línea: qué está mal y qué archivos vas a tocar. Antes de editar, chequeá las rutas: `node "${CLAUDE_PLUGIN_ROOT}/skills/quick-fix/scripts/quick.cjs" --plan <archivo>,<archivo>`. Si sale con 3, no edites: mostrá el motivo y seguí con el destino que indica. Si ya ves que el arreglo toca autenticación, sesión, permisos, CORS, secretos, dependencias, infraestructura o esquema (aunque sea una línea), proponé el flujo completo por tu cuenta: podés subir el carril, nunca bajarlo.
2. **Reproducí con una prueba** que falle por el motivo del bug. Si el repo no tiene pruebas para esa parte y el usuario decide no agregarla, anotá su motivo textual (se usa en el paso 4).
3. **Arreglá** con el cambio mínimo. No aproveches para refactorizar ni para "ya que estoy".
4. **Evaluá.** `git add` de los archivos del arreglo y después:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/quick-fix/scripts/quick.cjs" --log "<qué se arregló, una línea>"`
   Agregá `--no-test "<motivo que dio el usuario>"` solo si el usuario lo decidió en el paso 2.
   - Sale con 0: pasó las compuertas y quedó anotado en `docs/CHANGELOG.md`. Seguí.
   - Sale con 3 y dice "NO es un cambio chico": no commitees, no lo partas en pedazos, no lo reescribas para esquivar la regla y no edites la configuración. Mostrá los motivos (con la línea del diff) y el destino que indica el script (`/dev-flow:feature-flow`, o `/arch:arch-first` si es un módulo nuevo): ahí hay auditoría. Lo escrito se aprovecha.
   - Sale con 3 por una compuerta: corregí y repetí.
5. **Una sola parada humana.** Mostrá el diff final y el resultado de las compuertas, y con el sí de la persona commiteá con un mensaje que diga qué se arregló (y hacé push o PR si lo pidió). La única otra decisión humana posible es la exención de pruebas (`--no-test`), y solo si la persona la eligió en el paso 2.

## Qué cuenta como chico

| Regla | Por defecto | Techo |
|---|---|---|
| Archivos de código (sin contar pruebas ni docs) | 3 | 5 |
| Líneas de código cambiadas | 60 | 120 |

Y además, por la **ruta**, no toca: dependencias, infraestructura o pipelines, `architecture.json` o decisiones registradas, identidad, permisos, secretos o sesión (por palabras de la ruta: `src/auth/`, `authMiddleware.ts`, `.env`; no `author.ts`), esquema o datos, ni la configuración de Claude Code del repo.

Y por el **contenido** del diff (líneas agregadas y eliminadas, fuera de pruebas y docs) no toca: autenticación o autorización (`requireAuth`, `[Authorize]`, `jwt.verify`…), sesión, cookies o vencimientos, CORS, validación de TLS, roles y permisos, secretos, CSRF ni ejecución dinámica. Tampoco tiene hallazgos de seguridad de severidad media en código. Sacar un `requireAuth` es una línea, y no es un arreglo chico.

Los umbrales de tamaño se ajustan en `.claude/dev-flow.json` (`{"quickFix": {"maxFiles": 2, "maxLines": 40}}`), nunca por encima del techo. Las reglas de ruta y contenido no tienen excepción.

## Reglas

- No edites `.claude/dev-flow.json` para que tu propio cambio pase.
- `arch-guard` sigue activo: si el repo tiene arquitectura aprobada, el arreglo respeta las capas. La aprobación es por arquitectura, no por cambio: quick-fix no la pide de nuevo, pero tampoco la saltea.
- Sin nombres de cliente ni datos de tenant en el `CHANGELOG`.
