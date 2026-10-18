---
name: init
description: >-
  Inicializa dev-flow en un repo nuevo o recién clonado: detecta stack y scripts reales, muestra en una sola pantalla qué va a escribir, aplica solo con tu sí y contra esa misma vista previa, verifica y propone el commit en una rama. Elige entre trabajo por features y modo Tech Lead + workers, fija el perfil de plugins del repo (core, app, cloud, frontend o full) y guarda local los nombres que no pueden subirse. Se invoca a mano con /dev-flow:init en la raíz del repo.
disable-model-invocation: true
argument-hint: "[qué se va a construir, opcional]"
allowed-tools: Bash(node *skills/init/scripts/init.cjs*)
---

# init

Proyecto: $ARGUMENTS

Todo lo que se escribe lo escribe `init.cjs`, y solo los pasos que la persona aprobó. Vos no editás esos archivos a mano, no commiteás sin un sí y nunca hacés push.

## Cómo hablar

- **En palabras simples** primero (título "En pocas palabras"): qué encontraste y qué vas a hacer, de 1 a 3 líneas, sin nombres internos. El **detalle técnico** (ids de paso, rutas, comandos) solo si lo pide o algo falla.
- **Respuestas cerradas con AskUserQuestion**: la opción recomendada primero, marcada "(Recomendado)", hasta 4 preguntas por llamada. Sin esa herramienta, la misma pregunta en texto con las mismas opciones. Texto libre solo donde no hay opciones.
- Cada número, ruta y comando sale del JSON del script, nunca de un conteo a mano.
- Si el script falla o un paso vuelve `refused`: mostrá `reason` y la `Alternativa:` de stderr, y frená.
- **Sí explícito.** Nada se escribe sin un sí de la persona en su turno. Elegir una opción en el selector vale como sí solo para el plan exacto que mostraste (el `preview` recién corrido); si el plan cambia, mostralo y preguntá de nuevo.

## Arranque

`D="${CLAUDE_PLUGIN_ROOT}/skills/init/scripts"`. Corré `node "$D/init.cjs" detect`. Con `blank: true` → **Proyecto vacío**; si no → **Flujo rápido**.

Cada plan va, con la herramienta Write, a un archivo temporal fuera del repo: `{"v":1,"approved":[<pasos>],"answers":{"mode":"features|tech-lead","profile":"<perfil>","share":true|false,"privateTerms":[...]}}`. Pasos: `gitignore`, `gitattributes`, `editorconfig`, `private-terms`, `claude-md`, `state`, `hygiene-plan`, `tech-lead`, `settings`, `ci`, `git-hook`. Vista previa: `node "$D/init.cjs" preview --plan <archivo>` (devuelve `stamp`). Aplicar: `node "$D/init.cjs" apply --plan <archivo> --expect <stamp>`. Verificar: `node "$D/init.cjs" verify`.

## Proyecto vacío

Sin manifiesto ni código, solo documentos.
1. En dos líneas: el repo está vacío; vas a dejar las bases (`.gitignore`, `CLAUDE.md`, `docs/STATE.md`) sin instalar ni generar código. El perfil de plugins se fija cuando haya código (volvé a correr `/dev-flow:init`).
2. Plan con `summary.recommended.features`; `preview`. UNA pregunta sí/no (sí recomendado) que nombre lo que crea.
3. Con el sí: `apply` con el `stamp`, después `verify`.
4. Seguí con `/arch:arch-first` (lo que se va a construir: $ARGUMENTS): no se escribe código hasta aprobar la arquitectura. Después, **Commit**.

## Flujo rápido (repo con código)

