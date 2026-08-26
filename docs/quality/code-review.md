# Revisión de código

## Orden de revisión

1. Correctitud e invariantes.
2. Autorización, privacidad y abuso.
3. Pérdida/corrupción histórica y migraciones.
4. Concurrencia, idempotencia y transacciones.
5. Contratos externos y degradación.
6. Pruebas/trazabilidad.
7. Arquitectura y mantenibilidad.
8. UX, accesibilidad y rendimiento.

## Preguntas

- ¿Implementa los criterios y nada fuera del alcance?
- ¿Asume un PV no resuelto?
- ¿Puede otro rol/carrera consultar o mutar el registro?
- ¿Una repetición o carrera crea duplicados?
- ¿Se puede reconstruir lo enviado/aprobado?
- ¿La migración protege datos existentes y tiene plan de recuperación?
- ¿Un proveedor caído deja un estado parcial?
- ¿Los logs/errores revelan datos o secretos?
- ¿Las pruebas fallarían ante la regresión real?
- ¿La interfaz explica estados y consecuencias?

## Severidad

- **Bloqueante:** seguridad, pérdida de datos, aprobación/revisión mutable, permiso roto,
  migración insegura, requisito esencial no cumplido.
- **Alta:** regresión probable, idempotencia/concurrencia ausente, prueba crítica faltante.
- **Media:** deuda arquitectónica o UX que afecta uso/mantenimiento.
- **Baja:** claridad o consistencia sin impacto funcional inmediato.

## Forma del comentario

Indica archivo/línea, escenario reproducible, impacto y corrección esperada. Separa bug de
preferencia. No apruebes basándote solo en que CI está verde.

