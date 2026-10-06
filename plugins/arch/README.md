# arch

Arquitectura hexagonal antes del código. Todo programa, página o automatización nueva pasa por el mismo orden: diseño, vista previa, aprobación de una persona y recién después el código, que un hook mantiene dentro de las capas.

```
claude plugin install arch@ai-env
```

Funciona solo. Si además usás `dev-flow`, sus compuertas de cierre verifican la misma arquitectura.

## Skills

| Skill | Activación | Qué hace |
|---|---|---|
| `arch-first` | manual | Antes de escribir código de un programa, página o automatización: arquitectura hexagonal con puertos y seguridad por capa en `architecture.json` y `ARCHITECTURE.md`, vista previa (diagrama, carpetas, reglas), **aprobación humana con sello por hash** y recién después se habilita el código. El hook `arch-guard` bloquea código sin aprobar, fuera de las capas o que rompa la regla de dependencia; `arch-check.cjs` lo verifica en el CI y en las compuertas de `dev-flow` (TypeScript/JavaScript, Python y PowerShell) |
| `adr` | manual | Una página por decisión en `docs/decisions/` con índice automático; las decisiones marcadas `[ADR]` en el STATE se registran al cerrar la feature |

## Hooks

| Hook | Evento | Qué hace |
|---|---|---|
| `arch-guard` | Edit, Write, Bash | En carpetas con `architecture.json`: no deja escribir código sin arquitectura aprobada por la persona, ni fuera de las capas, ni con imports que rompan la regla de dependencia, ni sellar la aprobación por su cuenta (editando `ARCHITECTURE.md` o corriendo `approve.cjs`) |
| `arch-start` | SessionStart | Si el repo tiene una arquitectura sin aprobar, lo avisa al arrancar la sesión |

Solo actúan en carpetas que tienen `architecture.json`. En cualquier otro repo no hacen nada.

## El contrato

`architecture.json` declara las capas (`domain`, `application`, `inbound`, `outbound`, `config`), qué puede importar cada una, qué librerías están prohibidas en el núcleo, dónde se puede leer el entorno, los puertos y los controles de seguridad por capa. `docs/architecture/ARCHITECTURE.md` es la versión para personas.

La aprobación es tuya y se da fuera de Claude:

```
node "<carpeta del plugin>/skills/arch-first/scripts/approve.cjs"
```

Rechaza si quedan secciones "(completar)" o no hay puertos. Si aprueba, sella un hash de los dos archivos: cualquier cambio posterior al diseño invalida la aprobación y hay que volver a aprobar.

## En el CI de tu repo

`/dev-flow:project-init --ci` agrega un workflow que corre `arch-check.cjs` en cada push. A mano: cloná este repo en el job y corré `node .ai-env/plugins/arch/skills/arch-first/scripts/arch-check.cjs`.

## Límites

- `arch-check` y `arch-guard` analizan imports con expresiones regulares, no con un parser. En TypeScript, JavaScript y Python cubren los casos comunes; en PowerShell es mejor esfuerzo.
- Si alguien apaga el hook (`AI_ENV_HOOKS_SKIP=arch-guard`), la regla sigue en `arch-check.cjs` y en el CI, pero nada bloquea la escritura.
