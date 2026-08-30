# Auditoría de acciones en tablas

Análisis estático de los componentes Vue. Los elementos deshabilitados que solo
explican ausencia de acciones no se cuentan como acciones disponibles.

## Resumen

- Tablas encontradas: **24**.
- Tablas con columna `Acciones`: **16**.
- Tablas cuyo menú solo ofrece Archivar/Reactivar: **1**.
- Otros menús con una sola acción: **4**.
- Menús con varias acciones: **11**.

## Tablas con columna de acciones

| Tabla | Archivo | Acciones detectadas | Clasificación | Evidencia |
| --- | --- | --- | --- | --- |
| Facultades | `resources/js/components/domain/academic/CatalogSection.vue:167` | Editar, Archivar/Reactivar | menú con varias acciones | CatalogActions |
| Carreras | `resources/js/components/domain/academic/CatalogSection.vue:262` | Editar, Archivar/Reactivar | menú con varias acciones | CatalogActions |
| Campus | `resources/js/components/domain/academic/CatalogSection.vue:353` | Editar, Archivar/Reactivar | menú con varias acciones | CatalogActions |
| Modalidades | `resources/js/components/domain/academic/CatalogSection.vue:446` | Editar, Archivar/Reactivar | menú con varias acciones | CatalogActions |
| Periodo / Código estable | `resources/js/components/domain/academic/CatalogSection.vue:532` | Editar, Archivar/Reactivar | menú con varias acciones | CatalogActions |
| Persona / Carrera | `resources/js/components/domain/academic/CoordinatorAssignmentsPanel.vue:91` | Archivar/Reactivar | solo archivar/reactivar | RecordStatusForm (coordinator_assignment) |
| Mallas | `resources/js/components/domain/academic/CurriculaTab.vue:122` | Editar, Publicar malla | menú con varias acciones | CareerAcademicActions, DropdownMenuItem |
| Materias | `resources/js/components/domain/academic/CurriculaTab.vue:245` | Editar, Archivar/Reactivar | menú con varias acciones | CareerAcademicActions |
| Ofertas académicas | `resources/js/components/domain/academic/OfferingsTab.vue:112` | Editar, Archivar/Reactivar | menú con varias acciones | CareerAcademicActions |
| Paralelos | `resources/js/components/domain/academic/OfferingsTab.vue:200` | Editar, Archivar/Reactivar | menú con varias acciones | CareerAcademicActions |
| Docente / Materia | `resources/js/components/domain/academic/TeacherAssignmentsPanel.vue:97` | Editar, Archivar/Reactivar | menú con varias acciones | CareerAcademicActions |
| Proceso / Cola | `resources/js/pages/Admin/Operations/Jobs.vue:231` | Reintentar | menú con una sola acción | DropdownMenuItem |
| Persona / Rol vigente | `resources/js/pages/Admin/Users/Index.vue:228` | Desactivar/Activar cuenta | menú con una sola acción | ManagedUserController.setStatus |
| Detalle de expedientes | `resources/js/pages/Coordination/Reports/Index.vue:348` | Abrir revisión | menú con una sola acción | DropdownMenuItem |
| Asignatura / Docente(s) | `resources/js/pages/Coordination/Reviews/Index.vue:134` | Abrir revisión | menú con una sola acción | DropdownMenuItem |
| Solicitud / Estado | `resources/js/pages/Syllabi/Documents.vue:272` | Descargar DOCX, Descargar PDF | menú con varias acciones | DropdownMenuItem, descarga autorizada |

## Tablas sin columna de acciones

| Tabla | Archivo |
| --- | --- |
| Fecha / Actor y rol | `resources/js/pages/Admin/Operations/Audit.vue:213` |
| Plantilla / Alcance | `resources/js/pages/Admin/Templates/Index.vue:118` |
| Historial de roles y vigencias | `resources/js/pages/Admin/Users/Show.vue:183` |
| Convocatoria / Periodo | `resources/js/pages/Coordination/Convocations/Index.vue:141` |
| Seguimiento por expediente | `resources/js/pages/Coordination/Convocations/Show.vue:287` |
| Distribución por convocatoria | `resources/js/pages/Coordination/Reports/Index.vue:290` |
| Fuente / Autoridad y responsable | `resources/js/pages/Sources/Index.vue:130` |
| Asignatura / Convocatoria | `resources/js/pages/Teacher/Syllabi/Index.vue:147` |
