---
name: product-map
description: Mapea la arquitectura de información del portal (personas, tareas, navegación, pantallas, estados) leyendo el repo y el dominio cloud/FinOps. Escribe design/product-map.md. Etapa 2 del rediseño.
argument-hint: "[carpeta de rutas o páginas, si no es obvia]"
disable-model-invocation: true
---

# Mapa del producto

La navegación y las secciones se diseñan desde las tareas del operador, no desde la lista de páginas que ya existe. Esta etapa produce esa arquitectura antes de tocar estilo.

## Pasos

1. **Relevá lo que hay hoy** sin leer el repo entero: usá un subagente `explorer` o Grep para listar rutas (React Router, `app/` o `pages/`, definiciones de `<Route>`), el componente de navegación y los títulos de página. Resumilo en una tabla: ruta, propósito, quién la usa, datos que muestra.
2. **Leé `design/brand.md`** si existe, solo para el vocabulario y la voz.
3. **Cargá `references/cloud-ops-domain.md`** y úsalo como lista de conceptos y patrones. Marcá cuáles aplican a este portal y cuáles no. No agregues secciones por completitud: cada una debe responder a una tarea real.
4. **Definí personas y tareas** (3 a 5 personas como máximo; por persona, las 3 preguntas que hace cada día). La pregunta guía de la pantalla de inicio es: "¿qué cambió desde ayer y qué requiere acción?".
5. **Proponé la navegación**:
   - Primaria: 7 ítems o menos, con nombres en el vocabulario del usuario.
   - Alcance global (cliente, tenant, suscripción) como control de primer nivel, no escondido en una página.
   - Búsqueda global o paleta de comandos, rango de tiempo y "última actualización" donde aplique.
   - Wireframe ASCII de la navegación y de la pantalla de inicio.
6. **Lista de pantallas** con, por cada una: tarea que resuelve, contenido principal, densidad de datos (baja, media, alta), acciones con impacto (necesitan confirmación) y estados obligatorios (cargando con consultas lentas, vacío, error, datos desactualizados, datos parciales, sin permiso para ese cliente).
7. **Escribí `design/product-map.md`** (una página y media como máximo) con: relevamiento actual, personas y tareas, navegación propuesta, pantallas, estados transversales y preguntas abiertas.

## Compuerta
Presentá la navegación propuesta y las 3 decisiones más discutibles (qué se fusionó, qué se eliminó, qué se subió de nivel) y pedí confirmación. Registrala en `design/STATE.md`.

## Prohibido
Datos reales de clientes o tenants en el documento. Usá "Cliente A", "Suscripción 1".
