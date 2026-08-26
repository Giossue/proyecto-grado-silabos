# ADR-0004: Adoptar el starter Vue vigente de Laravel 13

- Estado: Aceptado para bootstrap; verificar con lockfile
- Fecha: 2026-08-14
- Trazabilidad: DP-11, diagnóstico técnico v0.1.

## Contexto

La línea base indicaba Laravel 13 con Vue/Inertia, TypeScript, Tailwind y shadcn-vue sin
fijar la versión de Inertia. La documentación oficial vigente de Laravel 13 entrega el
starter Vue con Inertia 3, Vue 3 Composition API, TypeScript, Tailwind y shadcn-vue.

## Decisión

Crear el proyecto desde ese starter en lugar de reconstruir autenticación, Vite y la
integración frontend manualmente. Conservar Wayfinder y Fortify mientras no exista una
razón documentada para sustituirlos.

## Consecuencias

- Base actual, tipada y alineada con Laravel 13.
- El lockfile generado es la autoridad de versiones exactas.
- Cambios futuros del starter no se incorporan automáticamente; se evalúan como upgrade.
- La política institucional de registro/SSO sigue pendiente y no se resuelve por el starter.
