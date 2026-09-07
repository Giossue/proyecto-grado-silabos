# Secciones funcionales del sílabo

La plantilla oficial definitiva depende de `PV-07`, pero el modelo debe poder representar
como mínimo las doce áreas identificadas en la línea base.

| N.º | Sección | Contenido esperado | Tratamiento preferido |
|---:|---|---|---|
| 1 | Identificación institucional | carrera, periodo, asignatura, código, ciclo, créditos, horas, docentes | referencias maestras bloqueadas y datos estructurados |
| 2 | Descripción de la asignatura | propósito, alcance y relación curricular | narrativa Markdown segura con ayudas/fuentes |
| 3 | Objetivos | objetivo general y específicos | lista estructurada + narrativa |
| 4 | Resultados de aprendizaje | resultados y relación con asignatura/programa | referencias estructuradas, orden y trazabilidad |
| 5 | Habilidades blandas | habilidades y forma de desarrollo | catálogo/selección + justificación |
| 6 | Unidades y planificación | unidades, contenidos, resultados, horas, actividades, recursos y semanas | tablas repetibles, cálculos y validaciones |
| 7 | Metodología y ambientes | estrategias, ambientes, TIC/TAC/IA y recursos | selección estructurada + narrativa |
| 8 | Evaluación | componentes, técnicas, instrumentos, ponderaciones y evidencias | tablas, cálculos, reglas de suma/redondeo |
| 9 | Perfil de egreso | contribución de la asignatura al perfil | referencias a fuente + narrativa |
| 10 | Ética y compromisos | acuerdos, integridad y responsabilidades | narrativa/selección según plantilla |
| 11 | Bibliografía | básica, complementaria y recursos | registros bibliográficos estructurados y ordenados |
| 12 | Revisión y aprobación | responsables, observaciones, revisiones y aprobación | metadatos del workflow, no edición libre |

## Reglas de modelado

La referencia visual aportada el 2026-09-06 (`temp/silabo.pdf`) conserva estas doce
áreas. La plantilla inicial incluye en Evaluación una tabla de indicadores con
puntos y ponderación para cada uno de los dos parciales, seguida de la escala de
valoración y la recuperación. Son campos que llena el docente: no se precargan
notas ni se incorporan fórmulas o porcentajes del PDF. PV-07/PV-08 siguen abiertas.
Este ajuste se aplica al crear la plantilla, no sobrescribe diseños guardados ni
altera revisiones enviadas.

La vista administrativa usa ejemplos sintéticos breves, separados de los datos
reales: una frase por campo y una fila por tabla. En planificación se muestran
también el encabezado de una unidad y sus totales. No son respuestas iniciales del
docente. Se usa papel Carta con paginación dinámica; las ocho páginas del PDF no
son una cantidad fija del formato.

- La plantilla decide orden, etiquetas, visibilidad y obligatoriedad sin ejecutar DDL.
- Datos heredados muestran la fuente y se bloquean para el docente.
- Cálculos guardan la regla/versión utilizada y se vuelven a validar en servidor.
- Tablas/listas repetibles usan IDs de fila estables para diff y concurrencia.
- Campos narrativos usan Markdown seguro; no HTML arbitrario.
- Resultados, habilidades, horas, créditos, TIC/TAC/IA y bibliografía se estructuran si
  deben buscarse, calcularse o verificarse.
- La sección 12 refleja revisiones/aprobaciones del dominio; una plantilla no puede
  falsificar una aprobación mediante texto editable.

## Validación antes de publicar plantilla

1. Todas las claves de campo son únicas y estables.
2. Tipos, reglas, condiciones y dependencias no forman ciclos.
3. Campos calculados tienen entradas y fórmula válidas.
4. Repetibles definen clave/orden y columnas accesibles.
5. Valores heredados apuntan a maestros existentes.
6. Permisos no permiten editar evidencia o campos institucionales.
7. Marcadores DOCX obligatorios tienen correspondencia.
8. La previsualización cubre vacío, valores largos y máximos representativos.
