# I-72 — Asistente de IA contextual y revisión integral

## Estado

En preparación desde el 14 de septiembre de 2026. Este documento define el trabajo;
todavía no afirma que el chat, la revisión integral ni la herencia de configuración estén
implementados.

## Trazabilidad

- RF-037..054; CU-07 y CU-08; DOC-04, DOC-05 y DOC-06.
- RN-015, RN-016, RN-020..024 y RN-028..030.
- RNF-013, RNF-016, RNF-017, RNF-035 y RNF-036.
- UI docente del editor continuo de I-71 y configuración ADM-06/COR-02.
- PV-02, PV-13, PV-14 y PV-18 permanecen abiertas. No bloquean construir el contrato,
  los permisos, la interfaz, el simulador ni la degradación segura; sí bloquean declarar
  definitivo el modelo, la recuperación semántica y los umbrales de aceptación.

## Resultado demostrable

Administración define en cada campo de la plantilla el valor predeterminado **Usar IA**.
La Coordinación de cada carrera hereda esos valores, puede cambiarlos y el sistema
conserva su elección mientras no cambie la configuración de la plantilla. Cualquier
mutación posterior de la plantilla invalida esas excepciones y vuelve a mostrar los
nuevos valores administrativos.

Antes de iniciar el alcance de su carrera, Coordinación elige expresamente qué fuentes
académicas alimentarán la IA. Durante la edición, Docencia usa un único asistente lateral
para conversar sobre el sílabo y para recibir el resultado de una revisión integral. Las
respuestas mencionan la sección o campo evaluado y muestran las fuentes y extractos que
las sustentan. Ninguna sugerencia bloquea el envío ni se aplica sola.

## Decisiones confirmadas

1. `definiciones_campo.ia_habilitada` es el valor predeterminado fijado por
   Administración; no se añadirá un segundo interruptor administrativo.
2. La excepción de Coordinación pertenece a la carrera, no a la cuenta de la persona.
   Así sobrevive a un reemplazo de coordinador y se aplica a los siguientes alcances de
   esa carrera.
3. La excepción se identifica con la revisión de configuración de la plantilla en la que
   se guardó. Solo es efectiva si coincide con la revisión actual; si Administración
   cambia cualquier configuración, vuelve a regir el valor predeterminado.
4. «Cualquier configuración» incluye estructura, orden, campos, tablas, textos fijos,
   reglas, apariencia y opciones de IA de la plantilla. Los logos institucional y de
   facultad quedan fuera porque no son configuración de la plantilla.
5. Coordinación elige un subconjunto no vacío de sus fuentes activas antes de iniciar su
   alcance. `fuentes_convocatoria` conserva esa selección; deja de sincronizar todas las
   fuentes automáticamente. Una vez iniciado el alcance, la selección queda congelada.
6. El interruptor decide qué campos entran en la revisión de IA; no cambia si el campo es
   obligatorio, editable o válido y no altera la validación determinística.
7. El chat y la revisión usan el mismo ensamblador de contexto y la misma evidencia. El
   chat no es una vía alternativa para saltarse campos deshabilitados, fuentes no
   seleccionadas, permisos ni límites.

La decisión 5 reemplaza la regla de I-46 que fijaba automáticamente todas las fuentes
activas. El primer incremento debe alinear `DECISIONS_STATUS.md`, ciclo de vida, modelo de
dominio, pantallas y pruebas antes de cambiar el comportamiento.

## Línea base que se reutiliza

- Persistencia de ejecuciones, evidencias, recomendaciones, citas y retroalimentación.
- `AiAnalysisGateway` con adaptadores `disabled`, `baseline` y HTTP local.
- Cola Redis, reintentos acotados, límites de entrada/salida y estado no concluyente.
- Fotografía inmutable de la evidencia y huellas para reproducibilidad.
- Aplicación explícita con comparación antes/después y concurrencia optimista.
- Fuentes Markdown administradas por Coordinación y relación
  `fuentes_convocatoria`.
- Autoguardado, `version_bloqueo`, validación determinística y acción progresiva del
  editor docente de I-71.

Antes de ampliar el flujo se corregirá el contrato conocido donde Laravel entrega
`ejecuciones.*.estado` y la página actual espera `status`.

## Lo que falta

### Configuración efectiva

- Una revisión monotónica de configuración en la plantilla.
- Preferencias de IA por carrera y campo con la revisión de plantilla de origen.
- Un resolvedor de servidor que calcule `excepción vigente ?? valor administrativo`.
- Invalidación segura: la revisión es la fuente de verdad; una limpieza posterior puede
  borrar excepciones obsoletas, pero un fallo de limpieza nunca debe revivirlas.
