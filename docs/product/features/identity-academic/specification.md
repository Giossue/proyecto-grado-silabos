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
- Cada fila de ADM-04 permite editar sus datos en un `Sheet`, archivar y reactivar. La
  carrera permite cambiar de facultad únicamente hacia otra activa; los códigos conservan
  unicidad y las fechas de periodo deben mantener un intervalo válido.
- La actualización se autoriza y valida en servidor, se ejecuta dentro de una transacción
  y registra campos modificados y valores anterior/nuevo en auditoría. Un envío sin cambios
  no inventa un evento.
- El Coordinador mantiene mallas, materias, ofertas, paralelos y asignaciones docentes
  únicamente para la carrera de su rol.
- Cada fila editable de esas colecciones ofrece Editar. La autorización vuelve a comprobar
  el alcance por registro y la actualización conserva antes/después en auditoría.
- Una malla publicada y sus materias no se reescriben. Una oferta, paralelo o asignación
  ya incorporada a un sílabo se archiva y reemplaza para no alterar el expediente.
- La navegación del Coordinador concentra Materias dentro de Mallas. El listado de mallas
  usa cards y cada detalle ofrece desglose académico y constructor visual sobre el mismo
  agregado. Ofertas y Paralelos conservan rutas hijas separadas.
- Estructura, mallas, materias y ofertas usan identificadores estables. La posición de una
  materia se presenta como ciclo; el periodo académico conserva sus fechas.
- ADM-02..04 y COR-14..15 priorizan sus tablas; COR-13 prioriza cards y el detalle de
  malla. Una única acción principal abre desde la derecha el formulario de alta
  correspondiente, sin mostrarlo permanentemente.
- La asignación académica decide qué sílabos puede ver y editar un docente.

## Criterios críticos

- Un usuario fuera de alcance no puede inferir ni descargar el recurso.
- Un ID de malla, materia, oferta, paralelo o asignación de otra carrera no concede acceso
  ni permite una mutación aunque se envíe fuera de la interfaz.
- Dos coordinaciones activas no se superponen para la misma carrera.
- Un Coordinador o Docente no puede actualizar catálogos globales aunque construya la
  solicitud fuera de la interfaz.
- Archivar no elimina referencias históricas; reactivar vuelve a habilitar usos futuros.
- Una nueva malla no altera expedientes de mallas anteriores.
