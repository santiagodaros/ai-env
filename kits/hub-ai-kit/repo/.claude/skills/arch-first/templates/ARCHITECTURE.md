# Arquitectura de {{name}}

Estado: borrador

Tipo: {{type}}. Lenguaje: {{lang}}. Estilo: hexagonal (puertos y adaptadores).

## Qué resuelve
(completar)

## Casos de uso (puertos de entrada)
(completar: una línea por caso de uso y qué adaptador de entrada lo dispara; reflejarlo en `ports.driving` de architecture.json)

## Sistemas externos (puertos de salida)
(completar: una línea por dependencia externa y qué adaptador de salida la implementa; reflejarlo en `ports.driven`)

## Reglas de dominio
(completar: las invariantes que no pueden romperse)

## Seguridad
(completar: amenazas relevantes para este programa y el control de cada una por capa; partir de `references/security-baseline.md`)

## Pruebas
- Dominio: unitarias puras.
- Aplicación: casos de uso con puertos falsos.
- Adaptadores: contrato e integración contra su puerto.
(completar: qué se prueba primero y cómo se verifica de punta a punta)

## Fuera de alcance
(completar)

## Decisiones
Ver `docs/decisions/` (ADR 0001: arquitectura hexagonal).