- Auditoría del cambio administrativo, cambio de Coordinación e invalidación.
- Sustituir la selección automática de todas las fuentes por una selección explícita y
  validada de Coordinación.

### Lectura y contraste

- Representar el borrador como contexto canónico ordenado por sección, bloque y campo,
  usando IDs y títulos configurados; no codificar nombres como «Objetivos» o
  «Bibliografía» en el servicio.
- Dividir cada fuente Markdown por encabezados y fragmentos acotados, conservando ruta
  de encabezados, orden y huella.
- Recuperar únicamente fragmentos de fuentes seleccionadas, activas y pertenecientes a
  la carrera, más campos del mismo sílabo autorizados para contexto.
- Contrastar el campo objetivo con secciones relacionadas del propio borrador y con la
  evidencia externa. Toda afirmación verificable debe referenciar una de ambas.
- Detectar evidencia insuficiente y fuentes contradictorias sin inventar precedencia.
- Validar en Laravel que toda cita recibida pertenece al conjunto entregado al servicio.

La primera versión usará encabezados y búsqueda textual PostgreSQL, deterministas y
auditables. Los embeddings quedan detrás de un puerto para activarlos únicamente cuando
PV-13 y PV-14 definan hardware y modelo; no se añade una base vectorial por anticipado.

### Revisión integral

- Una ejecución padre por sílabo y `version_bloqueo`, con progreso y resultados hijos
  para los campos cuyo valor efectivo de IA sea verdadero.
- Idempotencia: repetir la revisión sin cambios reutiliza el resultado compatible; una
  edición crea otra revisión y marca la anterior como desactualizada.
- La acción docente mantiene el flujo de I-71: con obligatorios incompletos no aparece;
  **Validar sílabo** ejecuta primero reglas determinísticas y, si no hay errores, crea o
  reutiliza la revisión de IA cuando exista al menos un campo habilitado.
- Los errores determinísticos sí impiden continuar. IA pendiente, fallida, no
  concluyente o con sugerencias nunca impide **Enviar sílabo**.
- Aplicar una sugerencia aumenta `version_bloqueo`, invalida la validación vigente y
  obliga a validar otra vez. Ignorarla no cambia el borrador.

### Chat contextual

- Una conversación por docente y sílabo, con mensajes asociados a la versión del
  borrador y una acción explícita para limpiar la vista.
- Preguntas sugeridas al abrir, caja de texto fija abajo, streaming o estado de trabajo,
  reintento seguro y cancelación visual.
- Respuestas en texto seguro, con referencias navegables a secciones/campos del sílabo
  y a fragmentos de las fuentes seleccionadas.
- Las sugerencias de la revisión aparecen en la misma conversación como tarjetas
  estructuradas; mencionar una sección desplaza el formulario al campo correspondiente.
- Limpiar la conversación la oculta para el usuario, pero no elimina las ejecuciones,
  evidencias o decisiones que deban conservarse para auditoría.

## Cambios previstos

### Dominio y datos

- Agregar `plantillas_silabo.revision_configuracion`, entero creciente.
- Crear `preferencias_ia_carrera` con UUID, carrera, definición de campo, valor,
  `revision_plantilla_origen`, actor y restricción única por carrera/campo.
- Mantener `fuentes_convocatoria` como fotografía de la selección de Coordinación.
- Crear `fragmentos_fuente_academica` con fuente, ruta de encabezados, posición,
  contenido y huella; reconstruirlos después del commit al cambiar el Markdown.
- Crear `revisiones_ia_silabo` como ejecución padre y relacionar las ejecuciones por
  campo existentes mediante una FK nullable.
- Crear `conversaciones_ia` y `mensajes_ia`; cada respuesta del asistente referencia una
  ejecución auditable y la versión del borrador.
- Extender la evidencia para distinguir `fuente_academica` y `seccion_silabo`, siempre
  con fotografía, etiqueta, extracto y huella. No se alteran fotografías históricas.
- Las migraciones nuevas deben ser aditivas, tener backfill conservador e índices por
  carrera, sílabo, estado y huella. No se edita una migración ya aplicada.

### Backend

- Centralizar toda mutación de ADM-06 en `TouchTemplateConfiguration`; incrementar la
  revisión dentro de la misma transacción que guarda la plantilla.
