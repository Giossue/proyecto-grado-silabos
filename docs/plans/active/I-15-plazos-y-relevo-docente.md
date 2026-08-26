# I-15: Plazos operables y relevo de docente

## Estado

Implementado y verificado el 2026-08-26. La verificación completa pasa en verde: **204
pruebas y 2148 aserciones**, con `pint`, `phpstan` sin errores, `eslint`, `prettier`,
`vue-tsc`, `vite build` y el esquema recreado desde cero con `migrate:fresh --seed`.

## Motivo

La consulta del 26 de agosto de 2026 cerró PV-06 y las puertas DT-08, DT-09 y DT-10, y
dejó al descubierto que tres comportamientos que el producto da por supuestos no existen
en el código.

El plazo de la convocatoria se guarda, se muestra y no hace nada: no tiene fecha de
inicio, no se puede modificar y nada lo compara con la fecha actual. El relevo de un
docente a mitad de periodo no es un acto del sistema, sino dos operaciones sueltas sobre
vigencias que nadie relaciona. Y la coordinación encargada no se distingue de la titular.

El respaldo institucional confirma que el vacío es real y no un descuido del diseño: en
SIANET el sílabo es un archivo colgado de la fila del docente, con su cédula en el nombre,
y en el calendario académico no existe ningún evento de sílabos entre 412 registros.

## Trazabilidad

- RF-003..006 (usuarios, roles y vigencias), RF-017..028 (convocatorias y borradores).
- RN-001..004 (alcance por rol y carrera); CU-02, CU-03, CU-05.
- Decisiones de origen: `references/entrevista-2026-08-26-hallazgos.md`.
- Normativa que lo sustenta: `references/normativa-silabo.md`.
- Puertas cerradas que habilitan el trabajo: PV-06, DT-08, DT-09, DT-10.
- Puerta con valor provisional: DT-11 (`per_offering` se conserva).

### Puertas abiertas que este plan no puede tocar

- **PV-16**, edición excepcional de contenido por coordinador. El relevo cambia quién es
  responsable de un sílabo; no habilita al coordinador a editar su contenido.
- **PV-07** y **PV-08**, DOCX oficial y fórmulas. La exportación debe mostrar al docente
  vigente, pero el motor y el formato siguen fuera de alcance.

## Resultado demostrable

Un coordinador abre una convocatoria con fecha de inicio y fecha límite propias. Vencido
el plazo, un docente no puede enviar. El coordinador prorroga con un motivo escrito y el
envío vuelve a habilitarse. Cuando un docente deja de estar en servicio, el coordinador
traspasa el sílabo a otro en un solo acto que cierra la vigencia anterior, abre la nueva,
registra el documento que lo respalda y deja el expediente en el estado que corresponda.
Una coordinación encargada opera con las mismas atribuciones que la titular y su
designación consta con duración y sustento.

## Alcance

### 1. La convocatoria tiene inicio y límite

`fechas_limite_convocatoria` ya admite varias etapas por convocatoria con su
`(convocatoria_id, etapa)` único. Se añade la etapa de inicio junto a la de entrega, en
lugar de una columna nueva.

- `CreateConvocation` escribe ambas fechas.
- `StoreConvocationRequest` valida que el inicio sea anterior al límite.
- La pantalla de creación pide las dos.

### 2. Prórroga del plazo

- Acción nueva que modifica `vence_en` de una etapa, con motivo obligatorio.
- Solo el coordinador de la carrera de la convocatoria.
- Evento de auditoría con la fecha anterior, la nueva y el motivo. La fecha original no se
  pierde: se conserva en el evento, que es inmutable.

### 3. El plazo bloquea

- El envío y el reenvío verifican la fecha límite vigente de la convocatoria.
- El rechazo explica que el plazo venció e indica que corresponde solicitar prórroga; no
  filtra nada que el docente no pudiera ver ya.
- La verificación vive en la política o en la acción de envío, no en el controlador.

### 4. Relevo de docente

Un acto explícito, transaccional, que reemplaza la secuencia manual de cerrar una vigencia
y abrir otra:

- Cierra la asignación docente vigente y abre la del reemplazo sobre el mismo paralelo.
- Registra la referencia del acto que lo respalda: tipo, número y fecha.
- Si el sílabo estaba aprobado, lo reabre conservando la revisión aprobada intacta, según
  ADR-0005.
- Si el sílabo estaba en borrador sin enviar, **descarta el contenido** y el nuevo docente
  empieza limpio, según DT-08. El evento de auditoría conserva el porcentaje de
  completitud descartado para que la pérdida sea rastreable.
