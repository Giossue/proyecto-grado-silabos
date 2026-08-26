# Plan de programación

## Qué significa

El plan de programación no es escribir código ni decidir el orden de carpetas. Es la
hoja de ruta que convierte la SRS y la arquitectura en incrementos implementables,
verificables y demostrables.

Para cada incremento responde:

- qué valor funcional quedará usable;
- qué requisitos y pantallas cubre;
- qué decisiones deben resolverse antes;
- qué módulos, migraciones y contratos cambiarán;
- qué pruebas demostrarán el resultado;
- qué evidencia/documentación se entregará;
- qué riesgos y estrategia de reversión existen.

## Principio de ejecución

Construir **rebanadas verticales**. Por ejemplo, “crear y desactivar usuario” incluye
política, caso de uso, migración, interfaz, pruebas y auditoría. “Hacer todas las tablas”
sin un flujo verificable no constituye un incremento terminado.

## Niveles de trabajo

```text
Línea base del producto (RF/RNF/RN/CU/UI/CP)
    ↓
Incremento (resultado demostrable)
    ↓
Feature/caso de uso
    ↓
Tarea técnica pequeña
    ↓
Commit coherente
```

## Puertas

- **P0 — antes de construir:** una decisión puede cambiar el esquema, permisos, flujo o
  plataforma de la capacidad.
- **P1 — antes de aceptar:** puede usarse un contrato/propuesta, pero debe resolverse
  para cerrar la validación.
- **P2 — antes de producción/cierre:** no bloquea el piloto técnico, sí la operación o
  el documento final.

Las puertas están en `decisions-pending.md`. No todos los pendientes bloquean todo.

## Definition of Ready de una feature

- actor, alcance y resultado definidos;
- IDs RF/RNF/RN/CU/UI/CP identificados;
- criterios de aceptación observables;
- decisiones P0 resueltas o diseño reversible explícito;
- datos y migración entendidos;
- autorización y auditoría definidas;
- estados de interfaz y errores definidos;
- estrategia de pruebas y rollback acordada;
- tamaño que pueda revisarse como una unidad.

## Plantilla de plan activo

```markdown
# PLAN-ID: Resultado

## Estado
En preparación | En curso | Bloqueado | En verificación

## Trazabilidad
RF / RNF / RN / CU / UI / CP / PV

## Resultado demostrable

## Decisiones y supuestos

## Cambios previstos
- Dominio:
- Backend:
- Datos:
- Frontend:
- Seguridad/auditoría:
- Trabajos/integraciones:

## Pruebas

## Pasos
- [ ] ...

## Riesgos y reversión

## Evidencia de cierre
```

## Ritmo sugerido

1. Refinar la siguiente feature y resolver sus P0.
2. Implementar una rebanada pequeña.
3. Revisar y verificar en CI.
4. Demostrarla contra criterios de aceptación.
5. Actualizar trazabilidad/documentos.
6. Cerrar el plan y registrar deuda real.
7. Seleccionar la siguiente rebanada.

El cronograma académico se agrega cuando `PV-03` y `PV-20` estén confirmados. No se
inventan fechas para que la tabla parezca completa.

