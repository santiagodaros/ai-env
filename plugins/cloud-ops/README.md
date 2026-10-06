# cloud-ops

Trabajo en Azure: afirmaciones verificadas contra la documentación oficial, inventario con Resource Graph, infraestructura como código revisada antes de aplicar y verificada al terminar, y entregables a cliente.

```
claude plugin install cloud-ops@ai-env
```

## Skills

| Skill | Activación | Qué hace |
|---|---|---|
| `iac-change-review` | auto | Antes de aplicar Terraform o desplegar Bicep/ARM: resume el plan o el what-if (crear, modificar, reemplazar, destruir) y marca borrado de recursos con datos, cambios de permisos, locks, policy, exposición pública y cambios de SKU. Con alertas altas, no se aplica sin tu visto bueno |
| `azure-claim-check` | auto | Antes de afirmar un límite, cuota, SKU, estado GA/Preview, flag de CLI o parámetro de API, lo verifica contra Microsoft Learn |
| `azure-inventory-kql` | auto | Arma consultas de inventario con Resource Graph (KQL) vía `az` CLI entre suscripciones: servidores SQL, storage, VMs, exposición pública (`queries.md`) |
| `client-deliverables` | auto | Reglas para mails formales, informes, resúmenes ejecutivos y propuestas a cliente o management |
| `deliverable-review` | auto | Checklist binaria (pasa/falla) antes de enviar un entregable |
| `context-ledger` | auto | Mantiene un `STATE` del proyecto para sobrevivir a `/compact` y `/clear`; se activa con "checkpoint", "handoff" o "retomemos" |

## Carril de infraestructura

| Momento | Qué pasa | Quién |
|---|---|---|
| Antes de aplicar | Resumen del plan de Terraform o del what-if con alertas | Skill `iac-change-review` |
| Al intentar aplicar sin plan | `terraform apply` sin plan guardado o `az deployment ... create` sin what-if piden confirmación | Hook `bash-guard` del plugin `guard` |
| Al terminar el turno | Verifica lo que cambió y no deja terminar si falla | Hook `iac-verify` |

`iac-verify` corre solo las herramientas que encuentra en la máquina; la que falta se saltea sin fallar (`/dev-flow:doctor` dice cuáles hay).

| Archivos | Verificación |
|---|---|
| `.tf`, `.tfvars` | `terraform fmt -check`; `terraform validate` solo si la carpeta ya tiene `terraform init` hecho |
| `.bicep` | `bicep build` (o `az bicep build`) |
| `.ps1`, `.psm1`, `.psd1` | Errores de sintaxis con el parser de PowerShell; reglas de severidad Error de PSScriptAnalyzer si está instalado |

Se apaga por repo con `{"iacVerify": false}` en `.claude/cloud-ops.json`, o con `AI_ENV_HOOKS_SKIP=iac-verify`.

## Servidor MCP

Declara el servidor remoto de Microsoft Learn (`https://learn.microsoft.com/api/mcp`, sin autenticación), que usa `azure-claim-check`.

## Límites

- `iac-change-review` reconoce patrones conocidos; `SIN ALERTAS` no significa que el cambio sea seguro. No estima costos.
- El resumen de what-if se probó con ejemplos armados según el formato documentado, no contra un despliegue real.
- Las skills fueron escritas para un flujo de trabajo concreto (Azure, español): adaptalas a tu contexto.

## Evals

`claude plugin eval plugins/cloud-ops --model haiku --no-publish` comprueba que cada skill se active con su pedido típico y no con uno ajeno.
