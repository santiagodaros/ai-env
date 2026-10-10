---
name: spec-interview
description: >-
  Entrevista al usuario para definir una feature y escribe su SPEC.md autocontenido (y el STATE.md que después cierra feature-close) en docs/features/<slug>/, antes de implementar. Primera primitiva de la cadena spec-interview → implementación → feature-close → pr-prep. Solo se invoca a mano con /dev-flow:spec-interview seguido de una descripción breve.
disable-model-invocation: true
argument-hint: "[descripción breve de la feature]"
---

# spec-interview

Feature a especificar: $ARGUMENTS

## Procedimiento

1. Entrevistar al usuario con preguntas concretas (herramienta de preguntas si está disponible): implementación técnica, casos borde, permisos e identidad, costo de APIs, riesgos, compromisos. No preguntar lo obvio; ir a lo difícil que el usuario podría no haber considerado.
2. Proponé un `slug` (minúsculas, números y guiones, hasta 5 palabras) y confirmalo. Seguí hasta cubrir todo y escribí `docs/features/<slug>/SPEC.md`, autocontenido y de más de 200 caracteres:
   - Objetivo y alcance.
   - Archivos e interfaces involucrados.
   - Qué queda **fuera de alcance**.
   - Requisitos de identidad, autorización y costos (según las invariantes de `CLAUDE.md`).
   - Un paso final de **verificación de punta a punta** que pruebe que la feature funciona.
3. Si no existe, creá `docs/features/<slug>/STATE.md` con la plantilla `${CLAUDE_PLUGIN_ROOT}/skills/feature-flow/templates/STATE.md` (registro vivo de decisiones; `feature-close` lo lee y lo cierra).
4. Sin nombres de cliente ni datos de tenant en el SPEC.
5. Terminar con la cadena de primitivas, que la persona elige:
   - **Implementar**: en esta sesión, en la rama `feature/<slug>`; o en una sesión nueva con contexto limpio (`/dev-flow:feature-flow` agrega el `HANDOFF.md` y da el comando `claude -w <slug>`); o como ticket de un worker (`/dev-flow:dispatch`). Commits chicos, con pruebas.
   - **Cerrar**: `/dev-flow:feature-close <slug>` (verificación, changelog, diseño final y `PR.md`).
   - **PR**: `/dev-flow:pr-prep` (push y PR solo con su sí).
   `/dev-flow:feature-run` hace lo mismo de corrido; las primitivas sirven cuando querés control paso a paso o cortar en el medio.
