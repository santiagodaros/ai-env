---
name: feature-flow
description: >-
  Parte un trabajo grande en features con documentos propios (SPEC, STATE, HANDOFF) para retomarlas en una sesión nueva con contexto limpio, con límites duros contra abrir sesiones de más. Solo se invoca a mano con /feature-flow seguido de una descripción breve.
disable-model-invocation: true
argument-hint: "[descripción del trabajo a partir en features]"
---

# feature-flow

Trabajo a partir: $ARGUMENTS

Objetivo: que cada feature tenga su propio contexto en archivos, para continuarla en un chat nuevo sin releer todo. **La sesión nueva es la excepción, no la regla.** Por defecto este flujo NO abre ninguna sesión: deja todo listo y te dice el comando.

## Procedimiento

1. **Proponer el corte, preferí una sola feature.** Máximo 3. Por cada una: `slug` (minúsculas, números y guiones, hasta 5 palabras), objetivo en una línea, archivos que va a tocar y orden de dependencia. Si dos features tocan los mismos archivos, fusionalas en una. Mostrá el corte y pedí confirmación (herramienta de preguntas si está disponible). No sigas sin respuesta.
2. **Crear `docs/features/<slug>/`** por cada feature confirmada, con las plantillas de `templates/` (ruta base: la que muestra "Base directory for this skill"):
   - `SPEC.md`: seguí el procedimiento de `spec-interview` (objetivo, alcance, fuera de alcance, identidad/costos, verificación de punta a punta). Debe quedar autocontenido y de más de 200 caracteres.
   - `STATE.md`: registro vivo de decisiones y avance.
   - `HANDOFF.md`: lo que la sesión nueva necesita para arrancar sin preguntar.
   Sin nombres de cliente ni datos de tenant.
3. **Commitear solo esa carpeta** (`git add docs/features/<slug>` y commit), con permiso explícito del usuario. Los worktrees se crean desde el último commit: si los documentos no están commiteados, la sesión nueva no los ve.
4. **Dry-run del lanzador**, una vez por feature:
   `node <base>/scripts/launch.cjs --slug <slug>`
   Imprime el plan, los cupos disponibles y el comando exacto. No lanza nada.
5. **Entregar el resultado.** Decile al usuario cómo continuar él mismo, en una terminal nueva dentro del repo:
   `claude -w <slug> -n <slug>`
   Al arrancar, el hook `rehydrate` inyecta `STATE.md` y `HANDOFF.md` de la feature.

## Lanzar en segundo plano (solo si el usuario lo pide con esas palabras)

`node <base>/scripts/launch.cjs --slug <slug> --launch`

- Máximo **una** feature lanzada por pedido del usuario. Nunca en bucle.
- El lanzador rechaza solo si: ya hay sesiones en segundo plano en el tope, se alcanzó el cupo del día, pasó poco tiempo desde el último lanzamiento, la feature ya se lanzó en las últimas 24 h, faltan o no están commiteados los documentos, o el pedido viene de una sesión lanzada por él mismo.
- Si rechaza, informá el motivo tal cual. **No lo esquives**: no corras `claude` por otra vía (un hook lo bloquea) ni edites `.claude/feature-flow.json` para subir los topes.
- Cada lanzamiento pide confirmación humana en pantalla.

## Reglas

- Esta skill no implementa la feature: prepara el terreno. Implementar ocurre en la sesión de cada feature.
- Una sesión lanzada por este flujo no puede lanzar otras.
- Límites por defecto y techos fijos en `scripts/launch.cjs` (2 simultáneas, 3 por día, 10 min de espera; techos 3, 6 y 5 min que el archivo de configuración no puede superar).
