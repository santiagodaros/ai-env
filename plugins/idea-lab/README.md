# idea-lab

De una idea que nace chica a un plan listo para construir. Primero se modela la idea desde todos los ángulos, con el mercado relevado con fuentes y un escéptico que no la armó. Después de tu decisión, sale un plan de product engineer que desemboca en el PRD de `dev-flow` y en la arquitectura de `arch`.

```
claude plugin install idea-lab@ai-env
```

Sirve también para ideas que no son código (un servicio, una oferta, un proceso interno): el plan se usa igual aunque no termine en tickets.

## Recorrido

```
/idea-lab:shape <idea>  →  tu decisión (avanzar · pivotear · descartar)  →  /idea-lab:plan <slug>
      docs/ideas/<slug>/idea.json, IDEA.md, preview.html          plan.json, PLAN.md, docs/PRD.md
                                                                        ↓
                                              /arch:arch-first  →  /dev-flow:prd check  →  /dev-flow:dispatch o feature-run
```

## Skills

| Skill | Activación | Qué hace |
|---|---|---|
| `shape` | manual | Tres rondas de preguntas cerradas como mucho. Mercado en paralelo con subagentes `scout` (competidores, alternativas, demanda), cada dato con url y fecha. Los ángulos que suelen faltar: negocio o costo-beneficio, factibilidad, riesgos de 3 tipos, pre-mortem, métricas con umbral, supuestos con su prueba barata, criterio para abandonar. Objeciones de un `skeptic` en frío y un comunicado con preguntas, como si la idea ya existiera (working backwards). `idea.cjs check` decide si está definida (16 ángulos); `render` arma `IDEA.md` y `preview.html`, autocontenido. La decisión la toma la persona |
| `plan` | manual | Solo con la decisión "avanzar". Qué validar antes de construir (cada supuesto sin probar tiene su experimento o se acepta con motivo), no-gos y agujeros evitados, rebanadas verticales con criterios y tamaño (T a L, como `dispatch`), hitos que entregan algo usable, instrumentación de la métrica estrella, salida a producción con vuelta atrás. `plan.cjs check` lo valida (ids, dependencias sin ciclos, cada rebanada en un hito); `render` escribe `PLAN.md` y el PRD en el formato de `/dev-flow:prd`, sin pisar uno existente |

## Subagentes

| Agente | Modelo | Qué hace |
|---|---|---|
| `scout` | sonnet | Un frente de mercado con fuentes; escribe en `docs/ideas/<slug>/research/` y devuelve solo la ruta. Sin Bash ni edición |
| `skeptic` | opus | Objeciones con severidad y evidencia sobre la idea o el plan. Sin permiso de escritura: quien armó la idea no la audita |

## Reglas

- Hechos y supuestos separados: una evidencia sin fuente no cuenta como evidencia, y `check` lo marca.
- Sin herramientas web, el mercado queda `sin-datos` con el motivo. Nunca se inventan competidores ni precios.
- Sin nombres de cliente en el expediente: `check` frena si aparece un término de `.private-terms`.
- El stack no se elige acá: es una decisión de `/arch:arch-first` y `/arch:adr`.
