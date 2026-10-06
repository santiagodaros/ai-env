---
name: app-architecture-review
description: >-
  Usar siempre que haya que revisar, auditar u opinar sobre código de aplicación (un PR, un módulo, un cambio) antes de mergear o entregar, y en especial si toca autenticación, tokens, permisos, secretos o llamadas a APIs de Microsoft (Graph, ARM, Cost Management, Partner Center). Invocarla antes de dar un veredicto propio, aunque el problema parezca evidente. Tres lentes: identidad, seguridad y costo de API.
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
