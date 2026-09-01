# Decisiones pendientes y puertas

## Registro oficial PV-01 a PV-20

| ID | Decisión | Responsable esperado | Puerta |
|---|---|---|---|
| PV-01 | Autoridad que emite, aprueba y publica la plantilla | Coordinación/autoridad | P0 I-02 |
| PV-02 | Precedencia entre malla, proyecto, guías y disposiciones | Autoridad académica | Reducida en I-26 (2026-09-01): las fuentes son documentos sin comparación automática; la precedencia queda como criterio editorial de Coordinación |
| PV-03 | Periodo exacto de pilotaje y aceptación | Dirección/coordinación | P1 I-08 |
| PV-04 | Responsable de aceptación funcional | Dirección/coordinación | P1 aceptación |
| PV-05 | Cantidad real de docentes, paralelos, asignaciones y sílabos | Coordinación | P1 capacidad/I-03 |
| PV-06 | Excepciones de sílabo separado por paralelo | Coordinación | Cerrada el 2026-08-26 |
| PV-07 | DOCX oficial y reglas de exportación | Autoridad de plantilla | P0 motor final I-02/I-05 |
| PV-08 | Fórmula/redondeo oficial de horas, créditos y totales | Coordinación/fuente | P0 cálculos I-02/I-03 |
| PV-09 | Acceso, esquema y calidad de base institucional | Personal técnico | Cerrada en I-11 el 2026-08-18; sin objeto desde el 2026-08-27 |
| PV-10 | Identificadores institucionales únicos | Personal técnico | Cerrada en I-11 el 2026-08-18; sin objeto desde el 2026-08-27 |
| PV-11 | Conservación, backup, RPO y RTO | Técnico/autoridad | P2 producción |
| PV-12 | Base legal, finalidad y aviso de privacidad | UEB/datos | P0 datos sensibles, P2 producción |
| PV-13 | Hardware disponible para IA local | Personal técnico/autores | P0 selección IA |
| PV-14 | Modelos locales de embeddings y generación | Autores/evaluación experta | P0 implementación IA final |
| PV-15 | Correo institucional y contenido de avisos | Técnico/coordinación | P1 notificación externa; mecanismo listo, transporte en `log` |
| PV-16 | Edición excepcional de contenido por coordinador | Coordinación | P0 permisos I-04 |
| PV-17 | Instrumento/población para medir proceso actual | Dirección/autores | P1 línea base |
| PV-18 | Umbrales de utilidad y precisión de IA | Coordinación/docentes expertos | P1 aceptación IA |
| PV-19 | Navegadores y dispositivos reales | Técnico/usuarios | P1 matriz UX |
| PV-20 | Línea, sublínea, director, pares y fechas académicas | Integración Curricular | P1 documentación |

## Decisiones técnicas adicionales

Estas no reemplazan los PV de la SRS:

| ID local | Decisión | Valor temporal seguro | Puerta |
|---|---|---|---|
| DT-01 | Registro público, cuentas administradas o SSO | Registro público desactivado; interfaz sustituible | Antes de aceptar I-01 |
| DT-02 | Runner y scripts exactos de pruebas | Los generados por starter; `php artisan test` canónico | I-00 |
| DT-03 | Motor DOCX/PDF | Puerto + fake; selección por spike con PV-07 | I-05 |
| DT-04 | Proveedor de archivos | Laravel Filesystem privado | Antes de staging |
| DT-05 | Herramienta de análisis estático/cobertura | Evaluar en I-00 | I-00 |
| DT-06 | Estrategia exacta de concurrencia del editor | `version_bloqueo` propuesto; probar colaboración | Antes de I-03 |
| DT-07 | Estado inicial después de reapertura | `correccion_solicitada` provisional según ADR-0005; probar con usuarios | Aceptación I-04/I-08 |
| DT-08 | Destino del borrador sin enviar cuando cambia el docente | Se descarta; el nuevo empieza limpio | Cerrada el 2026-08-26 |
| DT-09 | Coordinación encargada como figura propia | Se construye, con duración y sustento documental | Cerrada el 2026-08-26 |
| DT-10 | Autoaprobación del sílabo por quien lo redactó | Permitida, marcada de forma distinguible en auditoría | Cerrada el 2026-08-26 |
| DT-11 | Destino del modo `por_oferta` tras cerrar PV-06 | Conservado; `por_paralelo` es el valor por defecto | Cerrada el 2026-08-26 en I-15 |

