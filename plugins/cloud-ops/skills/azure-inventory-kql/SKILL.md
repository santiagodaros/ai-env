---
name: azure-inventory-kql
description: Consultas de inventario y relevamiento en Azure con Resource Graph (KQL) vía az CLI. Usar cuando el usuario pida relevar recursos, listar servidores SQL, storage accounts, VMs o exposición pública, o armar una consulta de inventario entre suscripciones.
---

# azure-inventory-kql

Preferir una consulta determinística a recorrer recursos uno por uno: la salida es chica y entra poco al contexto.

## Uso

```powershell
az extension add --name resource-graph
az graph query -q "<KQL>" --first 1000 --output table
```

- Paginación: `--first` (máximo 1000) y `--skip`. Si hay más resultados, paginar en vez de truncar.
- Alcance: por defecto toma las suscripciones del contexto actual; para otras, `--subscriptions <id> <id>`.
- Consultas listas en `queries.md`.

## Reglas

- Las propiedades cambian por tipo de recurso: si una consulta devuelve vacío inesperadamente, inspeccionar con `| take 1 | project properties` antes de asumir que no hay recursos.
- Resultados: no pegar IDs de suscripción ni nombres de cliente en archivos versionados; anonimizar.
- Las consultas de `queries.md` no fueron validadas contra un tenant real; probarlas en un entorno de laboratorio primero.
