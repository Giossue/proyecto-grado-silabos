# I-68: Logos del sílabo y puesta en marcha de la facultad

## Objetivo

Mostrar el encabezado institucional antes del título de la plantilla y trasladar la
configuración del logo de facultad al Panel de Coordinación, sin crear una entrada de
navegación.

## Estado

Implementado el 2026-09-10.

## Trazabilidad

- RF-017..033, RF-034..045; RN-009..012; CU-04 y CU-06; UI-01, ADM-04, ADM-06,
  COR-01..03.
- Decisión del responsable del producto del 2026-09-10: el logo es opcional al registrar
  una facultad desde Administración, pero Coordinación debe configurarlo desde «Puesta en
  marcha» antes de abrir su convocatoria.

## Plan

- [x] Mostrar los logos institucional y de facultad antes del título raíz en la hoja.
- [x] Hacer opcional el logo en el alta administrativa de facultades.
- [x] Añadir el paso y diálogo de carga al Panel de Coordinación.
- [x] Autorizar la carga únicamente sobre la facultad de la carrera activa y auditarla.
- [x] Bloquear la apertura de la convocatoria si falta el archivo configurado.
- [x] Cubrir proyección, permisos, validación y apertura con pruebas.

## Verificación

- 410 de 412 pruebas PHP pasan; las dos restantes son fallos previos de
  `TemplateTableEditor.vue` sobre placeholder y reapertura de Sheet, ajenos a I-68.
- ESLint, TypeScript, PHPStan focalizado y build de Vite aprobados.
- La prueba Chromium queda pendiente porque Playwright no está instalado en el entorno.
