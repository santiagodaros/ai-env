# Prueba real del kit (Windows / PowerShell)

Objetivo: confirmar con la CLI real lo que el smoke test solo cubre con un `claude` simulado.
Se corre sobre un repo **descartable**, nunca sobre un repo de trabajo.
Marcá cada paso. Si uno falla, anotá el mensaje exacto y seguí con el siguiente: son independientes salvo donde se indica.

## 0. Preparación

```powershell
git clone https://github.com/santiagodaros/ai-env $HOME\ai-env
cd $HOME\ai-env
git config core.hooksPath .githooks
node scripts/check.cjs            # esperado: OK, sin hallazgos
node kits/hub-ai-kit/smoke-test.js  # esperado: 0 fallas (los avisos son normales)

New-Item -ItemType Directory $HOME\kit-test | Out-Null
cd $HOME\kit-test
git init -b main
git commit --allow-empty -m "init"
```

- [ ] check.cjs OK
- [ ] smoke-test sin fallas en tu Windows
- [ ] repo descartable creado

## 1. `.private-terms` (una sola vez, nunca se commitea)

```powershell
cd $HOME\ai-env
notepad .private-terms     # un término por línea (nombres de clientes, dominios internos)
git status --short         # esperado: .private-terms NO aparece (está en .gitignore)
node scripts/check.cjs     # esperado: OK
"cliente-de-prueba" | Add-Content .private-terms
Set-Content $env:TEMP\t.md "mencion cliente-de-prueba"
Copy-Item $env:TEMP\t.md .\docs\t.md; node scripts/check.cjs   # esperado: FALLA nombrando docs/t.md
Remove-Item .\docs\t.md
```

- [ ] `.private-terms` ignorado por git
- [ ] el chequeo detecta un término de prueba
- [ ] borré el archivo de prueba y la línea de prueba

## 2. Instalación del kit

```powershell
cd $HOME\ai-env\kits\hub-ai-kit
node install.js --repo "$HOME\kit-test" --dry-run   # revisá la salida
node install.js --repo "$HOME\kit-test"
```

Esperado: imprime líneas `[MANUAL]` para `~/.claude/settings.json` (statusline) y, si ya tenés CLAUDE.md, para ese archivo.

- [ ] dry-run coherente
- [ ] instalación sin errores
- [ ] pegué el bloque `statusLine` en `~/.claude/settings.json` (cambiando `TU_USUARIO`)

## 3. Statusline y presupuesto

```powershell
cd $HOME\kit-test
claude          # mandá cualquier mensaje y esperá la respuesta
```

Esperado en la barra: `[modelo] | ctx % | 5h N% (reinicia en…) | 7d N% | $costo`.
En otra terminal:

```powershell
Get-Content $HOME\.claude\.budget\latest.json
node .claude\skills\budget-plan\scripts\budget.cjs status
```

Esperado: JSON con `fiveHour.pct`; `status` muestra tu % disponible.
Si `fiveHour` falta: solo existe en planes Pro/Max y recién después de la primera respuesta.

- [ ] la barra muestra el 5h
- [ ] existe `latest.json`
- [ ] `budget.cjs status` lo lee

## 4. Hooks con la CLI real (dentro de `claude` en kit-test)

| # | Pedile a Claude | Esperado |
|---|---|---|
| 4.1 | "Creá `src/domain/x.ts` con una función cualquiera" | **Bloqueado** por arch-guard: no hay arquitectura aprobada |
| 4.2 | "Leé el archivo `.env`" (creá uno vacío antes) | **Denegado** por permisos |
| 4.3 | "Editá `.claude/settings.json`" | **Bloqueado** por protect-files |
| 4.4 | "Ejecutá `claude --bg -n x`" | **Bloqueado** por session-guard |

- [ ] 4.1  - [ ] 4.2  - [ ] 4.3  - [ ] 4.4

Si alguno NO bloquea, es el hallazgo más importante de la prueba: anotá qué hook y qué mensaje (o falta de mensaje) viste.

## 5. arch-first de punta a punta

Dentro de `claude`: `/arch-first` y pedir "una CLI de automatización en TypeScript llamada demo".
Esperado: crea el esqueleto y el preview **sin código**.

```powershell
node .claude\skills\arch-first\scripts\arch-check.cjs   # esperado: sin violaciones
start preview.html                                       # revisá capas y puertos
```

Aprobación (**la corrés vos, en tu terminal, no dentro de Claude**):

```powershell
node .claude\skills\arch-first\scripts\approve.cjs
```

Esperado: rechaza si quedan "(completar)" o cero puertos; si el diseño está completo, sella el hash.
Después, pedile a Claude el mismo archivo del 4.1: ahora **debe permitirlo**.
Probá la violación: pedile que importe `fs` desde `src/domain`. Esperado: bloqueo.

- [ ] esqueleto + preview sin código
- [ ] approve.cjs rechaza el diseño incompleto
- [ ] approve.cjs sella el diseño completo
- [ ] tras aprobar, escribir código se permite
- [ ] el import prohibido en domain se bloquea
- [ ] el preview se ve legible (capas, puertos, adaptadores)

## 6. Una feature real, chica

`/feature-flow` con un slug (`demo-saludo`), después en la sesión de la feature `/spec-interview`, implementar, `/feature-close`.
Verificá:

```powershell
git log --oneline
dir docs\features\demo-saludo
```

Esperado: SPEC, STATE, HANDOFF, entrada de changelog y DESIGN as-built; si falta algo, `feature-close` termina con código 3 y dice qué.

Lanzamiento de sesión (solo si querés probarlo; consume cuota):

```powershell
node .claude\skills\feature-flow\scripts\launch.cjs --slug demo-saludo           # dry: muestra qué haría
node .claude\skills\feature-flow\scripts\launch.cjs --slug demo-saludo --launch  # pide confirmación; abre sesión real
claude agents --json    # anotá el campo "kind" de la sesión lanzada
```

- [ ] los 4 documentos de la feature existen
- [ ] feature-close bloquea cuando corresponde
- [ ] `--launch` pide confirmación y respeta los topes (2 simultáneas / 3 por día / 10 min)
- [ ] valor de `kind` para sesiones en background: ______

## 7. security-diff y adr

```powershell
$k = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP'
Add-Content src\demo.ts "const k = `"$k`";"
git add -A
node .claude\skills\security-diff\scripts\secscan.cjs
```

Esperado: hallazgo alto por secreto. Quitá la línea después.

```powershell
node .claude\skills\adr\scripts\adr.cjs new "usar X en vez de Y"
node .claude\skills\adr\scripts\adr.cjs check    # esperado: avisa que el ADR está incompleto
```

- [ ] secscan detecta el secreto
- [ ] adr check detecta el ADR incompleto

## 8. Cierre

Pegame acá (o en el chat) la lista de pasos que fallaron con el mensaje exacto. Con eso corrijo el kit.
Limpieza: `Remove-Item -Recurse -Force $HOME\kit-test`.
