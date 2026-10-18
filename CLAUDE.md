# ai-env

Marketplace de plugins para Claude Code (`plugins/<plugin>/`). Lo que se publica es cada plugin, con su versión; este archivo es para quien trabaja sobre el repo. Diseño y motivo de cada decisión: `docs/DISENO.md`.

## Cómo trabajar acá
- **Al empezar:** `git status` y `node tests/smoke-test.js`. Si algo ya está en rojo, se arregla primero.
- **Terminado** = la verificación completa (abajo) en verde y, si cambió un plugin, su versión subida. Que el código parezca bien no cuenta.
- **Alcance:** tocá lo que pide la tarea. Lo que veas mal afuera, mencionalo; no lo arregles de paso.
- **Nunca:** nombres de cliente, IDs de tenant ni secretos en archivos del repo (es público). Ejemplos con alias.

## Verificación completa (lo mismo que corre el CI)
```
node scripts/sync-shared.cjs --check     # shared/ copiado igual en cada plugin
node scripts/check-versions.cjs          # un plugin que cambió sube su versión
node scripts/check.cjs                   # estructura, ningún require fuera del plugin
node scripts/catalog.cjs --check         # el README cuenta lo que hay; tope de descripciones
node tests/smoke-test.js                 # pruebas de hooks, scripts, instaladores (Linux, Windows, macOS)
claude plugin validate --strict plugins/<plugin>
node evals/harness/run.cjs               # evals con el modelo real (cuesta cuota; antes de publicar cambios en agentes o skills)
```

## Reglas del repo
- Ningún script sale de la carpeta de su plugin. Lo compartido vive en `shared/` y se copia con `node scripts/sync-shared.cjs`.
- Hooks: Node sin dependencias ni red; los de `PreToolUse` y `UserPromptSubmit` suman ≤ 30 ms sobre `node -e 0`.
- Lo determinista va en scripts; las skills redactan y llaman a esos scripts. Una regla de seguridad no depende de que el modelo la respete.
- Skills manuales por defecto (`disable-model-invocation: true`); una automática necesita un disparador claro y su eval.
- Prueba nueva por cada comportamiento nuevo, en `tests/` (los módulos se cargan desde `tests/smoke-test.js`).
- Español rioplatense en todo lo que lee una persona.

## Publicar
Primero `git fetch --tags` (sin los tags de main, `release` cree que la versión actual no se publicó y no la sube). `node scripts/release.cjs <plugin> patch|minor|major "<qué cambió>"` sube la versión y anota `CHANGELOG.md`. Rama, CI en verde en los tres sistemas, merge a main: el workflow crea el tag `<plugin>--v<versión>`. Un plugin nuevo arranca en 1.0.0 y suma su entrada a `CHANGELOG.md`, `.claude-plugin/marketplace.json`, `shared/profiles.json` y las tablas de los instaladores (una prueba las compara).
