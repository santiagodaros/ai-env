# Heurísticas de Nielsen: rúbrica de puntaje

Cada heurística se puntúa de 0 a 4 con **evidencia** (captura, pantalla, archivo:línea). Sin evidencia, no hay puntaje: se marca "sin verificar". Total sobre 40.

| Puntaje | Significado |
|---|---|
| 4 | Sin problemas que se puedan señalar |
| 3 | Problemas menores, no frenan la tarea |
| 2 | Problemas que molestan o confunden; la tarea sale con esfuerzo |
| 1 | Problemas serios: errores frecuentes o abandono probable |
| 0 | Rompe la tarea principal |

Bandas del total: 36-40 excelente · 28-35 bueno · 20-27 regular · menos de 20 malo.

## Las diez, con qué mirar en cada una

1. **Visibilidad del estado del sistema**: carga con forma del contenido, "actualizado hace…", progreso en tareas largas, confirmación de lo que se guardó, estado de filtros activos.
2. **Relación con el mundo real**: vocabulario del usuario (no del backend), unidades y formatos locales (`Intl.NumberFormat`, fechas), orden natural de la tarea.
3. **Control y libertad**: deshacer, cancelar, volver sin perder lo cargado, salir de un modal con Esc, confirmación solo en lo irreversible.
4. **Consistencia y estándares**: la misma acción con el mismo nombre y lugar; convenciones de la plataforma; un solo patrón por problema.
5. **Prevención de errores**: valores por defecto seguros, validación antes de enviar, deshabilitar lo imposible explicando por qué, confirmación con el nombre del recurso en acciones destructivas.
6. **Reconocer antes que recordar**: opciones visibles, contexto que acompaña (alcance actual, selección), historial y recientes, etiquetas en vez de íconos sueltos.
7. **Flexibilidad y eficiencia**: atajos, acciones en lote, búsqueda o paleta de comandos, filtros guardados, densidad ajustable (clave en superficies de operar).
8. **Estética y diseño minimalista**: cada elemento sirve a una tarea; jerarquía clara; nada de decoración que compita con el dato (acá entran los tics de `ai-look`, pero el juicio es sobre la jerarquía, no sobre la lista).
9. **Reconocer, diagnosticar y recuperarse de errores**: mensajes que dicen qué pasó, por qué y cómo seguir; sin códigos sueltos; el foco va al error; lo cargado no se pierde.
10. **Ayuda y documentación**: ayuda contextual donde se duda (no un manual aparte), vacíos que explican qué hacer, ejemplos en los campos difíciles.

## Formato de `design/review/heuristics.json`

```json
{
  "tool": "nielsen",
  "score": 26,
  "max": 40,
  "items": [
    { "n": 1, "name": "Visibilidad del estado del sistema", "score": 2, "notes": "Inicio no indica antigüedad de los datos (captura inicio@1280)" }
  ],
  "findings": [
    { "source": "nielsen", "id": "h1-datos-viejos", "title": "No se avisa cuando los datos están desactualizados", "severity": "P0",
      "where": "Inicio, tarjeta de costos", "evidence": "captura inicio@1280", "fix": "Marca 'actualizado hace N min' y aviso pasado el umbral", "effort": "S" }
  ]
}
```

Severidad de los hallazgos: P0 si rompe la tarea, pierde información o muestra un estado engañoso; P1 si degrada la experiencia; P2 pulido. Los hallazgos de **estados** (cargando, vacío, error, desactualizado, parcial, sin permiso) van con `"source": "estados"`.
