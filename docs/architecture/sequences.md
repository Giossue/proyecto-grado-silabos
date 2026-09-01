# Secuencias canónicas

Estos diagramas fijan responsabilidades e invariantes. Los nombres concretos de clases
pueden variar, pero no se omiten autorización, transacción, inmutabilidad, auditoría ni
efectos posteriores al commit.

## Enviar un sílabo

```mermaid
sequenceDiagram
    actor D as Docente
    participant UI as Inertia/Vue
    participant C as SubmitSyllabusController
    participant A as SubmitSyllabus Action
    participant P as SyllabusPolicy
    participant V as Validador determinístico
    participant DB as PostgreSQL
    participant O as Outbox
    participant W as Worker

    D->>UI: Confirma enviar
    UI->>C: POST con version_bloqueo e idempotency_key
    C->>P: authorize(submit, syllabus)
    P-->>C: permitido por rol, alcance, asignación y estado
    C->>A: ejecutar DTO validado
    A->>V: validar borrador y versión de reglas
    V-->>A: resultados bloqueantes/advertencias
    alt Existen errores bloqueantes
        A-->>C: rechazo sin transición
        C-->>UI: errores por sección/campo
    else Borrador válido
        A->>DB: begin transaction + comprobar concurrencia/idempotencia
        A->>DB: insertar RevisionSilabo inmutable
        A->>DB: cambiar estado a En revisión
        A->>DB: insertar transición y auditoría
        A->>O: insertar evento silabo.enviado
        A->>DB: commit
        C-->>UI: redirect con número de revisión
        O-->>W: entregar después del commit
        W->>W: notificar de forma idempotente
    end
```

## Solicitar corrección y reenviar

```mermaid
sequenceDiagram
    actor Coo as Coordinador
    actor D as Docente
    participant UI as Aplicación
    participant R as Review Actions
    participant DB as PostgreSQL

    Coo->>UI: Registra observaciones sobre revisión N
    UI->>R: Solicitar corrección con observaciones seleccionadas
    R->>DB: autorizar alcance y comprobar En revisión
    R->>DB: transacción: observaciones + estado Corrección solicitada + auditoría
    R-->>D: notificación posterior al commit
    D->>UI: Edita nueva versión de trabajo y responde
    D->>R: Reenviar con version_bloqueo e idempotency_key
    R->>DB: validar + insertar revisión N+1 inmutable
    R->>DB: vincular respuestas/cambios a observaciones
    R->>DB: estado En revisión + transición + auditoría
    R-->>Coo: notificación posterior al commit
    Coo->>UI: Ver diff N ↔ N+1 y verificar observaciones
```

## Aprobar y reabrir

```mermaid
sequenceDiagram
    actor Coo as Coordinador
    participant UI as Inertia/Vue
    participant A as Approval Actions
    participant DB as PostgreSQL
    participant O as Outbox

    Coo->>UI: Confirma aprobación de revisión N
    UI->>A: approve(revision N, idempotency_key)
    A->>DB: autorizar + validar estado/reglas/observaciones
    A->>DB: transacción: Aprobacion(N) + estado Aprobado + auditoría + outbox
    A-->>UI: Aprobado; revisión N bloqueada
    O-->>O: habilita notificación/exportación después del commit

    opt Reapertura autorizada
        Coo->>UI: Indica causa y confirma reabrir
        UI->>A: reopen(approval N, reason)
        A->>DB: autorizar + transacción
        A->>DB: insertar Reapertura y nueva revisión de trabajo enlazada
        A->>DB: conservar Aprobacion(N) y revisión N intactas
        A->>DB: transición + auditoría + outbox
        A-->>UI: nueva revisión editable identificada
    end
```

## Solicitar asistencia de IA

```mermaid
sequenceDiagram
    actor D as Docente
    participant UI as Inertia/Vue
    participant A as RequestAiAnalysis
    participant DB as PostgreSQL
    participant Q as Redis/Worker
    participant AI as Servicio IA local

    D->>UI: Solicita análisis de campo habilitado
    UI->>A: request(field, content_hash)
    A->>DB: autorizar + resolver plantilla y fuentes activas
    A->>DB: crear/reusar EjecucionIA con clave compatible
    A-->>UI: estado Pendiente
    A-->>Q: job después del commit
    Q->>AI: contrato versionado, datos mínimos y fuentes autorizadas
    alt Respuesta válida
        AI-->>Q: recomendaciones + referencias
        Q->>DB: validar referencias y persistir evidencia/estado Completado
        Q-->>UI: notificación/actualización
        D->>UI: compara y aplica/ignora explícitamente
        UI->>DB: persiste decisión y cambio humano
    else Timeout, fallo o evidencia insuficiente
        AI-->>Q: error tipado/no concluyente
        Q->>DB: estado Fallido/No concluyente y diagnóstico seguro
        Q-->>UI: ayuda no disponible; flujo principal continúa
    end
```

## Generar y descargar documentos

```mermaid
sequenceDiagram
    actor U as Usuario autorizado
    participant UI as Aplicación
    participant E as Export Actions
    participant DB as PostgreSQL
    participant Q as Worker
    participant R as DocumentRenderer
    participant S as Almacenamiento privado

    U->>UI: Solicita DOCX/PDF de revisión N
    UI->>E: create export(revision N)
    E->>DB: autorizar + fijar revisión/plantilla + crear trabajo idempotente
    E-->>Q: dispatch después del commit
    Q->>R: render fotografía inmutable
    R-->>Q: DOCX y PDF desde la misma entrada
    Q->>S: guardar privados y calcular huellas
    Q->>DB: registrar artefactos y estado Completado
    U->>UI: Descargar artefacto
    UI->>DB: reautorizar recurso/revisión
    UI->>S: stream o URL temporal corta
    S-->>U: archivo
```

## Importar datos institucionales

```mermaid
sequenceDiagram
    actor A as Administrador
    participant UI as Aplicación
    participant I as Import Application
    participant X as Fuente institucional
    participant DB as PostgreSQL

    A->>UI: Inicia simulación
    UI->>I: create import run
    I->>X: leer lote con credencial de solo lectura
    X-->>I: registros externos
    I->>DB: stage + validar + clasificar altas/cambios/conflictos
    I-->>UI: resumen y conflictos, sin aplicar
    A->>UI: Confirma lote autorizado
    UI->>I: apply(run, idempotency_key)
    I->>DB: transacciones por lotes + items + auditoría
    I-->>UI: altas, cambios, rechazos y conflictos finales
    Note over I,X: Nunca escribe en la fuente institucional
```