- Implementar `ResolveEffectiveAiConfiguration`, `SaveCareerAiPreferences` y
  `SelectConvocationAiSources` con Policies/Form Requests y alcance por carrera.
- Implementar `BuildSyllabusAiContext`, `IndexAcademicSource`, `RetrieveAiEvidence`,
  `RequestSyllabusAiReview` y `SendSyllabusAiMessage`.
- Ampliar el contrato del gateway con modos `field_review` y `chat`, contexto interno,
  fragmentos externos y referencias tipadas. Conservar un fake determinista.
- Orquestar la revisión completa en cola mediante la ejecución padre; cada trabajo será
  idempotente, observable y despachado después del commit.
- Aplicar límites separados por usuario/sílabo para chat y revisión, tamaño máximo de
  mensaje, número de turnos y contexto total.
- Corregir y fijar con prueba el nombre único del estado consumido por Vue.

### Frontend

- Administración conserva el toggle por campo existente, con texto claro de que es el
  valor predeterminado para las carreras.
- Coordinación recibe una configuración compacta por campos: valor heredado, excepción
  vigente y acción **Restablecer valores de Administración**. En la preparación del
  alcance elige las fuentes para IA.
- Docencia recibe un solo botón global **Asistente IA** en la cabecera del editor y un
  `Sheet` derecho; no vuelven botones por sección o campo.
- Componentes previstos: `SyllabusAiSheet`, `AiConversation`, `AiMessage`,
  `AiCitation`, `AiReviewProgress`, `AiSuggestionCard` y el diálogo de comparación ya
  existente adaptado al nuevo flujo.
- Primero se reutilizan `resources/js/components/`, `components/ui/` y componentes de
  dominio. Los patrones de AI Elements sirven como referencia visual y de interacción;
  no se instalan sus componentes React/Next ni un segundo sistema de UI.
- Estados mínimos: cerrado, vacío, conversando, revisión pendiente/en proceso,
  recomendaciones, sin hallazgos, evidencia insuficiente, servicio no disponible y
  resultado desactualizado.

### Seguridad, privacidad y auditoría

- Laravel autoriza y filtra antes de construir contexto; el servicio local nunca decide
  el alcance.
- El contenido de fuentes y sílabo se delimita como datos no confiables para resistir
  instrucciones incrustadas.
- No se exponen razonamiento interno, prompts del sistema, secretos ni datos personales
  innecesarios. Los logs operativos conservan IDs, conteos y huellas, no documentos.
- Cada cambio de configuración, solicitud, resultado, cita, aplicación, rechazo y
  limpieza visible genera el evento auditable correspondiente.
- El servicio sigue sin herramientas, acceso libre a red o escritura sobre el sistema.

## Rebanadas verticales

- [ ] **I-72.1 — Decisión y contrato:** actualizar decisiones, dominio, ciclo de vida,
      pantallas y arquitectura; corregir `estado/status` y añadir prueba Inertia.
- [ ] **I-72.2 — Herencia configurable:** migración, revisión de plantilla, preferencias
      por carrera, resolvedor, UI Admin/Coordinación, autorización, auditoría y pruebas de
      invalidación.
- [ ] **I-72.3 — Fuentes elegidas:** retirar sincronización automática, selector previo
      al inicio, congelación, auditoría y pruebas de pertenencia/actividad.
- [ ] **I-72.4 — Contexto trazable:** fragmentación Markdown, búsqueda textual,
      ensamblador del sílabo, contrato de citas tipadas y pruebas contra inyección.
- [ ] **I-72.5 — Revisión integral:** ejecución padre, trabajos hijos, progreso,
      idempotencia, integración con validación y sugerencias agrupadas por sección.
- [ ] **I-72.6 — Chat único:** persistencia, endpoint, cola/streaming elegido, `Sheet`
      derecho, citas navegables, sugerencias y experiencia responsive/accesible.
- [ ] **I-72.7 — Producción y evaluación:** comprobar servicio y worker, completar
      corpus de prueba, medir calidad/latencia y cerrar o mantener explícitamente PV-13,
      PV-14 y PV-18.

Cada rebanada debe terminar política, caso de uso, persistencia, interfaz, pruebas y
documentación antes de empezar la siguiente. I-72.2 e I-72.3 no dependen del modelo final.

## Pruebas

- Administración cambia un toggle y las carreras sin excepción heredan el valor.
- Coordinación cambia un valor solo para su carrera; otro coordinador o carrera no lo ve.
- Reemplazar al coordinador conserva la preferencia de la carrera.
- Cualquier mutación de plantilla incrementa la revisión e invalida todas las
  excepciones anteriores sin borrar auditoría; una escritura concurrente no las revive.
