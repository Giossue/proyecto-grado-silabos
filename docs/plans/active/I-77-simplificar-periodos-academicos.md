# I-77 — Simplificar períodos académicos

## Decisión

`periodos_academicos.codigo` es la única etiqueta del período. Se retiran `nombre` y
`activo`; el estado se deriva exclusivamente de `fecha_inicio` y `fecha_fin`.

## Semanas lectivas

`semanas_lectivas` permanece. Expresa las semanas efectivas de docencia que deben
distribuirse en las unidades y horas del sílabo; no se puede inferir con precisión de las
fechas, porque estas incluyen recesos, feriados y gestiones administrativas.

## Alcance

- Eliminar los dos campos de la tabla mediante la migración `000062`.
- Sustituir toda etiqueta de período por su código.
- Permitir planificación mientras el período no haya finalizado.
- Mantener la validación de semanas lectivas entre 1 y 52.

## Datos existentes

Antes de desplegar se respalda producción. El 14 de septiembre de 2026 había dos
períodos; uno tenía un nombre distinto de su código y ese texto se eliminará por decisión
explícita del responsable del producto.