1. Una línea con lo encontrado (`summary.found`). Después UNA llamada a AskUserQuestion con las preguntas de `summary.ask`:
   - `mode`: **Por features** (una sesión por feature, con compuertas) o **Tech Lead + workers** (PRD, tickets en GitHub y workers en worktrees). Primero va el `default`, como recomendado. Si `attention` trae `no-github-remote`, aclarale que Tech Lead necesita el repo en GitHub.
   - `profile`: qué plugins se activan en este repo. Opciones de `options`, el `default` primero como recomendado y con su `reason` en una línea ("sugerido por: …"); en cada opción, para qué es (`core`: backend y librerías; `app`: APIs y backends con autenticación o APIs de Microsoft; `cloud`: Terraform, Bicep y Azure; `frontend`: UI, React y accesibilidad; `full`: todo). Lo que no está en el perfil se apaga solo en este repo: menos skills que se disparan fuera de lugar.
   - `share`: ¿el repo lo usa más gente? Sí → el perfil va a `.claude/settings.json` (versionado; carga solo para quien clone). No → a `.claude/settings.local.json` (ignorado por git; solo tu máquina). Recomendado = `default`.
   - `privateTerms`: ¿qué nombres de cliente o datos de tenant no pueden aparecer en archivos versionados? Texto libre; "ninguno" vale. Van a `.private-terms`, local e ignorado por git, y `feature-close` frena si aparecen en lo que se va a subir.
2. Plan: `approved` = `summary.recommended[<mode>]` (ya trae `settings`), más `private-terms` si hay términos; `answers` con `mode`, `profile`, `share` y `privateTerms`. `preview`; guardá el `stamp`.
3. **Una pantalla**, en palabras simples: qué se encontró, qué se va a escribir (una línea por paso del preview, no por archivo), una línea por código de `summary.attention` y cada paso `refused` con su motivo.
   - `no-test`, `no-lint`, `no-typecheck`, `unrecognized-runner`: sin eso, `stop-verify` y `feature-close` no verifican nada. Se proponen como primera feature; no se inventan.
   - `test-placeholder`: el script de pruebas es un relleno (`no test specified`, `exit 0`, `echo`): no prueba nada.
   - `no-arch`: al terminar sigue `/arch:arch-first`. `several-stacks`: web y api, una arquitectura por app.
   - `existing-claude-md`: el texto de la persona queda igual; solo se agrega al final. `existing-dev-flow`: el repo ya trabajaba como Tech Lead.
   - `legacy-estado`: el estado vive en `docs/ESTADO.md` (nombre anterior); sigue funcionando. Para unificar en `docs/STATE.md`: `git mv docs/ESTADO.md docs/STATE.md`.
   - Un paso con `conflicts` (por ejemplo, un plugin que alguien ya puso en `false`): se respeta; decilo en una línea.
   - **Faltan para el arnés** (`summary.harnessGaps`, códigos `no-test`, `no-lint`, `no-typecheck`, `no-build`, `test-watch`): una línea por cada uno, con qué deja de verificarse. El paso `hygiene-plan` los anota en `docs/STATE.md` como primera feature, en su propia rama. No generes scripts, configs ni dependencias: es decisión de la persona.
   - `test-watch`: el script de pruebas entra en modo watch; ai-env lo corre igual con `CI=1`, pero un worker o la persona pueden quedar esperando.
   - `mixed-eol`: hay archivos commiteados con CRLF (`summary.crlfFiles`). `.gitattributes` no los toca; normalizarlos (`git add --renormalize .`) es un commit aparte y lo decide la persona. Nunca lo hagas por tu cuenta.
   - `dirty-other`: hay cambios sin commitear (`summary.dirty`) en archivos que init no toca; quedan afuera del commit. Si `preview` vuelve `dirty-target`, init iba a tocar un archivo con cambios pendientes: pedí commitearlos o guardarlos (`git stash`) antes.
   - `git-hook-other`: el repo ya usa otro gestor de git hooks (husky, pre-commit, lefthook o `core.hooksPath`): el paso `git-hook` no se ofrece.
   - `no-commits`: el repo no tiene commits todavía; no se chequea el árbol sucio.
   - `settings-invalid`: `.claude/settings.json` no es JSON válido y no se toca.

   Después, UNA pregunta con tres opciones: **Aplicar lo recomendado** (Recomendado), **Revisar punto por punto**, **Cancelar**.
   **Verificar:** lo que mostraste sale del `preview` recién corrido (mismo `stamp`); si cambiaste el plan, preview de nuevo.
