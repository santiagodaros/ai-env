# Hub CSP

Portal de operaciones CSP y FinOps. Frontend React + TypeScript; backend propio; repo en GitHub. El stack es mixto: revisar el lenguaje de cada carpeta antes de asumir.

## Comandos (completar los reales)
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Tests: `npm test` (preferir correr un solo archivo, no la suite entera)
- Build: `npm run build`
- Todo cambio de código se verifica con typecheck + lint + tests antes de darlo por terminado.

## Invariantes (no negociables)
- **Secretos:** cero credenciales en código, repo ni bundle del frontend. Backend: managed identity primero, federación OIDC para CI, certificado solo como fallback, nunca client secret en producción.
- **Autorización:** se valida en el backend, en cada endpoint y por cliente (GDAP/RBAC). Ocultar un botón en la UI no es un control.
- **Acciones con impacto** (compras RI/SP, cambios de permisos): aprobación humana explícita.
- **Números:** salen de KQL/API deterministas; la IA solo redacta narrativa, nunca calcula.
- **Datos:** logs sin tokens ni datos de tenant. Ningún nombre de cliente ni ID de tenant en archivos versionados; usar placeholders.
- Reglas por capa en `.claude/rules/` (frontend y llamadas a APIs).

## Flujo de trabajo
- Antes de afirmar algo de Azure (límites, SKUs, GA/Preview, flags de CLI): skill `azure-claim-check`.
- Revisión de un PR o módulo: skill `app-architecture-review`. Cambios de identidad o permisos: subagente `reviewer`.
- Mapear el repo o rastrear un uso: subagente `explorer`.
- Feature grande: `/spec-interview`. Antes de abrir un PR: `/pr-prep`.
- Estado en `docs/STATE.md` (skill `context-ledger`). Un chat por módulo. Checkpoint al cerrar cada decisión.
- Los escáneres (CodeQL, gitleaks, Dependabot) corren en CI; no repetir a mano lo que detectan.

## Al compactar
Conservar siempre: archivos modificados, comandos de verificación, decisiones firmes con su motivo, identificadores exactos y el próximo paso.

## Idioma
Español rioplatense en conversación. Código, commits y nombres técnicos en inglés.
