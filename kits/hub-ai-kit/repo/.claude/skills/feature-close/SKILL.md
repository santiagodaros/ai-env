---
name: feature-close
description: >-
  Cierra una feature en una sola corrida: verifica typecheck/lint/test, escribe el historial de cambios (docs/CHANGELOG.md) y el diseño tal como quedó de punta a punta (docs/design/<slug>.md), los valida contra el código, marca el STATE como cerrado y commitea solo los docs. Solo se invoca a mano con /feature-close, opcionalmente con el slug.
disable-model-invocation: true
argument-hint: "[slug de la feature, opcional]"
---

# feature-close

Feature a cerrar: $ARGUMENTS (si está vacío, se infiere de la rama o worktree)

Dos documentos distintos, con propósitos distintos:
- **`docs/CHANGELOG.md`**: historial. Qué cambió, por qué, qué requiere acción. Una entrada por feature.
- **`docs/design/<slug>.md`**: el diseño después del cambio, de punta a punta. No es el plan (eso es el `SPEC.md`).

## Una corrida

Pedí una sola confirmación al inicio: "Voy a verificar, escribir los dos documentos y commitear solo docs. ¿Seguimos?". Con el sí, hacé todo sin más preguntas.

1. **Hechos y compuertas.** `node <base>/scripts/collect.cjs --run` (ruta base: la que muestra "Base directory for this skill"; agregá `--slug <slug>` si hace falta). Imprime commits, archivos cambiados, secciones y fuera de alcance del SPEC, decisiones del STATE y el resultado de typecheck, lint y test.
   - Exit 3 = falla una verificación (typecheck, lint, test) **o la compuerta de pruebas** (la feature cambia código y no toca ningún archivo de prueba): **no escribas los documentos**. Mostrá la falla y frená; una feature con pruebas rojas o sin pruebas no se cierra. La única salida sin agregar pruebas es que el usuario declare en el `STATE.md` una línea `Sin pruebas: <motivo>`; si lo hace, queda registrado y va al `CHANGELOG` y al PR.
   - También frena (exit 3) si falla la arquitectura hexagonal (`arch-check`), si hay hallazgos de seguridad de severidad alta sin aceptar (`security-diff`) o si hay ADR incompletos. Los de severidad media quedan en los FACTS: revisalos con la skill `security-diff` antes de escribir.
   - Rechaza si hay cambios sin commitear fuera de `docs/`.
2. **Historial.** Agregá la entrada a `docs/CHANGELOG.md` (créalo con un título y `## Sin publicar` si no existe) usando `templates/CHANGELOG-entry.md`, en la sección de arriba. Cada línea sale de los FACTS: ningún cambio que no figure en los commits o el diff. El "por qué" sale de las decisiones del STATE.
3. **Diseño.** Escribí `docs/design/<slug>.md` con `templates/DESIGN.md`. Leé el código real de los archivos cambiados antes de describir el flujo; no te guíes por los mensajes de commit. Compará con el `SPEC.md`: en "Diferencias contra el SPEC" va todo lo que se hizo distinto o quedó afuera.
4. **No inventes.** Lo que no puedas comprobar contra el código o las pruebas va en la sección "Sin verificar", no en el texto como si fuera cierto. Sin nombres de cliente ni datos de tenant.
4b. **ADR.** Cada decisión del `STATE.md` marcada con `[ADR]` (aparece en los FACTS) se registra con la skill `adr` antes de cerrar.
5. **Cerrar el estado.** En `docs/features/<slug>/STATE.md` cambiá la línea `Estado:` a `Estado: cerrada (AAAA-MM-DD)`.
6. **Validar.** `node <base>/scripts/verify.cjs`. Si falla, corregí lo que marca (rutas citadas que no existen, secciones vacías, datos privados) y repetí. No commitees hasta que dé OK.
7. **Descripción del PR.** `node <base>/scripts/pr-body.cjs`: arma `docs/features/<slug>/PR.md` (título y cuerpo) con lo ya verificado, sin reescribir nada a mano.
8. **Commit de docs.** `git add docs/CHANGELOG.md docs/design/<slug>.md docs/features/<slug>` y commit solo de esos archivos.
9. **Cierre.** Decile al usuario qué quedó escrito. Abrir el PR requiere su sí explícito (ver `pr-prep`). Si había sesión en segundo plano, que la cierre con `claude agents`.

## Reglas

- No cambies código de la feature en esta skill: solo documentos.
- No cierres si falló alguna verificación o si `verify.cjs` no da OK.
- Los números (cantidad de archivos, commits) salen de `collect.cjs`, no de memoria.
