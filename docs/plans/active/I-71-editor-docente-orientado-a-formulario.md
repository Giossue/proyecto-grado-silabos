# I-71 — Editor docente orientado a formulario

## Objetivo

Separar la tarea de completar el sílabo de su representación para impresión. DOC-04
debe comportarse como un formulario por secciones: los datos institucionales se
consultan como contexto de solo lectura, los campos de Docencia usan controles normales
y únicamente las estructuras realmente tabulares conservan una cuadrícula editable.

## Estado

Implementado el 10 de septiembre y ampliado/verificado el 13 de septiembre de 2026.

## Trazabilidad

RF-037..044; RN-020..024; CU-07; DOC-03..05; CP-F. No depende de una decisión
`POR VALIDAR` porque no cambia estados, permisos, persistencia ni el documento oficial.

## Alcance

- [x] Sustituir la ficha institucional de impresión por un resumen académico legible.
- [x] Mostrar fuera del documento los campos que completa el docente.
- [x] Conservar el diseño en cuadrícula solo para bloques de tipo tabla.
- [x] Eliminar el panel lateral redundante de colaboradores y ampliar el formulario.
- [x] Presentar todas las secciones consecutivamente, sin navegación paralela.
- [x] Retirar el guardado manual repetido de cada campo y tabla.
- [x] Simplificar la cabecera y mostrar una sola acción progresiva según completitud y
      validación vigente.
- [x] Evitar que `PageFrame` reserve espacio cuando el slot de acciones existe pero su
      condición no muestra ningún botón.
- [x] Verificar tipos, lint, formato y la prueba focalizada de interfaz.

## Criterios de aceptación

- El docente no escribe dentro de una simulación del documento impreso.
- Los datos maestros se distinguen claramente como solo lectura.
- Las tablas de planificación, evaluación y bibliografía siguen siendo editables como
  tablas porque la relación entre filas y columnas forma parte de la tarea.
- Autoguardado, validación, IA, concurrencia y envío conservan su comportamiento.
- La pantalla no introduce desplazamiento horizontal global a 360 px.
- Todas las secciones aparecen una debajo de otra dentro del mismo flujo de captura.
- Cada modificación activa el autoguardado y no se repite una acción «Guardar ahora»
  dentro de cada campo.
- La cabecera no repite regreso, estado del borrador ni hora de guardado.
- Con obligatorios incompletos no aparece una acción de validación o envío; al completar
  se ofrece validar y solo una validación vigente sin errores habilita el envío.
- Una edición posterior invalida visualmente la validación anterior. Las sugerencias de
  IA se pueden atender o ignorar y no cambian la elegibilidad para enviar.

## Evidencia

- `TeacherSyllabusEditorUiTest`: 1 prueba y 29 aserciones.
- Suites focalizadas de sílabos y cabecera: 69 pruebas y 2.008 aserciones.
- Prettier, ESLint, TypeScript, build de producción y `git diff --check` aprobados.
