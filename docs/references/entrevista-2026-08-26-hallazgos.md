# Hallazgos de la consulta del 26 de agosto de 2026

Síntesis de las respuestas al guion `entrevista-decisiones-abiertas.md`. Cada fila indica
qué se decidió, con qué alcance y qué cambia en el sistema.

**Procedencia.** Las respuestas provienen del tutor del proyecto de grado, no de una
autoridad institucional de la UEB. Para efectos del proyecto cierran alcance y son
vinculantes; para efectos institucionales siguen siendo **propuestas**, salvo las que se
apoyan además en evidencia del respaldo de SIANET. Donde ambas cosas coinciden se indica.

---

## A. Titularidad del sílabo

### A1 — El sílabo pertenece a la asignatura, no al docente

**Decidido.** Es el mismo documento. Al asignar la materia a otro docente, este recibe el
sílabo del anterior con lo que ya tuviera hecho, y hace ajustes menores o lo deja como
está según los comentarios del coordinador.

Confirma el supuesto del modelo actual: `silabos` se identifica por convocatoria,
asignatura y versión de malla, y el docente entra por `alcances_silabo` → `paralelos` →
`asignaciones_docente`. **No requiere trabajo.**

Deja de depender solo de la entrevista: el Reglamento del Sistema de Evaluación Estudiantil
de la UEB de 2021 dice «sílabo **de asignatura**». Ver `normativa-silabo.md`.

Es también el punto donde el sistema se separa de SIANET, que nombraba el archivo con la
cédula del docente y obligaba a empezar de cero en cada relevo.

### A2 — Un sílabo por paralelo — cierra PV-06

**Decidido.** Uno por paralelo, aunque el contenido sea idéntico.

Ninguna norma nacional ni de la UEB menciona paralelos a propósito del sílabo, así que es
una definición operativa de la carrera y no cumplimiento normativo. Ver
`normativa-silabo.md`.

El modo `per_parallel` ya existe y `OpenConvocation` lo implementa: genera un sílabo por
cada paralelo activo de la oferta. Lo que cambia es su condición: deja de ser una opción
entre dos y pasa a ser la regla. **Trabajo pendiente:** decidir si `per_offering` se
retira del dominio, se conserva como excepción autorizada o queda inaccesible en la
interfaz.

---

## B. Salida o reemplazo del docente

### B1 — Sílabo aprobado: se reabre con el contenido heredado

**Decidido.** Se reabre para que el nuevo docente lo adapte, y llega con los datos que
llenó el anterior.

La reapertura ya existe y conserva la revisión aprobada intacta, según ADR-0005. Lo que
falta es que el relevo de docente sea capaz de dispararla.

### B2 — Borrador sin enviar: se descarta

**Decidido.** El borrador se descarta y el nuevo docente empieza limpio.

**Resuelto el 2026-08-26 (DT-08).** Se planteó la tensión con A1 —que dice que el nuevo
docente recibe «lo que tenga hecho» el anterior— y la advertencia de que descartar un
borrador destruye trabajo y no se deshace. Se ratificó la respuesta: **se descarta**. La
regla queda entonces: lo enviado se hereda porque es evidencia institucional; el borrador
sin enviar no, porque es trabajo privado.

El traspaso debe dejar constancia en auditoría de que se descartó un borrador, con su
porcentaje de avance, para que la pérdida sea rastreable.

### B3 — El relevo lo autoriza coordinación, con sustento documental

**Decidido.** El coordinador de carrera, sustentado en una acción de personal o
resolución.

Coincide con la fuente institucional: `accion_personal` en SIANET tipifica `RENUNCIA`,
`CESACION`, `LICENCIA` y `PERMISO` con fechas de inicio y fin. **Trabajo pendiente:** el
traspaso debe registrar la referencia al acto que lo sustenta.

### B4 — Basta con que conste el docente vigente

**Decidido.** En el documento consta el docente actual, no la cadena de quienes pasaron.

El historial interno se conserva de todos modos: cada envío es una revisión inmutable con
su autor, y eso no se negocia porque es lo que sostiene la auditoría. La decisión afecta
solo a qué se imprime en el sílabo exportado. **No requiere trabajo**, salvo verificar que
la exportación tome el docente vigente y no el autor de la primera revisión.

---

## C. Plazos y prórrogas

### C1 — El coordinador fija inicio y límite propios

**Decidido.** Existe la referencia del calendario académico, pero quien opera es el
coordinador: establece una fecha personalizada de inicio y una de límite por convocatoria,
tal como funciona hoy.

**Trabajo pendiente.** La convocatoria solo guarda una fecha límite (`etapa = 'draft'` en
`fechas_limite_convocatoria`). **No existe fecha de inicio.** Hay que añadirla.

Nota de evidencia: en el calendario académico de SIANET no hay ningún evento de sílabos
entre sus 412 registros. La referencia institucional que menciona la respuesta no está en
los datos, así que el plazo operativo es el que fije el coordinador.

Sí existe anclaje normativo: el reglamento de 2021 exige que la planificación esté
programada «antes de iniciar el periodo académico» y que los criterios del sílabo se
presenten en la primera sesión de clase. El plazo del coordinador es la forma de cumplirlo.
Ver `normativa-silabo.md`.

### C2 — El coordinador puede prorrogar

**Decidido.** Sí, y de forma explícita para el caso extraordinario: cuando un docente se
ausenta y el plazo ya venció, hay que poder cambiar de docente **y** extender el plazo.

