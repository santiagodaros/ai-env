---
name: app-architecture-review
description: >-
  Revisa código de aplicación (React, TypeScript, backend) en tres lentes: identidad, seguridad y costos de API. Usar cuando el usuario pida revisar un PR, un módulo o un cambio, "auditá esto", "revisá seguridad/identidad/costos", o antes de mergear cambios que toquen autenticación, permisos, secretos o llamadas a APIs de Microsoft.
---

# app-architecture-review

Una pasada, tres lentes. Sin lanzar un agente por lente.

## Procedimiento

1. **Alcance.** Identificar qué se revisa (`git diff` del PR o las carpetas indicadas). Revisar solo eso.
2. **Escáneres primero.** Si el CI ya corrió CodeQL, gitleaks o Dependabot, leer sus resultados y **no repetir** lo que detectan. Esta revisión cubre lo que un escáner no ve: lógica de autorización, uso correcto de identidades, cadencia y reintentos de llamadas a APIs.
3. **Cargar solo las lentes relevantes** (progressive disclosure):
   - `references/identity.md`: credenciales, tokens, scopes, flujos de login.
   - `references/security.md`: autorización por endpoint, validación de entradas, logs, frontend.
   - `references/cost.md`: cadencia de APIs, 429, caché, costo de IA.
   Si el cambio no toca una lente, no cargarla.
4. **Evaluar cada ítem como PASA / FALLA / N/A**, con `archivo:línea` de evidencia. Sin evidencia, es "no verificado", no PASA.
5. **Salida:** primero las FALLAS ordenadas por severidad, cada una con la corrección concreta. Después una línea con lo que pasó y lo que no aplicó.

## Alcance acotado

- Solo correctitud y requisitos de las lentes. Nada de estilo, nombres ni refactors opcionales.
- Lo que depende del tenant (roles, Conditional Access, PIM) no está en el código: no opinar, marcarlo como fuera de alcance.
- Si una regla de `references/` parece desactualizada, verificar con la skill `azure-claim-check` antes de marcar una falla.
