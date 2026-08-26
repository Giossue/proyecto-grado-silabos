# Visión del producto

## Problema

La elaboración y revisión de sílabos se apoya en plantillas de oficina, archivos locales
y comunicaciones dispersas. El docente localiza datos académicos y los transcribe; el
coordinador recibe documentos, devuelve observaciones y controla versiones mediante
archivos. Esto dificulta saber cuál revisión está vigente, qué fuente respaldó un dato,
quién decidió un cambio y si la aprobación puede reproducirse.

## Producto

Aplicación web autenticada que configura una convocatoria académica, crea sílabos desde una
plantilla versionada, hereda datos maestros, permite elaboración colaborativa, aplica
validaciones, ofrece ayuda de IA con evidencia, gestiona revisión/corrección/aprobación y
genera Word/PDF desde la revisión aprobada.

## Objetivo de valor

- una única fuente de estado para cada sílabo;
- menos transcripción y búsqueda manual;
- reglas y plantillas configurables sin cambiar el esquema físico;
- revisión por observaciones trazables, no por archivos enviados de un lado a otro;
- historial inmutable y comparación de revisiones;
- evidencia verificable para toda ayuda de IA;
- exportaciones coherentes con el contenido aprobado;
- información reproducible para coordinación y auditoría.

## Usuarios

| Rol | Resultado que busca |
|---|---|
| Docente | Elaborar, corregir, justificar y enviar el sílabo asignado sin perder trabajo. |
| Coordinador | Gestionar mallas, materias, oferta y docentes de su carrera; preparar convocatorias, revisar, aprobar y vigilar el avance. |
| Administrador | Mantener usuarios, facultades, carreras, coordinaciones, plantillas, integraciones y operación. |

Una persona puede acumular roles. El permiso efectivo depende además de alcance,
asignación, vigencia y estado.

## Alcance funcional

El ciclo cubre:

1. preparación de identidad y estructura académica;
2. versionado de plantilla y fuentes;
3. apertura de convocatoria;
4. generación de sílabos esperados;
5. elaboración y validación;
6. asistencia de IA opcional;
7. envío como revisión inmutable;
8. observación, respuesta y corrección;
9. comparación y aprobación;
10. reapertura controlada;
11. generación de Word/PDF;
12. notificaciones, informes, auditoría e importación trazable.

## Fuera de alcance

- administrar aula virtual/EVEA;
- matrículas, calificaciones u horarios;
- aplicación móvil nativa;
- firma electrónica institucional;
- escribir directamente en la base institucional;
- sustituir a autoridades académicas;
- aprobar, rechazar o bloquear mediante IA;
- desplegar inicialmente para toda la UEB sin pilotaje en Software.

## Indicadores de éxito

Se validarán con línea base e instrumentos aprobados:

- porcentaje de sílabos entregados y aprobados dentro del plazo;
- tiempo de elaboración, revisión y corrección;
- número de devoluciones y errores por revisión;
- recuperación de la versión correcta y trazabilidad completa;
- éxito, tiempo y errores en tareas de usabilidad;
- utilidad y precisión percibida/experta de recomendaciones de IA;
- fidelidad de Word/PDF frente al formato oficial.

Los umbrales definitivos dependen de `PV-03`, `PV-04`, `PV-17` y `PV-18`.
