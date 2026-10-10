# AGENTS.md — mapa del repo para agentes

> Es un **mapa**, no un reglamento: leé solo lo que tu tarea necesita, cuando lo necesita.
> Lo leen el Tech Lead, los workers (implementer, auditor, sre, docs, explorer) y cualquier otra herramienta de IA.

## Antes de empezar
1. Si sos un worker: corré el chequeo del arnés en tu worktree (la ruta viene en tu prompt). En rojo, no arranques.
2. Tu contexto es tu ticket (el issue) y su expediente (`.dev-flow/tickets/<N>/index.md`). No leas el PRD completo.
3. Una tarea a la vez. Lo que aparezca de más va a otro ticket.

## Mapa

| Archivo / carpeta | Qué hay | Cuándo leerlo |
|---|---|---|
| `docs/PRD.md` | Fuente de verdad del producto (ids `[F-03]`) | Solo el Tech Lead; los workers reciben su rebanada |
| `docs/STATE.md` | Decisiones a mano + estado generado desde GitHub | Al retomar el proyecto |
| `docs/codemap.md` | Mapa del código: qué exporta y usa cada archivo | Antes de abrir archivos, para saber dónde mirar |
| `docs/conventions.md` | Estilo, nombres, errores, estructura | Antes de escribir código |
| `docs/verification.md` | Cómo se demuestra que algo funciona | Antes de entregar la tarjeta (y el auditor, siempre) |
| `docs/decisions/` | Decisiones de arquitectura (ADR) | Si tu cambio toca una decisión |
| `docs/tickets/<N>.md` | Resumen de tickets cerrados (decisiones y por qué) | Si tocás algo que hizo otro ticket |
| `.dev-flow/tickets/<N>/` | Expediente vivo del ticket (local) | Siempre, si existe para tu ticket |
| `.claude/prompts/<rol>.md` | Reglas del proyecto por rol | Lo inyecta dispatch |

## Reglas duras
- Quien implementa no audita. Quien audita no edita.
- Sin pruebas que fallen sin el cambio, no hay entrega.
- Sin secretos, nombres de cliente ni datos de tenant en el código, issues, PRs ni tarjetas.
- Si una herramienta falla dos veces, no improvises: anotalo en `progress.md` y bloqueate.
