# Auditoría de acciones en tablas

Fecha: 2026-08-30.

## Conclusión

La percepción de que casi todas las tablas solo ofrecen **Archivar** no se confirma en
todo el sistema, pero sí revela un problema real: se usa el menú de tres puntos incluso
cuando solo existe una acción efectiva.

- Se encontraron **24 tablas**.
- **16** tienen una columna `Acciones`.
- **4 de 16** (25 %) solo permiten Archivar/Reactivar.
- **5 de 16** tienen otra única acción.
- En total, **9 de 16** (56,25 %) muestran un menú para una sola acción efectiva.
- Entre las cuatro pantallas académicas recién separadas, **3 de 4** (75 %) solo permiten
  Archivar/Reactivar: Materias, Ofertas y Paralelos. Mallas solo permite Publicar mientras
  la versión está en borrador.

El problema principal no es que el 99 % archive, sino que más de la mitad de los menús de
acciones agregan un clic sin ofrecer una elección real.

## Causa encontrada

`RecordStatusForm.vue` implementa únicamente Archivar/Reactivar. En las tablas de Materias,
Ofertas, Paralelos y asignaciones de Coordinador se monta como único hijo de
`TableActionsMenu.vue`.

Además, las rutas académicas del Coordinador solo exponen creación y cambio de estado:

- `POST coordinacion/estructura-academica/{entity}`.
- `PATCH coordinacion/estructura-academica/{entity}/{record}/estado`.

`CareerAcademicStructureController` no dispone actualmente de una operación `update` para
Materia, Oferta, Paralelo o asignación. En cambio, la gestión global del Administrador sí
tiene actualización y sus cinco catálogos muestran **Editar + Archivar/Reactivar**.

Por tanto, agregar **Editar** a las tablas del Coordinador no es un ajuste visual: requiere
definir qué campos siguen siendo modificables, autorización, validación, auditoría y una
acción de aplicación. No debe inventarse como comportamiento confirmado.

## Recomendación

1. Conservar el menú de tres puntos solo cuando haya dos o más acciones reales:
   Facultades, Carreras, Campus, Modalidades, Periodos académicos, Asignación docente y
   Documentos.
2. Mostrar una acción directa, con estado pendiente y nombre accesible, cuando solo exista
   una mutación: Archivar/Reactivar, Publicar malla, Reintentar o Activar/Desactivar cuenta.
3. Convertir la entidad principal en enlace y retirar la columna `Acciones` cuando la única
   operación sea navegar: Abrir revisión en Informes y Revisión.
4. Evaluar **Editar** para Materia, Oferta y Paralelo como una decisión funcional separada;
   no mezclarla con esta limpieza de interfaz.
5. Mantener Archivar/Reactivar como operación reversible; no sustituirla por borrado.

## Tablas con columna de acciones

| Tabla | Archivo | Acciones detectadas | Clasificación |
| --- | --- | --- | --- |
| Facultades | `resources/js/components/domain/academic/CatalogSection.vue:167` | Editar, Archivar/Reactivar | Varias acciones |
| Carreras | `resources/js/components/domain/academic/CatalogSection.vue:262` | Editar, Archivar/Reactivar | Varias acciones |
| Campus | `resources/js/components/domain/academic/CatalogSection.vue:353` | Editar, Archivar/Reactivar | Varias acciones |
| Modalidades | `resources/js/components/domain/academic/CatalogSection.vue:446` | Editar, Archivar/Reactivar | Varias acciones |
| Periodos académicos | `resources/js/components/domain/academic/CatalogSection.vue:532` | Editar, Archivar/Reactivar | Varias acciones |
| Asignaciones de Coordinador | `resources/js/components/domain/academic/CoordinatorAssignmentsPanel.vue:91` | Archivar/Reactivar | Solo estado |
| Mallas | `resources/js/components/domain/academic/CurriculaTab.vue:123` | Publicar malla | Una acción |
| Materias | `resources/js/components/domain/academic/CurriculaTab.vue:243` | Archivar/Reactivar | Solo estado |
| Ofertas académicas | `resources/js/components/domain/academic/OfferingsTab.vue:113` | Archivar/Reactivar | Solo estado |
| Paralelos | `resources/js/components/domain/academic/OfferingsTab.vue:204` | Archivar/Reactivar | Solo estado |
| Asignaciones docentes | `resources/js/components/domain/academic/TeacherAssignmentsPanel.vue:96` | Editar datos, Archivar/Reactivar | Varias acciones |
| Procesos | `resources/js/pages/Admin/Operations/Jobs.vue:231` | Reintentar | Una acción condicional |
| Usuarios | `resources/js/pages/Admin/Users/Index.vue:228` | Desactivar/Activar cuenta | Una acción |
| Detalle de informes | `resources/js/pages/Coordination/Reports/Index.vue:348` | Abrir revisión | Una acción de navegación |
| Cola de revisión | `resources/js/pages/Coordination/Reviews/Index.vue:134` | Abrir revisión | Una acción de navegación |
| Documentos | `resources/js/pages/Syllabi/Documents.vue:272` | Descargar DOCX, Descargar PDF | Varias acciones |

## Tablas sin columna de acciones

| Tabla | Archivo |
| --- | --- |
| Auditoría | `resources/js/pages/Admin/Operations/Audit.vue:213` |
| Plantillas | `resources/js/pages/Admin/Templates/Index.vue:118` |
| Historial de roles | `resources/js/pages/Admin/Users/Show.vue:177` |
| Convocatorias | `resources/js/pages/Coordination/Convocations/Index.vue:141` |
| Seguimiento de convocatoria | `resources/js/pages/Coordination/Convocations/Show.vue:287` |
| Distribución del informe | `resources/js/pages/Coordination/Reports/Index.vue:290` |
| Fuentes académicas | `resources/js/pages/Sources/Index.vue:130` |
| Sílabos del docente | `resources/js/pages/Teacher/Syllabi/Index.vue:147` |

## Reproducción

Ejecutar desde la raíz del repositorio:

```bash
python3 temp/audit_table_actions.py
```

El script recorre `resources/js/**/*.vue`, localiza cada componente `Table`, identifica la
columna `Acciones`, descarta opciones deshabilitadas que solo informan ausencia de acción y
clasifica los componentes/etiquetas encontrados. Es un análisis estático; el informe
anterior añade la verificación manual de rutas y controladores.
