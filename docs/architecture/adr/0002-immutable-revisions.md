# ADR-0002: Evidencia mediante revisiones inmutables

- Estado: Aceptado
- Fecha: 2026-08-14
- Trazabilidad: DP-07, RN-019, RN-025, RN-026, RF-045, RF-060, RF-063, RF-064.

## Contexto

Sobrescribir un archivo o registro impide reconstruir qué revisó y aprobó una autoridad.
El producto necesita comparar correcciones, relacionar observaciones y generar el mismo
documento aprobado después.

## Decisión

El trabajo editable vive en un borrador controlado. Enviar/reenviar crea una fotografía
inmutable numerada. Aprobación y exportación apuntan a una revisión. Reabrir conserva la
aprobada y crea otra línea editable enlazada.

## Consecuencias

- Auditoría y comparación reproducibles.
- Mayor volumen de datos y necesidad de snapshots/mapeo cuidadoso.
- Ninguna operación funcional actualiza una revisión histórica.
- Las pruebas deben asegurar idempotencia, orden y concurrencia.
