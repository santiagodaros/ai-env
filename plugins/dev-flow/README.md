# dev-flow

Workflow de desarrollo, del repo vacío al PR: una sesión por feature con topes, camino corto para arreglos chicos, compuertas de pruebas, arquitectura y seguridad, cierre documentado y presupuesto del límite de 5 h. El estado vive en archivos y en git, no en el chat: cualquier sesión puede retomar.

```
claude plugin install dev-flow@ai-env
```

Requiere el plugin [`arch`](../arch/README.md), que se instala solo como dependencia: el diseño y su aprobación viven ahí, y este plugin verifica esa misma arquitectura al cerrar una feature o un arreglo.

## Cuándo usar qué

| Situación | Skill |
|---|---|
| Repo nuevo o recién clonado | `/dev-flow:project-init` |
| Programa, página o automatización nueva | `/arch:arch-first` |
| Feature | `/dev-flow:feature-run` (de corrido) o `/dev-flow:feature-flow` (paso a paso) |
| Arreglo puntual | `/dev-flow:quick-fix` |
| Algo no se comporta como esperás | `/dev-flow:doctor` |

No hace falta recordar la etapa: al abrir una sesión en la rama o worktree de una feature, el hook `rehydrate` inyecta el contexto, dice en qué etapa está y cuál es el paso siguiente.

## Skills

Todas las skills son manuales. Orden típico: `project-init` → `arch:arch-first` → `feature-flow` o `feature-run` → `feature-close` → `pr-prep`. Para un arreglo puntual, `quick-fix`.

| Skill | Activación | Qué hace |
|---|---|---|
| `project-init` | manual | Repo nuevo o clonado: detecta stack y scripts reales, completa `CLAUDE.md`, `docs/STATE.md` y `.gitignore` sin pisar nada, con `--settings` deja declarados el marketplace y los plugins en `.claude/settings.json` (cargan solos para quien clone el repo), con `--ci` agrega los workflows, y encadena `arch-first` |
| `feature-flow` | manual | Parte un trabajo grande en hasta 3 features, crea `docs/features/<slug>/` con `SPEC.md`, `STATE.md` y `HANDOFF.md`, y te da el comando para retomarla en una sesión nueva. Abrir sesiones en segundo plano es opcional y tiene límites duros (ver abajo) |
| `feature-run` | manual | Orquesta una feature de punta a punta: presupuesto, SPEC aprobado, implementación, pruebas, cierre con documentos y `PR.md`. `stage.cjs` dice en qué etapa está mirando archivos y git, así que se puede reanudar. Paradas: SPEC sin aprobar, sin presupuesto, tests rojos tras 2 intentos, push o PR sin tu sí |
| `spec-interview` | manual | Te entrevista para definir una feature grande y escribe un `SPEC.md` autocontenido antes de implementar |
| `budget-plan` | manual | Dice cuánto queda del límite de 5 h, estima cuánto necesita una feature (percentil 75 de las ya medidas) y propone ejecutar ahora, justo o dividida en rebanadas que entren en lo disponible. Mide solo: `rehydrate` inicia y `feature-close` cierra la medición |
| `security-diff` | manual | Revisión de seguridad solo del diff: reglas deterministas sobre las líneas agregadas (secretos, TLS desactivado, ejecución dinámica, inyección, XSS, CORS abierto, permisos amplios, GUIDs, dependencias nuevas). Alta bloquea el cierre; un riesgo aceptado lo declara el usuario en el STATE |
| `feature-close` | manual | Cierra una feature en una corrida: corre typecheck, lint y test y una compuerta de pruebas (rechaza código cambiado sin ningún archivo de prueba, salvo `Sin pruebas: <motivo>` declarado en el STATE); escribe la entrada de `docs/CHANGELOG.md` y el diseño final de punta a punta en `docs/design/<slug>.md` desde los hechos del diff (`collect.cjs`); los valida (`verify.cjs`: secciones completas, rutas citadas que existan, sin GUIDs ni términos privados); arma `PR.md` (título y cuerpo desde lo verificado), marca el STATE como cerrado y commitea solo docs. No cierra si algo falla |
| `pr-prep` | manual | Corre las verificaciones, revisa el diff contra las invariantes del proyecto y redacta la descripción del PR |
| `quick-fix` | manual | Camino corto para arreglos chicos: un script decide con reglas fijas si el cambio califica (hasta 3 archivos y 60 líneas de código, sin tocar dependencias, infraestructura, identidad, esquema ni arquitectura) y corre las mismas compuertas de pruebas, arquitectura y seguridad. Si no califica, manda al flujo completo |
| `setup` | manual | Una vez por máquina: instala la statusline (única fuente del límite de 5 h) y activa la actualización automática. Simula antes de escribir, deja copia `.bak` y no reemplaza una statusline ajena sin `--force-statusline` |
| `doctor` | manual | Diagnóstico de solo lectura: herramientas, plugins activos, auto-update, statusline, foto de consumo, interruptores, scripts de verificación y estado de la arquitectura. Con `stats`, qué regla de qué hook bloqueó o pidió confirmación y cuántas veces |