- Si el sílabo estaba en revisión, se detiene y pide resolver la revisión primero. No se
  traspasa un expediente que otra persona está evaluando.

### 5. Coordinación encargada

- La asignación de coordinador distingue titular de encargado y guarda el sustento
  documental, según DT-09 y D2.
- Las atribuciones son las mismas: D3 fijó que sus aprobaciones siguen siendo válidas sin
  condición cuando vuelve el titular. No se añade ninguna restricción de permisos.
- La restricción de no solapamiento por carrera se conserva tal cual: para designar a un
  encargado hay que cerrar la vigencia del titular.

### 6. Marca de autoaprobación

DT-10 permite que quien redacta apruebe. No se impide, pero el evento de auditoría de la
aprobación distingue el caso para que sea consultable en lugar de reconstruible.

### 7. Un sílabo por paralelo como norma

`per_parallel` pasa a ser el valor por defecto al crear una convocatoria. `per_offering`
se conserva disponible, según DT-11: ninguna norma fija el criterio y retirarlo
comprometería el producto con una decisión que la carrera puede cambiar.

## Decisiones

- **La fecha de inicio es una etapa, no una columna.** `fechas_limite_convocatoria` ya
  modela etapas con vencimiento. Añadir una columna `inicia_en` a `convocatorias`
  duplicaría el concepto y dejaría dos sitios donde buscar una fecha.
- **La prórroga no reescribe la historia.** `vence_en` se actualiza, pero el valor anterior
  queda en el evento de auditoría. Sin eso no se puede demostrar que hubo prórroga ni
  cuándo.
- **El relevo es una sola transacción.** Cerrar la vigencia y abrir la nueva por separado
  deja una ventana en la que el sílabo no tiene responsable, y `OpenConvocation` ya
  rechaza los paralelos sin docente vigente.
- **Un expediente en revisión no se traspasa.** No lo dijo la entrevista; se deduce de que
  una revisión es trabajo de un coordinador sobre contenido enviado por una persona
  concreta. Se implementa como rechazo explícito, no como decisión silenciosa, para que
  aparezca si la regla resulta equivocada.

## Pasos verificables

1. Etapa de inicio en la convocatoria, con validación y pantalla.
2. Prórroga con motivo, autorización y auditoría.
3. Bloqueo de envío por plazo vencido.
4. Relevo de docente en los cuatro estados posibles del expediente.
5. Coordinación encargada con sustento documental.
6. Marca de autoaprobación en el evento existente.
7. `per_parallel` como valor por defecto.

Cada paso entrega migración, acción, política, interfaz, pruebas y documentación juntas.
No se avanza al siguiente con `composer verify` en rojo.

## Verificación

- Pruebas de plazo: envío antes del inicio, dentro de plazo, vencido y tras la prórroga.
- Pruebas de relevo: expediente sin iniciar, en borrador, en revisión y aprobado.
- Pruebas de autorización: un coordinador de otra carrera no prorroga ni traspasa; un
  docente tampoco.
- Prueba de que la prórroga conserva la fecha anterior en auditoría.
- Prueba de que el descarte de un borrador deja constancia del avance perdido.
- `composer verify` completo y `migrate:fresh --seed` sobre esquema vacío.

## Defecto encontrado durante la implementación

`fechas_limite_convocatoria` tenía una restricción `CHECK` sobre `etapa` que solo admitía
`draft`, `review` y `correction`. Modelar el inicio como etapa la violaba, y la
convocatoria fallaba con error 500 al crearse. La migración de I-15 amplía la restricción
en lugar de retirarla: el dominio de valores sigue cerrado y el error habría reaparecido
con cualquier etapa futura.

Es un argumento a favor de la decisión de modelar el inicio como etapa: la base ya tenía
opinión sobre qué etapas existen, y añadir una columna suelta la habría esquivado.

## Fuera de alcance

- Notificar por correo al docente entrante o saliente. Depende de PV-15.
- Que el coordinador edite contenido del sílabo. Depende de PV-16.
- Que la exportación cambie de motor o formato. Depende de PV-07.
- Importar acciones de personal desde SIANET. El sustento documental se captura a mano:
  los datos de la fuente llegan hasta 2012 y no sirven para operar.

## Riesgo asumido

DT-08 destruye trabajo sin vuelta atrás y DT-10 permite que quien redacta apruebe. Ambas
se ratificaron tras exponer el riesgo. Quedan implementadas como se decidió, con las
mitigaciones de auditoría anotadas arriba, y son reversibles: recuperar el borrador
descartado no, pero dejar de descartarlo sí.