**Trabajo pendiente.** Hoy `vence_en` se escribe al crear la convocatoria y no existe
ninguna acción que lo modifique. Hace falta una prórroga con motivo y auditoría.

### C3 — El plazo del reemplazo lo decide coordinación

**Decidido.** Caso por caso, a criterio del coordinador.

Se implementa como consecuencia de C2: si puede prorrogar, puede darle plazo nuevo o
mantener el original.

### C4 — Vencido el plazo, el sistema bloquea

**Decidido.** El envío se bloquea y el coordinador extiende el tiempo para esos casos.

**Trabajo pendiente.** Nada compara hoy `vence_en` con la fecha actual: el plazo se guarda,
se muestra y no impide nada.

---

## D. Coordinación encargada

### D1 — La figura de encargado se construye

**Decidido.** Se marcó «con nombramiento y duración propios», inicialmente con la salvedad
literal de «creo». Repreguntado el 2026-08-26 (DT-08 a DT-10), se ratificó: **se construye
como figura propia**, distinta del titular.

La evidencia la respalda: el catálogo de dignidades de SIANET duplica los cargos con el
sufijo `(E)` y `docente_dignidad` guarda duración y el código de la acción de personal que
los sustenta. La reserva que subsiste es que el cargo de coordinador de carrera no aparece
en ese catálogo, así que el precedente es conceptual y no literal.

### D2 — El encargo se respalda con una acción de personal

**Decidido.** Una acción de personal o resolución con fecha de inicio y fin.

Coherente con D1 y con la fuente. Se implementa junto con D1, que quedó confirmada.

### D3 — Las aprobaciones del encargado siguen siendo válidas

**Decidido.** Sí, sin condición, aunque vuelva el titular.

El modelo ya lo cumple sin trabajo adicional: una aprobación apunta a una revisión concreta
y una reapertura no altera la aprobación previa. **No requiere trabajo.**

### D4 — El coordinador también entrega sílabos como docente

**Decidido.** Sí, es lo normal y debe poder hacerlo.

**Resuelto el 2026-08-26 (DT-10).** Se repreguntó distinguiendo entregar de aprobar, y se
advirtió que un tribunal puede cuestionar que quien redacta sea quien aprueba. Se ratificó
la respuesta: **sí, sin restricción**. El sistema no impide la autoaprobación.

Mitigación acordada: el evento de auditoría marca de forma distinguible la aprobación de un
sílabo por quien lo redactó, de modo que el dato esté disponible si alguien lo pregunta en
lugar de tener que reconstruirlo.

---

## E. Procedencia y forma de trabajo

### E1 — El proyecto opera como funciona hoy

**Decidido.** Existen documentos, pero el proyecto opera como funciona hoy: el
administrador o el coordinador establecen las fechas.

**Corrección posterior.** La búsqueda del 2026-08-26 sí localizó una norma vigente y
citable: el Reglamento del Sistema de Evaluación Estudiantil de la UEB de 2021 exige que la
planificación microcurricular esté programada antes de iniciar el periodo académico. Los
plazos concretos siguen siendo configuración de coordinación, pero la obligación de que el
sílabo exista antes del inicio sí es normativa. Ver `normativa-silabo.md`.

### E2 — Documentar lo no confirmado es la forma correcta

**Decidido.** Sí. Se mantiene el registro de puertas abiertas con su alternativa reversible.

---

## Resumen de impacto

### Ya cubierto por el sistema

| Decisión | Por qué no requiere trabajo |
|---|---|
| A1 | El sílabo se identifica por convocatoria, asignatura y malla, no por docente |
| A2 | El modo `per_parallel` ya está implementado en `OpenConvocation` |
| B4 | Cada envío es una revisión inmutable con autor |
| D3 | La aprobación apunta a una revisión y la reapertura no la altera |

### Trabajo nuevo

| # | Qué | Origen |
|---|---|---|
| 1 | Fecha de inicio de la convocatoria | C1 |
| 2 | Prórroga del plazo, con motivo y auditoría | C2, C3 |
| 3 | Bloqueo de envío al vencer el plazo | C4 |
| 4 | Traspaso de docente como acto explícito, con referencia al sustento | B1, B2, B3 |
| 5 | `per_parallel` como regla y destino de `per_offering` | A2 |
| 6 | Coordinación encargada como figura propia, con duración y sustento | D1, D2 |
| 7 | Marca en auditoría de la aprobación por el propio autor | D4 |

### Resuelto en la repregunta del 2026-08-26

| Puerta | Se preguntó | Se decidió |
|---|---|---|
| DT-08 | Si el borrador sin enviar se hereda o se descarta | Se descarta; el nuevo docente empieza limpio |
| DT-09 | Si se construye la figura de coordinación encargada | Sí, como figura propia |
| DT-10 | Si el coordinador puede aprobar su propio sílabo | Sí, sin restricción |

En los tres casos se expuso antes el riesgo y se ratificó la respuesta. Quedan implementados
tal como se decidió, con las mitigaciones anotadas en cada apartado.

### Sigue abierto

**Destino del modo que agrupa varios paralelos en un sílabo (`per_offering`).** Se propuso
conservarlo disponible con `per_parallel` como valor por defecto, dado que ninguna norma fija
el criterio y retirarlo comprometería el producto con una decisión que la carrera puede
cambiar. Sin respuesta todavía.