| Hook | Evento | Qué hace |
|---|---|---|
| `session-guard` | Bash, PowerShell | Bloquea que Claude abra sesiones por su cuenta; lanzar con `feature-flow` pide confirmación humana. Que Claude no corra `approve.cjs` lo controla `arch-guard`, del plugin `arch` |
| `rehydrate` | SessionStart | Tras `/compact` reinyecta `docs/STATE.md`; al arrancar en la rama o worktree de una feature inyecta su `HANDOFF.md` y `STATE.md`, **la etapa en la que está y el paso siguiente**, e inicia la medición de consumo. El aviso de arquitectura sin aprobar lo da `arch-start`, del plugin `arch` |
| `stop-verify` | Stop | Si hubo cambios de código, corre `typecheck` y `lint` antes de dar el turno por terminado. Se apaga por repo con `{"stopVerify": false}` en `.claude/dev-flow.json` |

## Sesiones por feature sin abusar

`feature-flow` deja cada feature con su contexto en archivos, para continuarla en un chat nuevo con la relectura automática del hook `rehydrate`. Por defecto no abre ninguna sesión: te imprime `claude -w <slug> -n <slug>` para que la abras vos.

Lanzar en segundo plano (`launch.cjs --launch`) es opcional y se rechaza si:

| Condición | Tope por defecto | Techo fijo en el código |
|---|---|---|
| Sesiones en segundo plano vivas | 2 | 3 |
| Lanzamientos en 24 horas | 3 | 6 |
| Espera entre lanzamientos | 10 min | no baja de 5 min |
| Misma feature en las últimas 24 h | rechazada | rechazada |
| Documentos sin commitear o `SPEC.md` de menos de 200 caracteres | rechazada | rechazada |
| Pedido desde una sesión que ya fue lanzada por el flujo | rechazada | rechazada |
| Menos del 10 % libre del límite de 5 h, o la feature no entra según la estimación | rechazada | reserva nunca menor a 5 % |
| No se puede contar las sesiones activas | rechazada | rechazada |

Podés bajar los topes en `.claude/feature-flow.json`; no subirlos por encima del techo. Cada lanzamiento pide confirmación en pantalla. El hook `session-guard` viene en el mismo plugin: bloquea `claude --bg`, `-w` y `-p` directos, y el lanzador no sirve de salvoconducto para encadenar otro `claude` en la misma línea.

## Paradas humanas

Hay cuatro puntos donde decide una persona y ningún script lo saltea: aprobar la arquitectura (plugin `arch`, en tu terminal), aprobar el SPEC, declarar una exención (`Sin pruebas:` o `Riesgo aceptado:` en el STATE) y hacer push o abrir el PR.

## Configuración por repo

`.claude/dev-flow.json`: `{"stopVerify": false}` apaga la verificación al terminar; `{"quickFix": {"maxFiles": 2, "maxLines": 40}}` ajusta el camino corto (techo: 5 archivos, 120 líneas). `.claude/feature-flow.json` baja los topes de sesiones; `.claude/budget.json` ajusta la reserva del presupuesto.

## Límites

- `stop-verify` y las verificaciones de cierre usan `npm run typecheck|lint|test`. En repos sin `package.json` no corren (la infraestructura la verifica `cloud-ops`).
- `budget-plan` necesita la statusline de ai-env y un plan Pro o Max; sin features medidas no estima.
