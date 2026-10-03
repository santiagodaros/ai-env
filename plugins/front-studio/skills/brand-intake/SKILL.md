---
name: brand-intake
description: Captura el kit de marca (paleta, tipografías, logo, voz) y lo deja en design/brand.md y design/tokens.css, con contraste WCAG calculado. Etapa 1 del rediseño.
argument-hint: "[ruta a archivos de marca o URL del sitio de la empresa]"
disable-model-invocation: true
---

# Marca

Objetivo: una única fuente de verdad de la marca, con números verificados, para que las etapas siguientes no la reinventen.

## Pasos

1. **Juntá lo que haya**, sin preguntar lo que se pueda encontrar:
   - Archivos que el usuario pase (PDF de brand book, logos, paleta).
   - Tema actual del repo: Grep de `--color`, `colors:` (Tailwind), `createTheme`, `theme.ts`, `tokens`.
   - Si hay sitio web de la empresa, WebFetch de la home pidiendo colores, familias tipográficas y tono de los textos.
   - Capturas que el usuario pegue de la UI actual.
2. **Preguntá solo lo que falte** (máximo 3): ¿hay paleta oficial?, ¿hay fuente corporativa o licenciada?, ¿qué de la UI actual NO se toca (logo, nombre, colores de estado)?
3. **Armá la paleta** como 4 a 6 colores con nombre y rol (superficie, texto, acento primario, acento secundario, y estados éxito/advertencia/error/info). Si la marca no define estados, proponelos y marcá "propuesto".
4. **Verificá el contraste con el script**, no de memoria:
   `node <base-de-esta-skill>/scripts/contrast.cjs "#FFFFFF:#1A1A1A" "#0B5FFF:#FFFFFF"`
   Cada par es `fondo:texto`. Imprime la razón y si pasa AA (4,5 para texto normal, 3 para texto grande y componentes de UI). Corregí lo que no pase y anotá el cambio.
5. **Tipografía**: familia, roles (títulos, cuerpo, datos numéricos), pesos, fallback del sistema, y de dónde se obtiene (licencia o Google Fonts). Para datos tabulares exigí cifras tabulares.
6. **Escribí `design/brand.md`** con: personalidad (3 adjetivos y 3 anti-adjetivos), paleta con ratios, tipografía, reglas de logo, voz y tono (ejemplos de botón, error, vacío), y "no tocar".
7. **Escribí `design/tokens.css`** con variables `:root` (`--color-*`, `--font-*`, `--space-*`, `--radius-*`, `--dur-*`, `--ease-*`) y las mismas redefinidas para tema oscuro solo si la marca lo pide.

## Compuerta
Mostrá paleta (con ratios) y tipografías en una tabla corta y pedí confirmación. Registrala en `design/STATE.md`.

## Si no hay kit de marca
Proponé una paleta partiendo de UN color ancla que el usuario elija o que salga del sitio de la empresa. No uses los acentos por defecto que hoy delatan una UI generada (ver `design-direction/references/ai-tells.md`).
