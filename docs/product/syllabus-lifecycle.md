# Ciclo de vida del sílabo

## Máquina de estados

```text
Sin iniciar
    │ crear borrador
    ▼
Borrador ── enviar revisión ──► En revisión
   ▲                              │
   │                              ├─ aprobar ──► Aprobado
   │                              │                │
   │ solicitar corrección         │                └─ reabrir
   └──── Corrección solicitada ◄──┘                     │
              │                                         ▼
              └─ reenviar nueva revisión ─► En revisión / nueva revisión editable
```

La reapertura crea una nueva línea editable vinculada a la revisión aprobada; no vuelve
mutable el documento aprobado.

## Transiciones permitidas

| Origen                | Acción               | Actor                    | Destino                          | Efecto obligatorio                                 |
| --------------------- | -------------------- | ------------------------ | -------------------------------- | -------------------------------------------------- |
| Sin iniciar           | Crear borrador       | Docente asignado/sistema | Borrador                         | Fija plantilla y contexto académico.               |
| Borrador              | Enviar               | Docente autorizado       | En revisión                      | Valida, crea revisión inmutable y audita.          |
| En revisión           | Solicitar corrección | Coordinador de alcance   | Corrección solicitada            | Selecciona observaciones y habilita nueva edición. |
| Corrección solicitada | Reenviar             | Docente autorizado       | En revisión                      | Crea nueva revisión y vincula respuestas/cambios.  |
| En revisión           | Aprobar              | Coordinador autorizado   | Aprobado                         | Fija aprobación sobre revisión inmutable.          |
| Aprobado              | Reabrir              | Coordinador autorizado   | Borrador o Corrección solicitada | Registra causa y crea revisión enlazada.           |

ADR-0005 fija provisionalmente `Corrección solicitada` tras una reapertura. DT-07 exige
validar ese lenguaje con usuarios; un cambio futuro afectará trabajo nuevo sin alterar la
revisión ni la aprobación conservadas.

## Relevo del docente responsable

El sílabo pertenece a la asignatura y el periodo, no a quien lo redacta, así que cambiar
de responsable no crea un expediente nuevo. El relevo cierra la vigencia de quien sale y
abre la de quien entra sobre los mismos paralelos, en una sola transacción, y exige la
referencia del acto que lo respalda.

| Estado al relevar     | Qué ocurre                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------- |
| Sin iniciar           | Solo cambia el responsable.                                                                       |
| Borrador              | Se descarta el contenido y el nuevo docente empieza limpio. El avance perdido queda en auditoría. |
| En revisión           | No se traspasa. Primero se resuelve la revisión.                                                  |
| Corrección solicitada | Se conserva el contenido: hubo envío, así que es evidencia.                                       |
| Aprobado              | Se reabre conservando la revisión aprobada intacta; el nuevo docente hereda el contenido.         |

El descarte del borrador viene de DT-08 y no se deshace. La herencia del trabajo enviado
viene de A1. Ambas están registradas en `references/entrevista-2026-08-26-hallazgos.md`.

## Plazos

El proceso institucional fija dos fechas —inicio de la elaboración y entrega del
borrador— y cada convocatoria las hereda como sus dos etapas con vencimiento. Antes del
inicio y después de la entrega, el envío se rechaza. Solo el coordinador de la carrera
prorroga la suya, con motivo escrito, y únicamente hacia adelante: adelantar la fecha
dejaría fuera de plazo a quien ya estaba dentro. La fecha anterior se conserva en el
evento de auditoría.

## Pausas

Una pausa detiene el reloj para el alcance que la decide. Administración pausa el
proceso y ningún docente de la universidad edita ni envía hasta que lo reanude; entre
tanto la plantilla vuelve a ser editable. Coordinación pausa su convocatoria y solo los
docentes de esa carrera se detienen; entre tanto la malla y las fuentes de la carrera
vuelven a ser editables. Los borradores se conservan tal cual. Ambas pausas exigen
motivo y quedan en auditoría; reanudar una convocatoria requiere que el proceso esté
abierto. Cerrar el proceso es definitivo: los expedientes se conservan y ya no admiten
envíos.

El respaldo normativo está en `references/normativa-silabo.md`: el reglamento vigente de
la UEB exige que la planificación microcurricular esté programada antes de iniciar el
periodo académico.

## Precondiciones comunes

- usuario activo, rol, alcance y asignación vigentes;
- convocatoria y periodo compatibles;
- malla actual activa al crear ofertas y abrir un proceso nuevo;
- control de concurrencia superado;
- versión de plantilla disponible para renderizar el expediente;
- validaciones determinísticas obligatorias ejecutadas antes del envío;
- transacción atómica y evento de auditoría.

## Revisión frente a borrador

- El borrador representa trabajo editable y puede autoguardarse.
- La revisión representa evidencia enviada y no se edita.
- Las observaciones apuntan a la revisión observada.
- La corrección parte de una copia controlada y produce otra revisión al reenviar.
- Un coordinador siempre revisa el contenido exacto enviado, no el borrador posterior.

## IA en el ciclo

El análisis puede solicitarse durante edición o antes del envío. Sus estados son
Pendiente, En proceso, Completado o Fallido. El usuario puede continuar si falla. Aplicar
una recomendación requiere acción explícita y deja registro; ignorarla no invalida el
envío.

## Casos de carrera

- Doble clic/reintento de envío: una sola revisión mediante idempotencia.
- Edición concurrente: conflicto visible; no sobrescritura silenciosa.
- Cambio de plantilla publicado: no altera expedientes ya creados.
- Cambio de fuente activa: invalida/recalcula ayuda de IA futura, no reescribe resultados
  históricos.
- Edición o desactivación de la malla: bloquea trabajo nuevo cuando queda inactiva, pero
  no cambia el contexto académico fijado en sílabos y revisiones existentes.
- Reintento de exportación: no duplica aprobación ni cambia revisión.
- Sesión revocada durante edición: se detiene la mutación y se conserva un mensaje claro.
