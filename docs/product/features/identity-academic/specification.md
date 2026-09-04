# Identidad y estructura académica

## Trazabilidad

- RF-001 a RF-016; CU-01 a CU-03.
- RN-001 a RN-008.
- UI-01 a UI-04; ADM-02 a ADM-04.
- PV-05, PV-06, PV-09, PV-10, PV-12 y PV-15.

## Comportamiento

- Solo cuentas activas crean sesiones; cierre y revocación invalidan acceso.
- El administrador conserva historial al desactivar usuarios.
- El perfil no permite autoeliminar la cuenta; una baja se representa mediante
  desactivación administrativa para conservar asignaciones y auditoría histórica.
- Una persona acumula roles con alcance y vigencia, incluida la coordinación de varias
  carreras mediante asignaciones independientes.
- Coordinación elige explícitamente la carrera al iniciar, aunque solo tenga una opción,
  y puede cambiar el ámbito activo desde el menú de usuario. Administrador y Docente
  conservan la activación automática cuando solo tienen un rol elegible.
- El rol Coordinador exige rol y asignación de coordinación vigentes para la misma
  carrera; perder cualquiera de los dos invalida ese rol.
- El Administrador mantiene facultades, carreras y catálogos globales, crea cuentas y
  asigna coordinaciones.
- Solo el Administrador puede corregir el nombre o el correo de una cuenta. Coordinadores
  y Docentes consultan esos datos en su perfil y solicitan la corrección a Administración.
- ADM-04 presenta Facultades, Carreras, Campus, Modalidades y Periodos académicos como
  rutas hijas del submenú Estructura académica. Carreras identifica su Facultad y
  Facultades cuenta sus carreras; no se combinan en una tabla genérica ni se infiere una
  dependencia campus-facultad que no existe en el modelo.
- Cada fila de ADM-04 permite editar sus datos en un `Sheet` y eliminarla únicamente
  cuando no tiene dependencias ni historia. Un proceso institucional abierto congela
  esas acciones hasta que Administración lo pause. La carrera permite cambiar de
  facultad únicamente hacia otra activa; los códigos conservan unicidad y las fechas de
  periodo deben mantener un intervalo válido.
- La actualización se autoriza y valida en servidor, se ejecuta dentro de una transacción
  y registra campos modificados y valores anterior/nuevo en auditoría. Un envío sin cambios
  no inventa un evento.
- El Coordinador mantiene la malla, materias, ofertas, paralelos y asignaciones docentes
  únicamente para la carrera de su rol.
- Cada fila editable de esas colecciones ofrece Editar o Eliminar cuando no tiene
  dependencias. Una convocatoria abierta congela ofertas, paralelos y asignaciones de su
  carrera; Coordinación debe pausarla para corregir y el servidor vuelve a comprobar el
  alcance por registro. Las actualizaciones conservan antes/después en auditoría.
- COR-14 puede crear varios paralelos de una misma oferta en un lote atómico: los códigos
  separados por coma o línea comparten jornada; una duplicación o un código inválido no
  crea una parte del lote. Cada paralelo creado queda auditado por separado.
- Cada carrera tiene cero o una malla actual, editable activa o inactiva. Coordinación
  puede deshabilitarla/reactivarla y solo eliminarla cuando no tiene ofertas ni sílabos.
  Una oferta, paralelo o asignación ya incorporada a un sílabo queda protegida y no se
  elimina; para sustituir un responsable existente se usa el relevo con sustento.
- La navegación del Coordinador concentra Materias dentro de **Malla**. La ruta abre el
  agregado actual directamente o muestra su estado vacío; no usa buscador, filtros,
  cards, paginación, publicación ni número de versión. Ofertas y Paralelos conservan
  rutas hijas separadas.
- Estructura, mallas, materias y ofertas usan identificadores estables. La posición de una
  materia se presenta como ciclo; el periodo académico conserva sus fechas.
- ADM-02..04 y COR-14..15 priorizan sus tablas; COR-13 prioriza la página completa de la
  malla. En el desglose de COR-13, la acción principal abre desde la derecha el formulario
  manual; en el constructor visual, cada ciclo permite crear materias y cada tarjeta se
  edita directamente en el lienzo, sin abrir ese Sheet.
- La asignación académica decide qué sílabos puede ver y editar un docente.

## Criterios críticos

- Un usuario fuera de alcance no puede inferir ni descargar el recurso.
- Un ID de malla, materia, oferta, paralelo o asignación de otra carrera no concede acceso
  ni permite una mutación aunque se envíe fuera de la interfaz.
- Dos coordinaciones activas no se superponen para la misma carrera.
- Un Coordinador o Docente no puede actualizar catálogos globales aunque construya la
  solicitud fuera de la interfaz.
- No hay archivado de catálogos académicos: los registros sin dependencias se eliminan
  con confirmación y auditoría; las referencias históricas bloquean la eliminación.
- Sin una malla activa no se crean ofertas ni se abren procesos nuevos. Los sílabos
  existentes conservan su fotografía académica aunque la malla se edite o deshabilite.
