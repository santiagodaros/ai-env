# guard

Hooks de protección para cualquier repo. No trae skills ni necesita configuración: se instala y actúa. No consume contexto.

```
claude plugin install guard@ai-env
```

## Qué protege

| Hook | Evento | Qué hace |
|---|---|---|
| `protect-files` | Edit, Write | Bloquea escrituras en `.git/`, lockfiles y `.env` (salvo `.env.example`), y contenido con apariencia de secreto (claves de Storage, client secrets, claves privadas, JWT). Pide confirmación para tocar `.claude/settings.json` |
| `secret-read` | Read | Bloquea leer `.env`, `secrets/`, claves y certificados privados. Reemplaza las reglas `permissions.deny`, que un plugin no puede distribuir |
| `bash-guard` | Bash, PowerShell | Bloquea leer `.env` por consola, el borrado recursivo de la raíz, el home o una unidad, y `git push --force` a main. Pide confirmación para borrar recursos de Azure (`az ... delete`, `Remove-Az*`), cambios de permisos o credenciales, `terraform destroy`, `terraform apply` sin un plan guardado, desplegar ARM o Bicep sin what-if, `git reset --hard`, `--no-verify`, `kubectl delete`, y descargar y ejecutar scripts |

Son heurísticas sobre el texto: una red de contención, no un reemplazo de permisos mínimos, locks en los recursos ni gitleaks en CI.

## Bloquea o pide confirmación

- **Bloquea** lo que casi nunca es intencional. Claude recibe el motivo y busca otro camino.
- **Pide confirmación** para lo que tiene impacto pero puede ser legítimo: aparece el motivo y decidís vos. En una sesión sin persona delante (`claude -p`, segundo plano) equivale a un bloqueo.

## Interruptores

Variables de entorno del proceso de Claude Code (no de los comandos que corre Claude):

| Variable | Efecto |
|---|---|
| `AI_ENV_HOOKS=off` | Apaga todos los hooks de ai-env |
| `AI_ENV_HOOKS_SKIP=bash-guard,stop-verify` | Apaga los hooks nombrados |
| `AI_ENV_GUARD_STRICT=1` | Lo que pide confirmación pasa a bloquearse |

| `AI_ENV_LOG=off` | No registra las decisiones de los hooks |

## Registro de uso

Cada bloqueo o pedido de confirmación deja una línea en `~/.claude/ai-env/usage.jsonl` con la fecha, el hook, la decisión y el identificador de la regla. No guarda el comando, la ruta ni el contenido. Sirve para saber qué reglas ayudan y cuáles interrumpen de más: `/dev-flow:doctor stats`.

## Límites

Son patrones sobre el texto del comando o del archivo. Un comando ofuscado puede pasar. No reemplazan permisos mínimos, locks en los recursos ni el escaneo de secretos en CI.
