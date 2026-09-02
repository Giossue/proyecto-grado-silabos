# I-32: Plantilla y malla sin versiones, con borrado confirmado del trabajo en curso

## Estado

Implementado el 2026-09-02; verificación local y migración remota registradas al pie.

## Trazabilidad

- RF-017..026 (plantilla), RF-008..016 (malla), RF-034..044 (convocatoria y borrador);
  RN-009..012, RN-017..024; CU-03, CU-04, CU-06, CU-07; ADM-05, ADM-06, COR-13.
- Decisión explícita del responsable del producto (2026-09-02): las versiones no aportan
  nada una vez que cada revisión guarda su copia; el trabajo en curso se borra cuando
  cambia la base, bajo responsabilidad de cada rol. `PV-01` y `PV-07` siguen abiertas.

## Resultado demostrable

- Una sola plantilla institucional, editable en el sitio. Sin «Publicar», sin «Crear
  nueva versión», sin menú «Versiones». La estructura se comprueba al abrir o reanudar
  el proceso.
- Una malla por carrera (`mallas`), sin número de versión ni marca de actual.
- Con la convocatoria pausada, un cambio estructural en la plantilla o en la malla
  pregunta «esto borrará N sílabos en curso» y, confirmado, los borra y guarda. Los
  sílabos ya enviados o con análisis de IA no se borran: la base los protege y el
  cambio se rechaza con explicación.
- Cada revisión enviada lleva su copia completa: estructura, valores y mapa de
  exportación. Los sílabos de procesos cerrados no se tocan.

## Decisiones y alcance

- Migración `000028`: conserva la última versión publicada de cada plantilla (o la
  última), descarta las demás y se detiene si algún expediente las usaba; renombra
  `versiones_malla` a `mallas` y exige una por carrera. No se revierte: se restaura el
  respaldo.
- La confirmación del borrado viaja como error de validación `purge_required` con la
  cifra; un diálogo único en el layout la captura y repite la petición con
  `confirm_purge`. Ningún formulario necesita conocer la regla.
- Solo disparan el borrado los cambios que el sílabo copia: secciones, bloques y campos
  de la plantilla; configuración, campos y materias de la malla. Relaciones y
  reubicación en el lienzo no borran nada.
- La pausa (I-31) sigue siendo la puerta: sin pausar no se edita.

## Pruebas

- Plantilla editable en el sitio; bloqueo con proceso abierto; borrado confirmado de
  borradores sin enviar al agregar una sección durante la pausa.
- Malla: borrado confirmado al cambiar su código con la convocatoria pausada.
- Regresión de todas las suites con `plantilla_id`, `malla_id` y `mallas`.

## Pasos

- [x] Migración y modelos sin versiones.
- [x] Acciones, validador de estructura y borrado confirmado.
- [x] Interfaz: plantilla en el sitio, proceso sin selector de plantilla, diálogo único.
- [x] Pruebas y documentación.
- [x] Verificación local completa.
- [ ] Migración remota: se ejecuta junto con el despliegue, porque retira tablas que el
  artefacto anterior consulta.

## Riesgos y reversión

- Destructiva: elimina `versiones_plantilla` y las columnas de versión de `mallas`.
  Respaldo previo conforme a `docs/security/hardening.md`; sin reversión automática.

## Evidencia de cierre local

- `php artisan migrate` aplicó `2026_09_02_000028_remove_versioning` en local.
- `php artisan test --compact`: 307 pruebas, 4.604 aserciones, en verde; incluye los
  casos nuevos de borrado confirmado de plantilla y malla en `SyllabusProcessTest` y la
  edición en el sitio en `TemplateAndSourceTest`.
- `./vendor/bin/pint --test`, `npm run lint:check`, `npm run types:check` y
  `npm run build`: en verde. `phpstan` conserva el error previo de I-30 en
  `ManagedUserController`.
- Pendiente remoto: respaldo y `migrate --force --isolated` **en el mismo momento del
  despliegue**. Comando en `docs/security/hardening.md`; la migración se detiene sola
  si encuentra expedientes apoyados en versiones no vigentes.
