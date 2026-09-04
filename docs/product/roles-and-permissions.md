# Roles, alcance y permisos

## Modelo

El rol es solo una dimensión. La autorización efectiva se calcula como:

```text
usuario activo
AND rol activo
AND alcance académico permitido
AND asignación vigente, cuando aplique
AND acción válida para el estado
AND recurso perteneciente al rol activo
```

Todas las condiciones se verifican en el servidor. La navegación y los botones reflejan
el permiso, pero no lo sustituyen.

## Matriz base

| Capacidad | Administrador | Coordinador | Docente |
|---|---:|---:|---:|
| Gestionar usuarios/roles | Sí | No | No |
| Corregir nombre o correo de una cuenta | Sí | No | No |
| Crear, editar y eliminar sin dependencias facultades, carreras y catálogos globales | Sí, salvo con proceso abierto | Consulta de alcance | Consulta asignada |
| Asignar coordinación a una carrera | Sí | No | No |
| Gestionar mallas y materias | No por defecto | Sí, en su carrera, salvo con convocatoria en curso | Consulta asignada |
| Gestionar ofertas y paralelos | No por defecto | Sí, en su carrera, salvo con convocatoria en curso | Consulta asignada |
| Asignar docentes a paralelos | No por defecto | Sí, en su carrera, salvo con convocatoria en curso | Consulta propia |
| Diseñar/publicar plantilla | Sí, salvo con proceso abierto | Consulta/aporte según política | No |
| Gestionar fuentes (documentos) | No participa | Sí, en su carrera, salvo con convocatoria en curso | Consulta autorizada |
| Abrir, pausar, reanudar y cerrar el proceso de sílabos | Sí | Consulta al convocar | No |
| Preparar convocatoria institucional | Sí, una por período | No | No |
| Iniciar alcance de su carrera desde convocatoria institucional abierta | No | Sí, si su malla, ofertas/paralelos, docentes y fuentes están listos | No |
| Pausar/reanudar convocatoria | No | Sí, en su carrera | No |
| Cerrar (sobre el proceso; detiene a todas las convocatorias) | Sí | No | No |
| Prorrogar plazo (sobre el proceso; alcanza a todas las convocatorias) | Sí | No | No |
| Elaborar contenido | No por defecto | No por defecto | Sí, asignado y editable |
| Solicitar análisis de IA | No por defecto | Consulta de resultados | Sí, si el campo lo permite |
| Enviar/reenviar | No | No | Sí, asignado |
| Observar/solicitar corrección | No | Sí | Responder |
| Comparar revisiones | Auditoría | Sí | Sí, si es propio/autorizado |
| Aprobar/reabrir | No | Sí | No |
| Exportar | Según permiso | Sí en alcance | Sí, propio/autorizado |
| Ver informes | Operación global autorizada | Sí en alcance | Resumen propio |
| Consultar auditoría | Sí, permiso explícito | Vista limitada | No por defecto |

`PV-16` decide si el coordinador puede editar excepcionalmente contenido docente. Hasta
resolverlo, la implementación debe negar esa edición. Si se autoriza, exigirá motivo,
permiso específico, señal visible y auditoría detallada.

Gestionar materias o asignaciones docentes no concede permiso para alterar el contenido
de un sílabo. El Administrador crea las cuentas y asigna roles; el Coordinador selecciona
docentes ya vigentes en su carrera y conserva el historial de cada asignación.
El nombre y el correo son datos administrativos de la cuenta: solo el Administrador puede
corregirlos. Ni el Coordinador por dirigir a una persona ni el Docente sobre su propio
perfil puede modificarlos; el cambio se solicita a Administración.
La edición administrativa de catálogos conserva el valor anterior y el nuevo en auditoría;
no concede al Administrador permisos sobre mallas, materias o contenido docente.

## Acumulación de roles

Una persona puede ser coordinadora de varias carreras y también docente. Cada asignación
de rol conserva su propia carrera y se retira manualmente al finalizarla. Al iniciar como
Coordinador debe elegir una carrera incluso si solo tiene una coordinación vigente; durante la sesión puede cambiar
de carrera o rol desde el menú de usuario. Solo existe un ámbito activo a la vez.

No se combinan privilegios de forma implícita para evadir la separación de
responsabilidades. Cada selección sustituye el ámbito de sesión y el evento de auditoría
registra la asignación usada.

## Reglas de consulta

- Las consultas se filtran en base de datos, no después de cargar resultados.
- Un `404` o `403` se elige de forma coherente para no revelar existencia fuera de alcance.
- Descargas reevalúan autorización en cada solicitud; una URL no concede permiso.
- Reportes y conteos respetan el mismo alcance que sus filas de detalle.
- El administrador no obtiene automáticamente facultad académica de aprobación.

## Pruebas mínimas por política

1. acción permitida en recurso propio y estado válido;
2. rol correcto con alcance incorrecto;
3. asignación vencida;
4. recurso de otra carrera/asignación;
5. estado que bloquea la acción;
6. usuario inactivo o sesión revocada;
7. persona con dos roles usando cada uno;
8. consulta masiva, exportación y descarga sin filtración lateral.
