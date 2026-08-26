# Roles, alcance y permisos

## Modelo

El rol es solo una dimensión. La autorización efectiva se calcula como:

```text
usuario activo
AND rol vigente
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
| Crear, editar, archivar y reactivar facultades, carreras y catálogos globales | Sí | Consulta de alcance | Consulta asignada |
| Asignar coordinación a una carrera | Sí | No | No |
| Gestionar mallas y materias | No por defecto | Sí, en su carrera | Consulta asignada |
| Gestionar ofertas y paralelos | No por defecto | Sí, en su carrera | Consulta asignada |
| Asignar docentes a paralelos | No por defecto | Sí, en su carrera | Consulta propia |
| Diseñar/publicar plantilla | Sí | Consulta/aporte según política | No |
| Versionar/activar fuentes | Administración | Sí, en su alcance | Consulta autorizada |
| Crear/abrir convocatoria | Soporte técnico | Sí | No |
| Elaborar contenido | No por defecto | No por defecto | Sí, asignado y editable |
| Solicitar análisis de IA | No por defecto | Consulta de resultados | Sí, si el campo lo permite |
| Enviar/reenviar | No | No | Sí, asignado |
| Observar/solicitar corrección | No | Sí | Responder |
| Comparar revisiones | Auditoría | Sí | Sí, si es propio/autorizado |
| Aprobar/reabrir | No | Sí | No |
| Exportar | Según permiso | Sí en alcance | Sí, propio/autorizado |
| Ver informes | Operación global autorizada | Sí en alcance | Resumen propio |
| Consultar auditoría | Sí, permiso explícito | Vista limitada | No por defecto |
| Ejecutar importación | Sí | No | No |

`PV-16` decide si el coordinador puede editar excepcionalmente contenido docente. Hasta
resolverlo, la implementación debe negar esa edición. Si se autoriza, exigirá motivo,
permiso específico, señal visible y auditoría detallada.

Gestionar materias o asignaciones docentes no concede permiso para alterar el contenido
de un sílabo. El Administrador crea las cuentas y asigna roles; el Coordinador selecciona
docentes ya vigentes en su carrera y conserva el historial de cada asignación.
La edición administrativa de catálogos conserva el valor anterior y el nuevo en auditoría;
no concede al Administrador permisos sobre mallas, materias o contenido docente.

## Acumulación de roles

Una persona puede ser coordinadora y docente. Debe seleccionar un rol cuando las
acciones o datos cambien. No se combinan privilegios de forma implícita para evadir la
separación de responsabilidades. El evento de auditoría registra el rol usado.

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