4. Aplicar: `apply` con el `stamp` (si vuelve `stale-preview`, preview de nuevo y preguntá de nuevo), después `verify`. Si vuelve `rolled-back`, algo falló a mitad y se revirtió todo: decilo y mostrá el motivo; exit 3 (`partial`) significa que ni el rollback pudo y hay que mirar `git status`. Informá `notes` (respaldo) y cualquier FALLA de `verify`.
   **Verificar:** `verify` sin FALLA antes de proponer el commit. Revisar: los pasos de abajo, con las respuestas ya dadas. Cancelar: decí que no se escribió nada.
5. Si `summary.next` es `arch:arch-first`, seguí con esa skill y el tipo sugerido (`found.suggestedType`). Las decisiones de stack que la persona confirme (gestor de paquetes, framework, despliegue) van con `arch:adr`. Después, **Commit**.

## Revisar punto por punto

Un paso por mensaje, cada uno con una pregunta como mucho.
1. **Stack y huecos.** Lenguajes, gestor, scripts reales y lo que falta (`attention`).
2. **Modo.** Features o Tech Lead. Los dos usan `docs/STATE.md` (con Tech Lead, además, el bloque que `estado.cjs` genera desde GitHub). Con Tech Lead, los archivos del paso `tech-lead` (del preview) y que el merge siempre lo decide una persona.
3. **CLAUDE.md** (`claude-md`). El bloque de comandos solo con los scripts que existen.
4. **.gitignore** (`gitignore`) y **términos privados** (`private-terms`): se niega si `.private-terms` no queda ignorado, así que va con el anterior salvo que ya esté ignorado.
5. **Perfil de plugins** (`settings`). Activa los del perfil y apaga los demás en este repo, en `.claude/settings.json` (compartido) o `.claude/settings.local.json` (solo tu máquina, requiere que esté ignorado). Nunca pisa una clave que ya existe: la informa en `conflicts`. Si el archivo existía, se respalda en `~/.claude/ai-env/init-backup/` antes de reescribirlo.
6. **CI** (`ci`, opcional). Workflows de arquitectura y seguridad, y dependabot.
7. **Fines de línea y editor** (`gitattributes`, `editorconfig`): solo si no existen. `* text=auto` (LF en el repo, el nativo al trabajar), `.sh` en LF y `.cmd`/`.bat` en CRLF; `.editorconfig` con utf-8, línea final y la indentación que ya usa el repo.
8. **Pre-commit nativo** (`git-hook`, opcional): secscan sobre el índice (frena severidad alta) y arch-check si hay `architecture.json`, también para commits fuera de Claude Code. La copia vive en `~/.claude/ai-env/git-hooks/` (`/dev-flow:setup --apply` la actualiza). Es una red de seguridad: `--no-verify` lo saltea; lo obligatorio es el CI.
9. **Vista previa y sí.** Plan con los pasos aceptados, `preview`, cada `refused` con su motivo; pedí el sí y guardá el `stamp`.
10. **Aplicar y verificar.** Como en el flujo rápido.

## Commit

Mostrá `nextCommit.files` y el mensaje. Commiteá solo con un sí y, en un repo compartido, en la rama `nextCommit.branch`, con `nextCommit.command` (commitea solo esos archivos: otros cambios en curso quedan afuera). `.private-terms` nunca entra (git lo ignora). Nunca push. Con Tech Lead, recordá lo que se hace una sola vez: `ticket.cjs labels` (con `gh`) y `/dev-flow:setup --worktrees`.

## Reglas

- Nunca `apply` sin una lista `approved` explícita y el sí de la persona.
- Un repo que ya tiene algo se completa: no se pisa nada existente, solo se agrega lo que falta.
- Sin nombres de cliente ni datos de tenant en archivos versionados. Los términos de `.private-terms` no se repiten en el chat: alcanza con decir cuántos son.
