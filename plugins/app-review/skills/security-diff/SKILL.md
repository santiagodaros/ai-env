---
name: security-diff
description: >-
  Revisión de seguridad acotada al diff de una feature: reglas deterministas sobre las líneas agregadas (secretos, TLS desactivado, ejecución dinámica, inyección, XSS, CORS abierto, permisos amplios, GUIDs, dependencias nuevas) y revisión dirigida de lo que queda. Usar antes de cerrar una feature o abrir un PR. Se invoca a mano con /security-diff, opcionalmente con la rama base.
disable-model-invocation: true
argument-hint: "[rama base, opcional]"
---

# security-diff

Base: $ARGUMENTS (si está vacío, se detecta la rama base)

Dos pasos: primero el escáner, que no opina; después tu revisión de lo que el escáner no puede decidir.

1. **Escáner.** `node <base>/scripts/secscan.cjs --range <rama-base>..HEAD --state docs/features/<slug>/STATE.md` (ruta base: la que muestra "Base directory for this skill"). Mira solo las líneas agregadas. Exit 3 = hay hallazgos de severidad alta sin aceptar.
2. **Alta.** Se corrigen; no se esquivan. Si es un falso positivo claro (por ejemplo un secreto falso en una prueba), el comentario `secscan-allow` en esa línea la excluye. Un riesgo real que el usuario decide aceptar se declara en el `STATE.md` con una línea `Riesgo aceptado: <Sxxx> <motivo de al menos 10 caracteres>`: la escribe el usuario, no vos, y queda en el PR.
3. **Media.** Para cada una, leé el código real y decidí: corregir, o justificar por qué no aplica. Si toca identidad, permisos o secretos, usá el subagente `reviewer`.
4. **Dependencias nuevas.** Para cada una: qué hace, si es necesaria, mantenimiento y licencia (verificalo, no lo supongas), y si el lockfile quedó versionado.
5. **Contra la línea base.** Revisá los controles que el diseño prometía en `docs/architecture/ARCHITECTURE.md` (sección Seguridad) y `references/security-baseline.md` de `arch-first`: ¿el código los cumple? Lo que no puedas comprobar, decilo como "sin verificar".
6. Entregá un resumen corto: cuántos hallazgos por severidad, qué corregiste, qué quedó aceptado y por quién.

## Qué es y qué no es

Es un filtro de patrones sobre el diff, no un análisis de flujo de datos ni un reemplazo de CodeQL o gitleaks del CI. Un diff sin hallazgos no significa que sea seguro.
