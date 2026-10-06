# Arquitectura hexagonal (puertos y adaptadores): regla inicial

## La regla
Las dependencias apuntan hacia el núcleo. Nada del núcleo conoce a los adaptadores.

- **Dominio**: entidades y reglas puras. No importa otras capas ni infraestructura. Sin E/S.
- **Aplicación**: casos de uso. Define los **puertos** (interfaces) que necesita. Depende solo del dominio.
- **Adaptadores de entrada (driving)**: traducen un disparador externo (HTTP, UI, CLI, trigger) a un caso de uso.
- **Adaptadores de salida (driven)**: implementan un puerto con tecnología concreta (API, base de datos, Azure, archivos).
- **Config (raíz de composición)**: arma casos de uso con adaptadores. Único lugar que lee entorno y secretos.

Los adaptadores no se importan entre sí. Entrada y salida solo se encuentran en el núcleo.

## Cómo se aplica por tipo

| Tipo | Entrada | Salida | Nota |
|---|---|---|---|
| Página o app web | Componentes y rutas de la UI | Cliente de la API propia o de servicios | La lógica de pantalla que no es de negocio queda en el adaptador. Si hay backend en el mismo repo, cada app tiene su propio `architecture.json` (por ejemplo `apps/web` y `apps/api`) |
| API o servicio | Controladores, colas, triggers | Base de datos, APIs externas, mensajería | Validación y autenticación en el adaptador de entrada |
| Automatización (PowerShell, Python) | Script de entrada o trigger programado | Azure CLI, Graph, ARM, archivos | La decisión ("qué remediar", "cómo clasificar") es dominio; llamar a Azure es adaptador. Incluí modo de simulación en acciones destructivas |
| CLI | Comandos y argumentos | Lo mismo que arriba | El parseo de argumentos es adaptador |

## Pruebas
- Dominio: unitarias, sin dobles.
- Aplicación: puertos falsos en memoria.
- Adaptadores: pruebas de contrato contra el puerto.
- Una prueba de punta a punta por caso de uso importante.

## Errores comunes
- Un caso de uso que importa el SDK de Azure o `axios`: va detrás de un puerto.
- Leer variables de entorno en el dominio: entra por config.
- Modelar el dominio con los tipos de la base de datos o de la API: se mapea en el adaptador.
- Un adaptador que llama a otro adaptador: pasa por un caso de uso.
- Carpeta `utils` o `shared` que importa de todas partes: reparte cada cosa en su capa.

## Código existente (adopción)
Si ya hay código fuera de las capas, declaralo en `allowOutside` de `architecture.json` como deuda temporal (por ejemplo `"src/legacy/"`) y migralo por partes. Cada cambio a `allowOutside` invalida la aprobación y hay que aprobar de nuevo.
