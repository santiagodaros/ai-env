---
name: init
description: >-
  Inicializa dev-flow en un repo nuevo o recién clonado: detecta stack y scripts reales, muestra en una sola pantalla qué va a escribir, aplica solo con tu sí y contra esa misma vista previa, verifica y propone el commit en una rama. Elige entre trabajo por features y modo Tech Lead + workers, y guarda local los nombres que no pueden subirse al repo. Se invoca a mano con /dev-flow:init en la raíz del repo.
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

Cada plan va, con la herramienta Write, a un archivo temporal fuera del repo: `{"v":1,"approved":[<pasos>],"answers":{"mode":"features|tech-lead","privateTerms":[...]}}`. Pasos: `gitignore`, `private-terms`, `claude-md`, `state`, `tech-lead`, `settings`, `ci`. Vista previa: `node "$D/init.cjs" preview --plan <archivo>` (devuelve `stamp`). Aplicar: `node "$D/init.cjs" apply --plan <archivo> --expect <stamp>`. Verificar: `node "$D/init.cjs" verify`.

## Proyecto vacío

Sin manifiesto ni código, solo documentos.
1. En dos líneas: el repo está vacío; vas a dejar las bases (`.gitignore`, `CLAUDE.md`, `docs/STATE.md`) sin instalar ni generar código.
2. Plan con `summary.recommended.features`; `preview`. UNA pregunta sí/no (sí recomendado) que nombre lo que crea.
3. Con el sí: `apply` con el `stamp`, después `verify`.
4. Seguí con `/arch:arch-first` (lo que se va a construir: $ARGUMENTS): no se escribe código hasta aprobar la arquitectura. Después, **Commit**.

## Flujo rápido (repo con código)

1. Una línea con lo encontrado (`summary.found`). Después UNA llamada a AskUserQuestion con las preguntas de `summary.ask`:
   - `mode`: **Por features** (una sesión por feature, con compuertas) o **Tech Lead + workers** (PRD, tickets en GitHub y workers en worktrees). Primero va el `default`, como recomendado. Si `attention` trae `no-github-remote`, aclarale que Tech Lead necesita el repo en GitHub.
   - `share`: ¿el repo lo usa más gente? Sí agrega el paso `settings`: declara el marketplace y los plugins en `.claude/settings.json`, así cargan solos para quien lo clone. Recomendado = `default`.
   - `privateTerms`: ¿qué nombres de cliente o datos de tenant no pueden aparecer en archivos versionados? Texto libre; "ninguno" vale. Van a `.private-terms`, local e ignorado por git, y `feature-close` frena si aparecen en lo que se va a subir.
2. Plan: `approved` = `summary.recommended[<mode>]`, más `settings` si `share` es sí y `private-terms` si hay términos. `preview`; guardá el `stamp`.
3. **Una pantalla**, en palabras simples: qué se encontró, qué se va a escribir (una línea por paso del preview, no por archivo), una línea por código de `summary.attention` y cada paso `refused` con su motivo.
   - `no-test`, `no-lint`, `no-typecheck`, `unrecognized-runner`: sin eso, `stop-verify` y `feature-close` no verifican nada. Se proponen como primera feature; no se inventan.
   - `test-placeholder`: el script de pruebas es un relleno (`no test specified`, `exit 0`, `echo`): no prueba nada.
   - `no-arch`: al terminar sigue `/arch:arch-first`. `several-stacks`: web y api, una arquitectura por app.
   - `existing-claude-md`: el texto de la persona queda igual; solo se agrega al final. `existing-dev-flow`: el repo ya trabajaba como Tech Lead.
   - `settings-invalid`: `.claude/settings.json` no es JSON válido y no se toca.

   Después, UNA pregunta con tres opciones: **Aplicar lo recomendado** (Recomendado), **Revisar punto por punto**, **Cancelar**.
4. Aplicar: `apply` con el `stamp` (si vuelve `stale-preview`, preview de nuevo y preguntá de nuevo), después `verify`. Informá `notes` (respaldo) y cualquier FALLA de `verify`. Revisar: los pasos de abajo, con las respuestas ya dadas. Cancelar: decí que no se escribió nada.
5. Si `summary.next` es `arch:arch-first`, seguí con esa skill y el tipo sugerido (`found.suggestedType`). Las decisiones de stack que la persona confirme (gestor de paquetes, framework, despliegue) van con `arch:adr`. Después, **Commit**.

## Revisar punto por punto

Un paso por mensaje, cada uno con una pregunta como mucho.
1. **Stack y huecos.** Lenguajes, gestor, scripts reales y lo que falta (`attention`).
2. **Modo.** Features o Tech Lead. Con Tech Lead, los archivos del paso `tech-lead` (del preview) y que el merge siempre lo decide una persona.
3. **CLAUDE.md** (`claude-md`). El bloque de comandos solo con los scripts que existen.
4. **.gitignore** (`gitignore`) y **términos privados** (`private-terms`): se niega si `.private-terms` no queda ignorado, así que va con el anterior salvo que ya esté ignorado.
5. **Plugins para el equipo** (`settings`). Nunca quita ni pisa; un plugin que alguien puso en `false` se respeta. Si el archivo existía, se respalda en `~/.claude/ai-env/init-backup/` antes de reescribirlo.
6. **CI** (`ci`, opcional). Workflows de arquitectura y seguridad, y dependabot.
7. **Vista previa y sí.** Plan con los pasos aceptados, `preview`, cada `refused` con su motivo; pedí el sí y guardá el `stamp`.
8. **Aplicar y verificar.** Como en el flujo rápido.

## Commit

Mostrá `nextCommit.files` y el mensaje. Commiteá solo con un sí y, en un repo compartido, en la rama `nextCommit.branch`. `.private-terms` nunca entra (git lo ignora). Nunca push. Con Tech Lead, recordá lo que se hace una sola vez: `ticket.cjs labels` (con `gh`) y `/dev-flow:setup --worktrees`.

## Reglas

- Nunca `apply` sin una lista `approved` explícita y el sí de la persona.
- Un repo que ya tiene algo se completa: no se pisa nada existente, solo se agrega lo que falta.
- Sin nombres de cliente ni datos de tenant en archivos versionados. Los términos de `.private-terms` no se repiten en el chat: alcanza con decir cuántos son.
