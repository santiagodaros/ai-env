# Prueba real en tu máquina (Windows / PowerShell)

Objetivo: confirmar en tu notebook lo que ya está verificado en Linux. Los hooks de plugin se probaron en una sesión real de Claude Code 2.1.290 en Linux (bloqueos de `guard` y `dev-flow`, relectura al arrancar, verificación al terminar). Falta Windows, donde hay reportes abiertos sobre rutas en hooks de plugin.

Se corre sobre un repo **descartable**. Marcá cada paso; si uno falla, anotá el mensaje exacto y seguí: son independientes salvo donde se indica.

## 0. Si habías instalado el kit viejo

Si alguna vez corriste `install.js`, limpiá primero (si no, los hooks corren dos veces):

```powershell
# En cada repo donde lo instalaste:
Remove-Item -Recurse -Force .claude\hooks, .claude\skills, .claude\agents, .claude\rules -ErrorAction SilentlyContinue
notepad .claude\settings.json      # borrá el bloque "hooks"

# En tu usuario:
'azure-claim-check','azure-inventory-kql','client-deliverables','context-ledger','deliverable-review' |
  ForEach-Object { Remove-Item -Recurse -Force "$HOME\.claude\skills\$_" -ErrorAction SilentlyContinue }
Remove-Item "$HOME\.claude\statusline.cjs" -ErrorAction SilentlyContinue
```

- [ ] no aplica / limpiado

## 1. Instalar

```powershell
claude --version                         # 2.1.290 o superior
irm https://raw.githubusercontent.com/santiagodaros/ai-env/main/install.ps1 | iex
```

Esperado: termina con el diagnóstico sin ninguna `FALLA`, los 5 plugins en `OK`, "actualización automática: activa" y "statusline configurada".

- [ ] el instalador termina sin errores
- [ ] existe `$HOME\.claude\settings.json.bak` si ya tenías settings
- [ ] volver a correrlo dice "Nada que cambiar" en la parte de statusline

## 2. Repo descartable

```powershell
New-Item -ItemType Directory $HOME\ai-env-test | Out-Null
cd $HOME\ai-env-test
git init -b main
git commit --allow-empty -m "init"
Set-Content .env "TOKEN=no-deberia-verse"
claude
```

Dentro de Claude Code: `/dev-flow:doctor`.

- [ ] la barra muestra `5h N% (reinicia en…)` tras la primera respuesta
- [ ] existe `$HOME\.claude\.budget\latest.json`
- [ ] `doctor` sin `FALLA`

## 3. Hooks de `guard`

| # | Pedile a Claude | Esperado |
|---|---|---|
| 3.1 | "Usá Write para crear `.env.local` con `A=1`" | **Bloqueado** por protect-files |
| 3.2 | "Leé el archivo `.env`" | **Bloqueado** por secret-read; el valor no aparece |
| 3.3 | "Ejecutá `Get-Content .env`" | **Bloqueado** por bash-guard |
| 3.4 | "Ejecutá `git reset --hard`" | **Pide confirmación** con el motivo |
| 3.5 | "Ejecutá `az group delete -n rg-inexistente-prueba --yes`" | **Pide confirmación**. Rechazala |
| 3.6 | "Creá `notas.md` con una línea" | Se permite |

- [ ] 3.1  - [ ] 3.2  - [ ] 3.3  - [ ] 3.4  - [ ] 3.5  - [ ] 3.6

Si alguno no bloquea, es el hallazgo más importante: anotá qué hook y qué viste. En 3.4 y 3.5 anotá también **cómo se ve** el pedido de confirmación; en modo no interactivo se comporta como bloqueo, en interactivo no lo pude observar.

## 4. Hooks y flujo de `dev-flow`

| # | Qué hacer | Esperado |
|---|---|---|
| 4.1 | "Ejecutá `claude -p hola`" | **Bloqueado** por session-guard |
| 4.2 | `/dev-flow:arch-first una CLI de automatización en TypeScript llamada demo` | Crea esqueleto, `architecture.json` y preview **sin código** |
| 4.3 | "Creá `src/domain/saludo.ts` con una función" | **Bloqueado** por arch-guard: arquitectura sin aprobar |
| 4.4 | "Corré approve.cjs" | **Bloqueado**: la aprobación es tuya |

Aprobación, en **tu** terminal (la ruta la muestra Claude en el paso 4.2):

```powershell
node "<ruta que te indicó>\approve.cjs"
```

Esperado: rechaza si quedan "(completar)" o cero puertos; con el diseño completo sella el hash.

| # | Qué hacer | Esperado |
|---|---|---|
| 4.5 | Repetí 4.3 | Ahora **se permite** |
| 4.6 | "En `src/domain/saludo.ts` importá `fs`" | **Bloqueado** por la regla de dependencia |
| 4.7 | `/dev-flow:project-init` y aceptá `--settings` | Crea `docs/STATE.md`, completa `.gitignore` y declara los plugins en `.claude/settings.json` |

- [ ] 4.1  - [ ] 4.2  - [ ] 4.3  - [ ] 4.4  - [ ] 4.5  - [ ] 4.6  - [ ] 4.7

## 5. Una feature chica

```
/dev-flow:feature-flow agregar un comando que salude por nombre
```

Seguí el flujo hasta `/dev-flow:feature-close`. Después:

```powershell
git log --oneline
dir docs\features
claude agents --json     # si lanzaste una sesión en segundo plano: anotá el campo "kind"
```

- [ ] al abrir una sesión en la rama de la feature, Claude ya conoce el HANDOFF sin que se lo pegues
- [ ] `feature-close` frena si falta una prueba y cierra cuando está todo
- [ ] quedan SPEC, STATE, HANDOFF, entrada de changelog, diseño y `PR.md`
- [ ] valor de `kind` para sesiones en segundo plano: ______

## 6. Skills que se activan solas

Sin nombrar la skill:

| # | Pedido | Skill esperada |
|---|---|---|
| 6.1 | "¿Cuántas reglas admite como máximo un NSG? Va a un informe." | `cloud-ops:azure-claim-check` (y consulta Microsoft Learn) |
| 6.2 | "Checkpoint: cerramos que el DR va a región secundaria." | `cloud-ops:context-ledger` |
| 6.3 | "Antes de mergear revisá este cambio: guardo el token en localStorage." | `app-review:app-architecture-review` |

- [ ] 6.1  - [ ] 6.2  - [ ] 6.3

`/skill-doctor` muestra qué skills se usaron y cuáles solo ocupan contexto.

## 7. Cierre

Pasame la lista de pasos que fallaron con el mensaje exacto. Limpieza:

```powershell
cd $HOME; Remove-Item -Recurse -Force $HOME\ai-env-test
```
