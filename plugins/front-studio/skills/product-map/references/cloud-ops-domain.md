# Dominio: portal de operaciones cloud, CSP y FinOps

Lista de conceptos y patrones habituales para decidir qué entra en la navegación. Es una guía de cobertura, no una plantilla: usar solo lo que el portal realmente hace.

## Entidades
- **Cliente / tenant / suscripción / grupo de recursos / recurso.** Jerarquía de alcance. El operador casi siempre trabaja "dentro de un cliente".
- **Relación delegada y permisos** (acceso delegado del partner, roles asignados, estado y vencimiento de la relación).
- **Costos**: gasto por período, por servicio, por etiqueta, presupuestos, alertas de anomalía, pronóstico, comparación contra el período anterior.
- **Ahorro**: reservas y savings plans (cobertura, utilización, vencimientos, recomendaciones), recursos sin uso, rightsizing.
- **Facturación**: facturas, conciliación, márgenes, conversión de moneda.
- **Gobernanza**: cumplimiento de políticas, etiquetas faltantes, excepciones, diferencias respecto del estándar.
- **Identidad y seguridad**: usuarios invitados, acceso privilegiado, MFA, hallazgos de seguridad.
- **Resiliencia**: estado de backups, replicación y recuperación ante desastres, últimas pruebas.
- **Migración y proyectos**: oleadas, tareas, bloqueos, responsables.
- **Tickets y trabajo en curso** si el portal los integra.

## Patrones de navegación
- Selector de alcance siempre visible, con búsqueda y los últimos usados.
- Búsqueda global (clientes, suscripciones, recursos) y paleta de comandos para quien opera todo el día con teclado.
- Inicio orientado a "qué cambió y qué requiere acción", no a un resumen decorativo.
- Listas con filtros guardables y exportación; detalle por entidad con pestañas que repiten la misma estructura entre entidades.
- Acciones con impacto (compras de reservas, cambios de permisos) separadas visualmente y con confirmación explícita.

## Datos y estados (lo que más se olvida en un rediseño)
- **Frescura**: mostrar la hora de la última actualización. Las consultas de costos son lentas y los datos se refrescan cada pocas horas (verificar el intervalo para la fuente que use el portal).
- **Carga lenta**: esqueletos con la forma final, no spinners a pantalla completa.
- **Parcial**: un cliente falla y los demás cargan; mostrar el error en ese cliente, no tirar toda la vista.
- **Sin permiso**: distinguir "no tenés acceso a este cliente" de "no hay datos".
- **Números**: cifras tabulares, unidades y moneda explícitas, huso horario explícito, cambios con signo y dirección además del color.
- **Severidad**: nunca solo por color; ícono o texto además.
- **Densidad**: tablas compactas con encabezado fijo, ordenamiento, columnas configurables; el usuario experto prefiere densidad a espacio en blanco.

## Qué no incluir salvo que lo pida una tarea real
Paneles de "insights de IA", gráficos de torta por costumbre, tarjetas de bienvenida, métricas inventadas para llenar un hueco.
