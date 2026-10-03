---
name: spec-interview
description: >-
  Entrevista al usuario para definir una feature grande y escribe un SPEC.md autocontenido antes de implementar. Solo se invoca a mano con /spec-interview seguido de una descripción breve.
disable-model-invocation: true
argument-hint: "[descripción breve de la feature]"
---

# spec-interview

Feature a especificar: $ARGUMENTS

## Procedimiento

1. Entrevistar al usuario con preguntas concretas (herramienta de preguntas si está disponible): implementación técnica, casos borde, permisos e identidad, costo de APIs, riesgos, compromisos. No preguntar lo obvio; ir a lo difícil que el usuario podría no haber considerado.
2. Seguir hasta cubrir todo y escribir `SPEC.md` en la raíz, autocontenido:
   - Objetivo y alcance.
   - Archivos e interfaces involucrados.
   - Qué queda **fuera de alcance**.
   - Requisitos de identidad, autorización y costos (según las invariantes de `CLAUDE.md`).
   - Un paso final de **verificación de punta a punta** que pruebe que la feature funciona.
3. Sin nombres de cliente ni datos de tenant en el SPEC.
4. Terminar recomendando abrir una sesión nueva para implementar, con contexto limpio y el SPEC como referencia.
