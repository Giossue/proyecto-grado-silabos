# ODD: documentos de tarea

ODD (*Organic Driven Development*) es el flujo de trabajo de este repositorio.

## Cuándo crear un documento

- Un cambio pequeño y entendido no deja documento: basta el commit.
- Uno grande lleva un solo archivo `odd/tasks/<feature>.md`, creado antes de escribir código. Es grande el cambio que no se podría retomar en otra sesión solo con el pedido y el `git diff`.

## Formato

```markdown
# Título de la tarea

Objetivo en dos o tres líneas. Rama: main. Pruebas: vitest.

## Specs

- S1 — Pedido del usuario, citado textual, con fecha.
- S2 — Requisitos numerados. Los supuestos se marcan como supuestos.

## Tasks

- [ ] T1 (S1–S2) — ruta (en línea o delegada), estado, commit.

## Log

- L1 (fecha) — el pedido original, textual.
- L2… — correcciones del usuario (textuales), decisiones, evidencia de pruebas y siguiente paso.
```

## Reglas

- Un cambio de requisito agrega su entrada en `## Log`, reescribe solo el `S#` afectado y reabre solo su tarea.
- Una tarea se marca hecha solo con sus pruebas observadas; el commit que la contiene se anota en la tarea.
- Los cambios que tocan datos guardados, seguridad o contratos que otros usan llevan una revisión independiente antes de subir.
- Los agentes que reciben una tarea leen el documento hasta `## Log` y dicen qué `S#` cubrieron.
