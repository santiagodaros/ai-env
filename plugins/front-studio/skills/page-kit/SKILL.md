---
name: page-kit
description: Kit de diseño de una página (tokens CSS/JSON/Tailwind, color OKLCH con AA verificado, tipografía, espaciado, movimiento, hoja de muestra) heredando la marca global.
argument-hint: "<slug-de-la-página> [--accent #RRGGBB]"
disable-model-invocation: true
---

# Kit de página

Un brand kit acotado a una página: misma marca, ajustada al trabajo de esa página (una landing y un panel de operación no comparten densidad ni escala). Todo sale de un script determinista; los números no se estiman.

## Pasos
1. **Entradas**: `design/tokens.css` (marca global, opcional) y `design/style.json` (perillas, de `style-quiz`). Si falta `style.json`, preguntá si correr el quiz o usar el preset de la superficie de la página.
2. **Generá**:
   `node "${CLAUDE_PLUGIN_ROOT}/skills/page-kit/scripts/page-kit.cjs" --page <slug>`
   Opciones: `--style <archivo>` (otra página), `--brand <archivo>`, `--accent #RRGGBB` (probar otro ancla sin tocar la marca), `--no-brand`.
   Escribe en `design/pages/<slug>/`: `tokens.css`, `tokens.json`, `tailwind.css`, `specimen.html` y `kit.md`.
3. **Leé la salida**: qué heredó de la marca, qué ajustó (por ejemplo, un acento que no daba 4,5:1 con texto blanco y se oscureció para el botón) y si algún par de contraste falla. Si falla alguno (sale con 1), no lo tapes: cambiá el ancla o las perillas y regenerá.
4. **Mostrá la hoja de muestra**: abrí `specimen.html` con una herramienta de navegador si hay (captura en claro y en oscuro); si no, pedile al usuario que la abra (`start design\pages\<slug>\specimen.html` en Windows). En la app de escritorio, el panel de preview la muestra si `.claude/launch.json` sirve `design/` (ver `/front-studio:preview-setup`).
5. **Revisá contra los tics**: `node "${CLAUDE_PLUGIN_ROOT}/scripts/ai-look.cjs" design/pages/<slug>` debería dar 0: si el ancla cae en un default (crema + terracota, negro + verde ácido), proponé otro.

## Cómo se usa el kit
- Los componentes consumen **roles** (`--bg`, `--surface`, `--text`, `--text-muted`, `--border-strong`, `--accent`, `--on-accent`, `--accent-text`, `--focus`, `--success`/`--success-soft`...), no pasos de escala: así el tema oscuro y el reduced-motion funcionan solos.
- Tailwind v4: `@import "./design/pages/<slug>/tailwind.css";` después de `@import "tailwindcss";`. Clases: `bg-bg`, `text-text-muted`, `bg-accent text-on-accent`, `rounded-md`, `font-display`.
- `react-port` mapea estos tokens al mecanismo de tema del repo; un solo lugar para los valores.

## Reglas
- No edites los archivos generados a mano: cambiá `style.json` o la marca y regenerá (el encabezado lo recuerda).
- El kit de página no reemplaza la marca: si un ajuste debería valer para todo el producto, llevalo a `design/tokens.css` con `brand-intake`.
- Fuentes de Google Fonts solo como sugerencia: si la marca tiene fuente licenciada, se hereda y no se carga nada de afuera.
