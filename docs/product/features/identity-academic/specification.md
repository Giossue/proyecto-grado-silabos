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
- Una persona acumula roles con alcance y vigencia.
- El rol activo se elige explícitamente cuando cambia los permisos.
- El rol Coordinador exige rol y asignación de coordinación vigentes para la misma
  carrera; perder cualquiera de los dos invalida ese rol.
- El Administrador mantiene facultades, carreras y catálogos globales, crea cuentas y
  asigna coordinaciones.
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
- Estructura, mallas, materias y ofertas usan identificadores estables. La posición de una
  materia se presenta como ciclo; el periodo académico conserva sus fechas.
- ADM-02..04 y COR-13..15 priorizan sus tablas; una única acción principal abre desde la
  derecha el formulario de alta correspondiente, sin mostrarlo permanentemente.
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

