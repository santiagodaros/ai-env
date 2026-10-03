# Lente: identidad

Cada ítem se evalúa PASA / FALLA / N/A con evidencia `archivo:línea`.

## Credenciales (backend)

- [ ] No hay secretos, claves ni connection strings con credenciales en código, configuración versionada, ni en el historial reciente del diff.
- [ ] El acceso a recursos de Azure usa managed identity (p. ej. `DefaultAzureCredential` o `ManagedIdentityCredential`). Si no es posible, certificado; client secret solo si no existe alternativa y nunca en producción.
- [ ] CI/CD usa federación de identidad de workload (OIDC) y no secretos de larga vida guardados en GitHub.
- [ ] Hay identidades distintas por entorno (dev / prod).
- [ ] Si quedó algún secreto, su vida máxima es de 24 meses, recomendado menos de 12.

## Tokens y scopes

- [ ] Los scopes/permisos de Graph y Partner Center pedidos son los mínimos necesarios y granulares (no `*.ReadWrite.All` si alcanza uno más acotado).
- [ ] Los tokens recibidos se validan (emisor, audiencia, scope) antes de usarse.
- [ ] Los tokens de acceso se cachean hasta su vencimiento y se manejan por clase de error (401 renovar, 403 no reintentar, 429 esperar).
- [ ] Ningún token se guarda en `localStorage` del navegador ni se loguea.

## Login en el navegador (frontend)

- [ ] Flujo authorization code con PKCE. No implicit flow.
- [ ] El frontend no contiene secretos (ni `VITE_*` ni `NEXT_PUBLIC_*`).

## Aprobaciones

- [ ] Acciones que cambian permisos o compran algo requieren aprobación humana explícita, registrada.

## Fuentes (Microsoft Learn, verificadas el 2026-09-30)

- https://learn.microsoft.com/en-us/security/zero-trust/develop/identity
- https://learn.microsoft.com/en-us/entra/identity/managed-identities-azure-resources/managed-identity-best-practice-recommendations
- https://learn.microsoft.com/en-us/entra/workload-id/workload-identity-federation
- https://learn.microsoft.com/en-us/security/benchmark/azure/mcsb-v2-identity-management

Los ítems de PKCE y de `localStorage` son práctica general de seguridad web; no están verificados contra Learn en este kit.
