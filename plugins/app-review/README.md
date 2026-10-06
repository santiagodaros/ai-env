# app-review

Revisión de código de aplicación (React, TypeScript, backend) en tres lentes: identidad, seguridad y costo de llamadas a APIs.

```
claude plugin install app-review@ai-env
```

## Qué trae

| Pieza | Tipo | Activación | Qué hace |
|---|---|---|---|
| `app-architecture-review` | skill | auto | Revisa React, TypeScript y backend en tres lentes: identidad, seguridad y costo de llamadas a APIs (`references/identity.md`, `security.md`, `cost.md`). Se activa con "revisá este PR", "auditá esto" o cambios en autenticación, permisos o secretos |
| `frontend-rules` | skill | auto, solo al tocar `**/*.tsx` | Reglas de seguridad para React: variables públicas, PKCE, tokens fuera de `localStorage`, HTML sin sanitizar, autorización del lado servidor |
| `api-call-rules` | skill | auto, solo al tocar `**/*.ts` | Reglas para llamadas a APIs de Microsoft: caché y throttling, reintentos, managed identity, autorización por cliente |
| `reviewer` | subagente | auto | Revisor independiente en contexto limpio para cambios de alto riesgo (identidad, permisos, secretos, APIs de Microsoft). Para antes de mergear o entregar, no para cada commit |
| `explorer` | subagente | auto | Explorador de solo lectura: rastrea dónde se usa una credencial, endpoint o permiso y devuelve solo la conclusión, para no llenar tu contexto |

Las reglas de React y de llamadas a APIs solo entran al contexto cuando se toca un archivo que coincide con su patrón.

## Límites

Las listas de revisión son práctica general de seguridad y de uso de APIs de Microsoft; los ítems que no están verificados contra Microsoft Learn lo dicen en el propio archivo. Fueron escritas para un stack concreto (Azure, React + TypeScript): leelas y adaptalas antes de confiar en ellas.

## Evals

`claude plugin eval plugins/app-review --model haiku --no-publish` comprueba que la revisión se active ante un cambio de autenticación y no ante una pregunta general.
