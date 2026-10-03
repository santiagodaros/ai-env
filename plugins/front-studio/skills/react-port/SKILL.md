---
name: react-port
description: Pasa el preview aprobado al código React/TypeScript del repo por rebanadas, respetando el tema, las dependencias y las convenciones existentes. Etapa 5 del rediseño.
argument-hint: "[rebanada: shell|nombre-de-pantalla]"
disable-model-invocation: true
---

# Port a React

Requiere el preview aprobado (`design/preview/index.html`) y `design/tokens.css`. El preview sigue siendo la fuente de verdad hasta que termine el port.

## Antes de escribir código
1. Leé `package.json` y la estructura de carpetas. No asumas Tailwind, CSS Modules ni una librería de componentes: detectá lo que usa el repo y seguilo.
2. Leé el `CLAUDE.md` del repo y sus comandos de verificación (typecheck, lint, tests).
3. Mapeá los tokens de `design/tokens.css` al mecanismo de tema existente (variables CSS, configuración de Tailwind, objeto de tema). Un solo lugar para los valores.
4. Hacé el inventario de componentes desde los `data-component` del preview y marcá cuáles ya existen en el repo para reutilizarlos o adaptarlos.

## Por rebanadas
Orden: esqueleto (navegación, barra superior, alcance) → una pantalla por vez. Por cada rebanada:
1. Implementá solo esa rebanada. Los estados (cargando, vacío, error, desactualizado, sin permiso, parcial) se implementan con la lógica real de datos, no como decoración.
2. Movimiento: CSS primero, con las duraciones y curvas de `direction.md` y `prefers-reduced-motion`. No agregues una librería de animación sin preguntar.
3. Ejecutá typecheck, lint y los tests del repo. Si falla, corregí antes de seguir.
4. Corré `ui-review` sobre el diff. Sin P0 abiertos para pasar a la siguiente rebanada.
5. Un commit por rebanada (el usuario decide cuándo pushear).

## Accesibilidad al portar
Puntos de referencia (`nav`, `main`), foco que se mueve al contenido al cambiar de ruta, tablas con semántica de tabla, anuncios de estado con `aria-live` para toasts y cargas, nombres accesibles en botones de ícono.

## No hacer
- No reescribir lógica de datos, autenticación ni autorización mientras se porta la presentación.
- No cambiar nombres de rutas ni contratos de API.
- No mezclar el rediseño con refactors ajenos al diseño.