- Solo pueden seleccionarse fuentes activas de la carrera y la selección no puede quedar
  vacía; una convocatoria iniciada no admite cambios.
- La revisión incluye solo campos efectivamente habilitados y conserva el orden real de
  la plantilla, incluso con secciones creadas por Administración.
- El contexto nunca depende de números o nombres de secciones hardcodeados.
- Una cita inventada, de otra carrera, fuente no seleccionada o versión distinta se
  rechaza; una fuente desactivada no entra en nuevas ejecuciones.
- Fuentes con instrucciones hostiles se tratan como datos. Conflictos se presentan sin
  elegir ganador.
- Doble clic, reintento de cola y solicitud equivalente no duplican ejecuciones.
- Editar durante o después del análisis vuelve obsoleto el resultado; aplicar una
  sugerencia obsoleta falla sin sobrescribir contenido.
- Error determinístico bloquea validar/enviar; fallo o ausencia de IA no lo hace.
- El chat respeta permisos, límites, versión del borrador y fuentes autorizadas.
- Vue cubre foco, teclado, lector de pantalla, tema claro/oscuro, 360 px, estados vacíos,
  progreso, error, citas, salto a sección y comparación antes de aplicar.
- Fake contractual, pruebas de integración HTTP local, jobs/Redis y prueba end-to-end del
  recorrido completo.

## Criterios de aceptación

- No existe un sílabo, sección o relación académica codificada de forma especial para la
  IA; el comportamiento nace de plantilla, preferencias efectivas y fuentes elegidas.
- Coordinación distingue qué heredó, qué sobrescribió y por qué una excepción caducó.
- Cambiar cualquier configuración de la plantilla hace que todas las carreras vuelvan a
  los valores administrativos actuales en su siguiente lectura.
- Docencia conversa y revisa desde un único panel; cada consejo identifica dónde aplica
  y qué evidencia lo sustenta.
- El sistema permite ignorar consejos y enviar con IA caída, siempre que la validación
  determinística esté vigente y sin errores.
- Aplicar texto nunca es automático y siempre conserva antes/después, actor y versión.

## Riesgos y reversión

- **Costo/latencia:** limitar contexto, reutilizar resultados compatibles y procesar en
  cola. El circuito se puede apagar con `AI_DRIVER=disabled` sin afectar el sílabo.
- **Configuración obsoleta:** comparar revisiones en cada resolución, no confiar solo en
  borrar filas.
- **Cambios de plantilla con trabajo en curso:** conservar las reglas de pausa, borrado
  confirmado y protección de sílabos enviados o con evidencia de IA de I-32.
- **Migración de fuentes:** antes de desplegar, las convocatorias existentes conservan su
  fotografía actual; la selección explícita rige para nuevas preparaciones. No se
  reescribe evidencia histórica.
- **Calidad del modelo:** mantener fake/servicio deshabilitado hasta evaluar PV-13,
  PV-14 y PV-18; ninguna métrica se presenta como certeza académica.
- **Reversión:** ocultar chat/revisión mediante configuración y volver al adaptador
  deshabilitado. Las tablas aditivas permanecen para no destruir trazabilidad.

## Despliegue y evidencia de cierre

- Respaldo lógico previo, migración remota con el procedimiento documentado y estado de
  migraciones verificado antes/después.
- Reinicio del worker de la cola `ia`, comprobación de salud del servicio local y prueba
  de degradación con el adaptador deshabilitado.
- Evidencia de pruebas backend/frontend, contrato HTTP, cola e idempotencia.
- Recorrido manual Admin → Coordinación → Docencia: heredar, sobrescribir, cambiar
  plantilla, comprobar reinicio, elegir fuentes, validar, conversar, revisar, citar,
  aplicar/ignorar y enviar.
- Actualización final de trazabilidad, arquitectura, pantallas, ciclo de vida, operación
  y runbook. El plan solo se cierra después de evaluación humana y de resolver las
  puertas necesarias para el nivel de producción declarado.

## Fuera de alcance

- Exponer cadena de pensamiento o razonamiento privado del modelo.
- Elegir modelo desde la interfaz docente.
- Aprobar, rechazar, calificar o modificar el sílabo automáticamente.
- Consultar Internet o fuentes externas no seleccionadas por Coordinación.
- Añadir React, Next.js o AI Elements como dependencia dentro de la aplicación Vue.