## Entrevistas pendientes

Las entrevistas no se falsifican ni se completan con supuestos. Cuando los participantes
estén disponibles:

1. usar los instrumentos del artefacto 03;
2. obtener consentimiento y evitar datos personales innecesarios;
3. registrar fecha, rol y evidencia de forma controlada;
4. sintetizar hallazgos, no publicar transcripciones sensibles en el repositorio;
5. relacionar cada hallazgo con RF/RN/PV afectado;
6. actualizar SRS, modelos, prototipos, pruebas y esta documentación;
7. registrar cambios incompatibles mediante ADR y plan de migración.

## Regla de bloqueo

Si una tarea toca una fila cuya puerta es P0, el agente debe usar el valor temporal seguro
documentado o detener esa parte. Nunca decide en nombre de la autoridad esperada.

## Puertas cerradas

### PV-09 — Acceso, esquema y calidad de base institucional

Cerrada el 2026-08-18 por decisión explícita del responsable del producto, con el acceso
al respaldo `sianet3_24-06-25-00H07.sql` de la base `bdsianet` (PostgreSQL 10.23), corte
del 23 de junio de 2025. El esquema quedó verificado sobre datos: 190 tablas, 5 vistas,
82 claves ajenas y 45,5 millones de filas.

La calidad quedó caracterizada y no es buena: `contenido`, `unidad` y `tema` no tienen
ninguna clave ajena; `asignatura_docente.centro` y `.modalidad` son texto libre que no
respeta el catálogo `centro`; `malla.vigencia` incluye un valor `1 ` fuera de dominio; y
332 de 4939 códigos de asignatura contienen paréntesis. La importación asumía datos sucios
y valida en el mapper.

Queda fuera de esta puerta la frecuencia de actualización y el acceso de red productivo:
el sistema sigue leyendo de un fixture y no se conecta a la fuente.

### PV-10 — Identificadores institucionales únicos

Cerrada el 2026-08-18 por decisión explícita del responsable del producto. La identidad
canónica de una materia es `asignaturas.cod_oculto`: es la clave primaria real y el
destino de todas las claves ajenas de la fuente. `cod_asig` es solo el código visible y no
sirve para reconciliar. La identidad del docente es `docente.ci_doc`, y
`asignatura_docente.cod_asig_doc` la deriva con el formato `{cédula}-{secuencial}`.

El reconciliador que implementaba esa regla se retiró con el módulo el 2026-08-27.
El conflicto queda reservado a la referencia externa duplicada y a la ambigüedad real.

### PV-06 — Excepciones de sílabo separado por paralelo

Cerrada el 2026-08-26 en la consulta registrada en
`references/entrevista-2026-08-26-hallazgos.md`. La regla es un sílabo por paralelo,
aunque el contenido sea idéntico. El modo `por_paralelo` deja de ser una opción y pasa a
ser el comportamiento esperado; queda por decidir si `por_oferta` se retira del dominio
o se conserva como excepción autorizada.

### Riesgo asumido

PV-09 y PV-10 se cerraron sobre evidencia técnica directa —un respaldo del 23 de junio de
2025—, no sobre confirmación escrita de la UEB ni sobre la base viva. Esa exposición es la
razón por la que el 2026-08-27 se retiró el módulo de importación: sin garantía de que la
estructura de hoy sea esa, y sin base legal escrita para tratar datos de personas
(`PV-12`), no había forma de encenderlo. Ambas quedan sin objeto mientras el sistema no
vuelva a plantearse leer de SIANET. La estructura académica que se alineó en I-11 se
conserva: describe cómo se organiza la universidad, y eso no dependía de la importación.

PV-06 se cierra sobre la respuesta del tutor del proyecto, no de una autoridad académica de
la UEB. Cierra alcance para el proyecto de grado; no constituye normativa institucional.

DT-08, DT-09 y DT-10 se cerraron el 2026-08-26 tras exponer el riesgo de cada una y recibir
ratificación explícita. DT-08 destruye trabajo sin vuelta atrás y DT-10 permite que quien
redacta apruebe: ambas quedan documentadas con su mitigación en
`references/entrevista-2026-08-26-hallazgos.md` para que la decisión sea rastreable.

La obligación de que el sílabo exista antes de iniciar el periodo académico sí tiene
respaldo normativo vigente, recogido en `references/normativa-silabo.md`.
