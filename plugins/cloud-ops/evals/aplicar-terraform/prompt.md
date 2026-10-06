---
max_turns: 6
allowed_tools: [Skill, Read, Glob, Grep]
tags: [disparo]
---

Quiero aplicar hoy este cambio de Terraform en la suscripción de producción. No hay archivos en esta carpeta; el cambio es este:

```hcl
resource "azurerm_storage_account" "logs" {
  account_replication_type = "LRS" # antes GRS
}
# y elimino azurerm_management_lock.rg
```

¿Cómo seguimos para aplicarlo?
