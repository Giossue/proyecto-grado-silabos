# Para revisar el lunes: conexión con los datos de la UEB

Anotado el viernes 2026-11-27. Desde el lunes 2026-11-30, datos como docentes, carreras y periodos se consumirán de la UEB en vez de crearse a mano.

## 1. Primero: cambios de periodos (puede borrar trabajo)

- Editar un periodo que tiene sílabos en curso **los rehace**: se pierde el borrador, las revisiones, la aprobación, las firmas y el análisis de IA. Hoy el sistema pide confirmación antes.
- Según el código, esto pasa **aunque se guarde sin cambiar ningún dato**. No se probó en pantalla ni con una prueba propia.
- Riesgo: si la conexión vuelve a guardar periodos y confirma sola, podría borrar trabajo en cada actualización.
- Hay que decidir: qué cambios de periodo (código, fechas, semanas) afectan un sílabo, y que ninguno borre lo escrito.
- Código: `apps/api/src/server/academic/governanceWrites.ts` (rama `periodo`, usa `tx.replace`) y `replace` y `regenerate` en `apps/api/src/server/syllabus/inProgressWork.ts`.

## 2. Reglas que siguen y habría que revisar

- No se puede desactivar una carrera que participa en un proceso de sílabos en curso.
- Hay protecciones para eliminar o cambiar registros (por ejemplo materias, paralelos, periodos ya abiertos y cuentas con actividad). No se revisaron una por una.
- No se puede desactivar a un docente con sílabos en curso sin reasignar sus paralelos.
- Por cada tipo de dato que llegue: qué pasa si cambia, si deja de venir o si vuelve a aparecer.

Recomendación: conservar lo que protege sílabos aprobados o firmados, el historial y los permisos.

## 3. Logo de la facultad

- Sigue siendo obligatorio para abrir el proceso de una carrera.
- Si falta, el sistema usa `assets/images/silabo/facultad.jpeg`, que es el logo de la Facultad de Ciencias Administrativas.
- Averiguar si la UEB entrega los logos. Si no, seguir cargándolos aquí o cambiar la imagen por defecto por una genérica.

## 4. Qué pedir sobre los datos

- Formato y un ejemplo **sin claves ni datos personales reales**.
- Qué identifica de forma fija a cada docente, carrera, materia y periodo (para no duplicar si cambia un nombre).
- Cada cuánto cambian y cómo avisan una baja.
- Qué datos no entrega la UEB y habrá que seguir llenando aquí (por ejemplo la plantilla y el proyecto de carrera).

## 5. Revisión independiente pendiente

Estos cambios no tuvieron revisión independiente:

- «Llenar un campo» reemplaza el contenido de todas las materias elegidas.
- Nuevos requisitos para abrir y reanudar el proceso de sílabos.
- Cambiar facultad o carrera ya no devuelve sílabos a borrador (los enviados y aprobados conservan los datos anteriores).

## Ya hecho el viernes

- Abrir el proceso institucional solo exige la plantilla.
- Abrir y reanudar el de una carrera exige plantilla, logo, malla, proyecto de carrera completo y al menos un paralelo con docente.
- Se quitó la regla de facultad y carrera. El detalle está en `docs/sistema.md`.
