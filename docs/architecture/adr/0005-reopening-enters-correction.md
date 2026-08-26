# ADR-0005: La reapertura inicia una corrección vinculada

- Estado: Aceptado como decisión técnica provisional
- Fecha: 2026-08-14
- Responsables: desarrollo; pendiente de prueba con Coordinación
- Reemplaza / reemplazado por: —

## Contexto

El principio confirmado exige conservar la revisión aprobada y crear otra línea editable,
pero no fija si el expediente reabierto aparece como `Borrador` o `Corrección solicitada`.
DT-07 exige escoger un estado implementable sin convertirlo en política institucional.

## Opciones consideradas

1. Volver a `Borrador`: reutiliza el estado inicial, pero oculta que existe una aprobación
   histórica y una causa explícita de reapertura.
2. Entrar en `Corrección solicitada`: conserva el significado de trabajo posterior a una
   revisión y permite mostrar la revisión aprobada como base, a costa de necesitar una
   explicación clara en la interfaz.

## Decisión

Una reapertura lleva el expediente a `Corrección solicitada`. Copia como nuevo trabajo el
snapshot de la revisión aprobada, incrementa `lock_version` y registra una `Reapertura`
append-only con causa, actor y aprobación de origen. El siguiente envío crea una revisión
nueva que referencia la reapertura; nunca cambia la revisión ni la aprobación anteriores.

Esta elección es técnica y provisional. No autoriza edición por coordinación: mientras
PV-16 esté abierta, solo un docente colaborador vigente modifica el nuevo trabajo.

## Consecuencias

- Positivas: distingue elaboración inicial de cambio posterior a aprobación y mantiene una
  cadena histórica explícita.
- Costes/riesgos: usuarios podrían interpretar “corrección” como sanción; la interfaz debe
  explicar causa y revisión base.
- Cómo verificar: pruebas de snapshot, permisos, vínculos y máquina de estados; prueba de
  tareas con docentes/coordinación en I-08.
- Condición para revisar: validación institucional de DT-07 o evidencia de usabilidad que
  prefiera `Borrador`; el cambio requerirá ADR y migración de estados abiertos, sin alterar
  historia aprobada.

## Trazabilidad

RF-064; RN-026; CU-14; COR-10; DT-07; ADR-0002; I-04.
