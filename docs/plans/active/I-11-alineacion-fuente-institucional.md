# I-11: Alineación del esquema con la fuente institucional

## Estado

Implementado y verificado el 2026-08-18. Migraciones aplicadas sobre PostgreSQL 18.6 y
`composer verify` en verde: 152 pruebas, 1786 aserciones.

## Origen

Acceso concedido al respaldo `sianet3_24-06-25-00H07.sql`: pg_dump plano de la base
`bdsianet` (PostgreSQL 10.23), corte del 23 de junio de 2025, 190 tablas, 5 vistas,
82 claves ajenas y 45,5 millones de filas.

El análisis se hizo sobre datos, no sobre el DDL: el respaldo se recorrió por offsets de
bloque `COPY` sin restaurarlo, porque 12 de sus 16 GB son PDFs en `bytea` de
`sme_notas_vincu` y `sme_notas_suficiencia`, irrelevantes para el sílabo.

## Trazabilidad

- RF-008..016 y RF-016/RF-075 en la parte de importación.
- RN-005..008.
- CU-03 y CU-18.
- ADM-04 y ADM-08.
- PV-09 y PV-10 cerradas por esta entrega; PV-08 y PV-12 siguen abiertas.

## Hallazgos que motivan el cambio

| # | Hallazgo verificado en datos | Efecto |
|---|---|---|
| 1 | `periodo_lectivo.cod_carr` es obligatorio: 1462 periodos, 49 nombres distintos, 100 carreras, 49 vigentes a la vez | El periodo deja de ser catálogo global |
| 2 | La jerarquía es `facultad` → `escuela` → `carrera` | Se agrega el nivel `escuelas` |
| 3 | `horario.paralelo` cuelga de `asignatura_docente` | Se resuelve en el mapper: la oferta se deriva de asignatura, periodo, centro y modalidad |
| 4 | `asignaturas.cod_oculto` es la identidad real y `cod_asig` solo el código visible | Se agrega `codigo_oculto_institucional` |
| 5 | El ciclo vive en `detalles_malla.ciclo`; 21 asignaturas no tienen fila allí | `nivel` pasa a `ciclo` y admite ausencia |
| 6 | `malla` no tiene versión numérica, solo descripción y `vigencia` con valores `A `, `I ` y un `1 ` inválido | Se agregan `codigo_institucional` y `descripcion` |
| 7 | Las horas llegan en seis columnas: `horas_proy`, `horas_ap`, `horas_ac`, `horas_pae`, `horas_aa`, `horas_paec` | Se agrega el desglose |
| 8 | `asignatura_docente.centro` y `.modalidad` son texto libre; el catálogo `centro` no cubre MATRIZ, SAN MIGUEL ni LAS NAVES | Se agrega `alias_institucionales` y se conserva el catálogo normalizado |
| 9 | `asignaturas.secuencia` guarda el prerequisito entrecomillado, p. ej. `'2485'` | Se resuelve en el mapper |
| 10 | La identidad del docente es `ci_doc`; `cod_asig_doc` es `{cédula}-{secuencial}` | Se agregan `usuarios.documento_identidad` y `asignaciones_docente.codigo_institucional` |

Cotas adicionales que corrigen el contrato anterior: 332 de 4939 códigos de asignatura
contienen paréntesis, 248 nombres traen espacios en los bordes, `nom_asig` llega justo a
180 caracteres, los créditos van de 0 a 22 y el ciclo de 1 a 11.

## Decisión de alcance

Se adopta la vía híbrida por decisión explícita del responsable del producto:

- El esquema canónico cambia donde la fuente revela una realidad que el modelo no podía
  representar: escuela, periodo por carrera, doble identidad de asignatura, ciclo, malla
  institucional, desglose de horas e identidad del docente.
- El esquema **no** copia los defectos de la fuente. Campus y modalidad siguen siendo
  catálogos normalizados y el texto libre se traduce en `alias_institucionales`.

## Pasos

1. Migración `2026_08_18_000010_align_academic_schema_with_institutional_source`. Hecho.
2. Modelos `School`, `InstitutionalAlias` y ajuste de `Career`, `AcademicPeriod`,
   `Subject`, `CurriculumVersion`, `TeacherAssignment` y `User`. Hecho.
3. Renombrar `nivel` a `ciclo` en persistencia, acciones, consultas, seeder y pruebas,
   según la decisión ya confirmada de llamar ciclo a la posición curricular. Hecho.
4. `SianetAcademicRecordMapper` y `SianetIdentityReconciler` sustituyen al mapper y al
   reconciliador del contrato sintético. Hecho.
5. Liberar `assertProposal` para que la propuesta resuelva y no solo declare conflicto,
   ahora que PV-10 está cerrada. Hecho.
6. Fixture `anonymized-fixture-v2` y contrato `institutional-import-v2`. Hecho.
7. Pruebas `InstitutionalSchemaAlignmentTest` y actualización de
   `InstitutionalImportTest`. Hecho.
8. Ejecutar `composer verify` contra PostgreSQL. Hecho.
9. Corregir el punto de montaje de PostgreSQL en `compose.yaml`: la imagen `postgres:18`
   coloca los datos en un subdirectorio de `/var/lib/postgresql` y aborta si el volumen se
   monta en `/var/lib/postgresql/data`. El entorno local nunca se había levantado, así que
   el defecto estaba latente. Hecho.

## Límites que esta entrega no cruza

- La importación sigue en modo `simulation`; el constraint `modo = 'simulation'` continúa
  vigente y ningún catálogo académico se escribe desde la fuente.
- No se copia dato personal alguno: el fixture es sintético y el respaldo institucional
  no entra al repositorio.
- La expansión de las siglas de horas queda anotada como pendiente de PV-08.
- PV-12 sigue abierta: sin base legal ni aviso de privacidad no se incorporan personas.
