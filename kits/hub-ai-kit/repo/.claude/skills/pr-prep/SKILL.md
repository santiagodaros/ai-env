---
name: pr-prep
description: >-
  Prepara un pull request: corre las verificaciones, revisa el diff contra las invariantes del proyecto y redacta la descripción. Solo se invoca a mano con /pr-prep.
disable-model-invocation: true
argument-hint: "[rama base, por defecto main]"
---

# pr-prep

Preparación de un PR. No hace push ni abre el PR salvo que el usuario lo pida después.

## Pasos

1. `git status` y `git diff <base>...HEAD --stat` (base: `$ARGUMENTS` o `main`). Resumir qué cambió en 3 líneas.
2. Verificaciones: `npm run typecheck --if-present`, `npm run lint --if-present`, `npm test --if-present`. Informar PASA/FALLA con el error relevante; no seguir si algo falla sin avisar.
3. Si el diff toca autenticación, permisos, secretos, Graph, Partner Center o Cost Management: aplicar la skill `app-architecture-review` (o el subagente `reviewer` si el cambio es de identidad o permisos).
4. Higiene: buscar en el diff nombres de cliente, IDs de tenant o suscripción (GUIDs literales) y credenciales. Si hay, listarlos y pedir decisión; no los reproduzcas en la descripción.
5. Redactar la descripción del PR: Qué cambia, Por qué, Cómo se verificó (con la salida real de los comandos), Riesgos, Fuera de alcance. Sin nombres de cliente.
6. Entregar la descripción como texto. No ejecutar `git push` ni `gh pr create` sin pedido explícito.
