---
name: security-reaudit
description: Re-auditoría de seguridad de una aplicación web con backend (como Hub CSP), contra una línea base de hallazgos previos. Primero verificadores deterministas, después revisión dirigida por superficie. Escribe docs/security/.
argument-hint: "[alcance: front|backend|ci|todo]"
disable-model-invocation: true
---

# Re-auditoría de seguridad

El objetivo es un informe de **diferencias contra la auditoría anterior**: qué sigue abierto, qué se corrigió (con evidencia), qué es nuevo y qué regresó. Lo que una herramienta determinista detecta no se revisa a mano.

## Línea base
1. Leé `docs/security/FINDINGS.md`. Si no existe, copiá `references/FINDINGS-template.md` y cargá los hallazgos conocidos que el usuario recuerde, con estado "sin verificar".
2. Cada hallazgo tiene: ID estable, severidad, superficie, evidencia (archivo y línea), escenario de abuso, corrección, prueba de verificación y estado (`abierto`, `corregido-verificado`, `corregido-sin-verificar`, `regresó`, `aceptado`).

## Fase 1: verificadores deterministas (antes de pensar)
Ejecutá lo que el repo ya tenga y leé solo el resumen:
- Resultados de CI: CodeQL, gitleaks, revisión de dependencias.
- `npm audit --omit=dev` (o el gestor que use el repo).
- Búsqueda de secretos en el historial: `gitleaks detect` si está instalado; si no, decilo y seguí.
- Variables de entorno expuestas al bundle del frontend: prefijos que se publican (`VITE_`, `REACT_APP_`, `NEXT_PUBLIC_`) con valores sensibles.
- Mapas de código fuente publicados en producción, cabeceras de seguridad y CORS en la configuración.

## Fase 2: revisión dirigida
Cargá `references/surfaces.md` y revisá solo las superficies que correspondan al alcance. No leas el repo entero: seguí los puntos de entrada (rutas, middleware, clientes de API). Para cada superficie anotá `ok`, `hallazgo` o `no aplica`, con evidencia.

## Fase 3: independencia
Para hallazgos P0 y P1 nuevos o corregidos, pedí una revisión independiente al subagente `reviewer` (si existe en `.claude/agents/`) limitada a correctitud del hallazgo y de la corrección. No hagas que el mismo contexto que corrigió también apruebe.

## Reglas
- No marques `corregido-verificado` sin evidencia: el cambio en el código **y** una prueba (test, comando o consulta) que falle antes y pase después.
- Distinguí en cada afirmación lo **verificado** (lo leíste o lo ejecutaste) de lo **inferido**.
- No incluyas valores de secretos, tokens ni datos de clientes en el informe; solo ubicación y tipo.
- No cambies código de seguridad durante la auditoría salvo que el usuario lo pida: auditar y corregir son pasos separados.

## Salida
1. `docs/security/REAUDIT-AAAA-MM-DD.md`: resumen (conteo por severidad y por estado), tabla de diferencias contra la línea base, hallazgos nuevos, lo que no se pudo verificar y por qué.
2. `docs/security/FINDINGS.md` actualizado.
3. Una lista corta de correcciones ordenada por riesgo y esfuerzo.
