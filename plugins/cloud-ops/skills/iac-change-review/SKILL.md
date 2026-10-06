---
name: iac-change-review
description: Usar siempre que alguien vaya a aplicar o desplegar infraestructura como código, o pregunte qué hacer antes de hacerlo (terraform apply, az deployment create, New-AzResourceGroupDeployment, Bicep, ARM, un pipeline que despliega), y cuando pida revisar un plan de Terraform o un what-if. Invocarla antes de responder cómo aplicar, aunque el paso previo parezca obvio. Resume qué se crea, modifica, reemplaza y destruye, y marca borrado de recursos con datos, cambios de permisos, locks, policy, exposición pública y cambios de SKU.
allowed-tools: Bash(node *skills/iac-change-review/scripts/plan-summary.cjs*)
---

# iac-change-review

Ningún cambio de infraestructura se aplica sin que una persona vea antes qué va a pasar. El resumen lo hace un script sobre el plan real; no lo deduzcas leyendo el código.

## Procedimiento

1. **Generá el plan, sin aplicar.**
   - Terraform: `terraform plan -out tfplan` y después `terraform show -json tfplan > plan.json`.
   - Bicep o ARM: `az deployment group what-if -g <rg> -f <archivo> --no-pretty-print > whatif.json` (o `sub`, `mg`, `tenant` según el alcance).
   Si el plan falla, mostrá el error y frená: no hay nada que revisar.
2. **Resumí.** `node "${CLAUDE_PLUGIN_ROOT}/skills/iac-change-review/scripts/plan-summary.cjs" plan.json` (o `whatif.json`). Mostrale al usuario la salida tal cual.
3. **Según el veredicto:**
   - `PARAR` (el script sale con 3): hay alertas altas. No apliques. Explicá cada una en una línea y esperá el visto bueno explícito de la persona, alerta por alerta si lo pide.
   - `REVISAR`: repasá los puntos con el usuario antes de aplicar.
   - `SIN ALERTAS`: mostrá los totales y pedí confirmación para aplicar.
4. **Aplicá exactamente lo revisado.** Terraform: `terraform apply tfplan` (el archivo del plan, no un `apply` nuevo). Bicep: el mismo comando del what-if con `create`. Si pasó tiempo o cambió algo, generá el plan de nuevo.
5. **Limpiá.** Borrá `plan.json`, `whatif.json` y `tfplan`: pueden contener secretos. No los commitees.

## Qué marca el script

| Severidad | Qué |
|---|---|
| Alta | Destruir o reemplazar recursos con datos (storage, bases, Key Vault, vaults de backup, discos, VMs, clusters, grupos de recursos); quitar locks o policy; asignar Owner, Contributor o User Access Administrator; habilitar acceso público; abrir un origen a cualquiera; desactivar purge protection, RBAC o HTTPS |
| Media | Cualquier otra destrucción o reemplazo; otros cambios de permisos, identidad, locks o policy; cambios de red; cambios de SKU o tamaño; recursos que what-if no pudo evaluar |

## Límites

- Es una lista de patrones, no un análisis completo: que diga `SIN ALERTAS` no significa que el cambio sea seguro. Leé igual la lista de cambios.
- El formato de what-if se interpreta según la salida documentada de `az ... what-if --no-pretty-print`. Si el resumen no coincide con lo que muestra `what-if` en pantalla, confiá en `what-if` y avisá.
- No estima costos. Para un cambio de SKU, el costo se consulta aparte.
- Sin nombres de cliente ni datos de tenant en lo que quede escrito.
