#!/usr/bin/env node
// PreToolUse (Bash|PowerShell): frena comandos destructivos o con impacto.
//  - Bloquea lo que casi nunca es intencional (borrado recursivo de la raíz o del home, force-push a main, leer .env).
//  - Pide confirmación para lo que tiene impacto pero puede ser legítimo (borrar recursos de Azure, terraform destroy,
//    git reset --hard, cambios de permisos, compras). Con AI_ENV_GUARD_STRICT=1 eso también se bloquea.
// Es una heurística sobre el texto del comando: no reemplaza permisos mínimos ni locks en los recursos.
const { run, block, ask } = require('./lib.cjs');

run('bash-guard', (input) => {
  const cmd = String((input.tool_input || {}).command || '');
  if (!cmd.trim()) return;
  const c = cmd.replace(/\s+/g, ' ');

  // --- Bloqueo
  const ENV = /(^|[\s"'=/\\])\.env(\.(?!example|sample|template)[\w.-]+)?(["']|\s|$|[;&|)])/;
  if (/(^|[\s;&|(])(cat|type|more|less|head|tail|bat|strings|base64|xxd|Get-Content|gc)\s/i.test(c) && ENV.test(c)) block('no leas archivos .env por consola; pueden contener secretos. Usá .env.example o pedile los nombres al usuario.', 'env-read');

  const RM = /(^|[\s;&|(])rm\s+(?:-[a-zA-Z]*\s+)*-(?=[a-zA-Z]*[rR])(?=[a-zA-Z]*f)[a-zA-Z]+(?:\s+-[a-zA-Z-]+)*\s+(?:--\s+)?["']?(\/|~|\$HOME|\$\{HOME\}|\/\*|~\/\*?|\.\.?\/?|\*)["']?(\s|$|[;&|)])/;
  const RM2 = /(^|[\s;&|(])rm\s+(?:-[a-zA-Z]*f[a-zA-Z]*\s+-[a-zA-Z]*[rR][a-zA-Z]*|-[a-zA-Z]*[rR][a-zA-Z]*\s+-[a-zA-Z]*f[a-zA-Z]*|--recursive\s+--force|--force\s+--recursive)\s+(?:--\s+)?["']?(\/|~|\$HOME|\$\{HOME\}|\/\*|~\/\*?|\.\.?\/?|\*)["']?(\s|$|[;&|)])/;
  if (RM.test(c) || RM2.test(c)) block('borrado recursivo forzado de la raíz, el home o la carpeta actual completa. Indicá la ruta exacta de lo que querés borrar.', 'rm-root');
  if (/\b(Remove-Item|rd|rmdir|del|ri)\b/i.test(c) && /(-Recurse|\/s)\b/i.test(c) && /(\s|["'])([A-Za-z]:[\\/]?|~[\\/]?|\$HOME[\\/]?|\$env:USERPROFILE[\\/]?|[\\/])(["']|\s|$)/i.test(c)) block('borrado recursivo de una unidad o del perfil de usuario. Indicá la ruta exacta de lo que querés borrar.', 'rm-drive');

  const forcePush = /\bgit\s+(?:-\S+\s+\S+\s+)*push\b/.test(c) && /\s(--force|-f)(\s|$)/.test(c);
  if (forcePush && /(\s|:|\/)(main|master)(\s|$)/.test(c)) block('git push --force sobre main/master. Usá una rama de trabajo.', 'force-push-main');

  // --- Confirmación humana
  const A = [
    [/\bgit\s+push\b.*(--force\b|--force-with-lease|\s-f(\s|$))/, 'git push forzado: reescribe la historia remota de la rama.', 'git-force-push'],
    [/\bgit\s+(commit|push|merge)\b.*--no-verify\b/, '--no-verify saltea los hooks de git (chequeos previos al commit).', 'git-no-verify'],
    [/\bgit\s+reset\s+--hard\b/, 'git reset --hard descarta los cambios locales sin commitear.', 'git-reset-hard'],
    [/\bgit\s+clean\s+-[a-zA-Z]*f/, 'git clean -f borra archivos sin seguimiento.', 'git-clean'],
    [/\bgit\s+branch\s+-D\b/, 'git branch -D borra una rama aunque no esté mergeada.', 'git-branch-delete'],
    [/\bterraform\s+(?:-chdir=\S+\s+)?(?:destroy\b|apply\b.*-auto-approve\b|state\s+rm\b)/, 'Terraform con impacto: destroy, apply sin revisión del plan o edición del state.', 'terraform-impact'],
    [/\baz\s+(?:\S+\s+)*(delete|purge)\b/, 'comando de Azure CLI que borra recursos.', 'az-delete'],
    [/\b(Remove-Az\w+|Remove-Mg\w+|Remove-AzureAD\w+)\b/i, 'cmdlet que borra recursos u objetos del directorio.', 'az-remove-cmdlet'],
    [/\baz\s+role\s+assignment\s+(create|delete)\b|\b(New|Remove)-AzRoleAssignment\b|\baz\s+ad\s+(app|sp)\s+credential\s+reset\b|\b(New|Remove)-MgRoleManagement\w+/i, 'cambio de permisos o credenciales en Azure / Entra ID.', 'az-permissions'],
    [/\baz\s+(reservations|billing-benefits)\b.*\b(purchase|create)\b|\bNew-AzReservation\b/i, 'compra de reservas o planes de ahorro.', 'az-purchase'],
    [/\baz\s+(lock\s+delete|policy\s+assignment\s+delete)\b/, 'quita un lock o una asignación de policy.', 'az-lock-policy'],
    [/\bkubectl\s+delete\b/, 'kubectl delete.', 'kubectl-delete'],
    [/\b(curl|wget|iwr|Invoke-WebRequest|irm|Invoke-RestMethod)\b[^|]*\|\s*(sh|bash|zsh|iex|Invoke-Expression|pwsh|powershell)\b/i, 'descarga y ejecuta un script de internet sin revisarlo.', 'pipe-to-shell'],
    [/\b(npm|pnpm|yarn)\s+publish\b/, 'publica un paquete.', 'package-publish'],
    [/\bterraform\s+(?:-chdir=\S+\s+)?apply\b(?![^;&|]*(?:tfplan|\.plan\b|plan\.out|\.tfplan|\.out\b))/, 'terraform apply sin un plan guardado: generá el plan con -out, revisalo (cloud-ops:iac-change-review) y aplicá ese archivo.', 'terraform-apply-no-plan'],
    [/\baz\s+deployment\s+(group|sub|mg|tenant)\s+create\b(?![^;&|]*(--what-if|--confirm-with-what-if|-w\b|-c\b))|\bNew-Az(ResourceGroup|Subscription|ManagementGroup|Tenant)?Deployment\b(?![^;&|]*-WhatIf)/i, 'despliegue de ARM o Bicep sin what-if: corré primero el what-if y revisalo (cloud-ops:iac-change-review).', 'az-deployment-no-whatif'],
  ];
  for (const [re, why, rule] of A) if (re.test(c)) ask(`${why} Confirmá solo si lo pediste.`, rule);
});
