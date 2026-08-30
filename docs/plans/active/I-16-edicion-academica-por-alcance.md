# I-16 — Edición académica por alcance

## Objetivo

Completar la edición de mallas, materias, ofertas, paralelos y asignaciones docentes
desde Coordinación, limitada a la carrera del rol activo, sin confundir la gestión
académica con la administración de cuentas.

## Trazabilidad

- RF-003..016; RN-001..008; CU-02 y CU-03.
- UI-04, ADM-02..04 y COR-13..15.
- CP-F identidad, permiso, alcance, historial e inmutabilidad.

## Decisiones aplicadas

- El Coordinador edita la estructura académica de su carrera y las relaciones entre
  docentes y paralelos.
- Solo el Administrador puede corregir el nombre o el correo de una cuenta. El Docente
  tampoco puede corregir sus propios datos; solicita el cambio a Administración.
- Una malla publicada y sus materias son inmutables. Los registros ya usados por un
  sílabo conservan su identidad histórica; se archivan y reemplazan en lugar de
  reescribirse.
- Toda edición se autoriza por registro en el servidor y registra antes/después en
  auditoría.

## Entrega vertical

1. Restringir nombre y correo a Administración en política, perfil y UI.
2. Incorporar actualización por alcance para las cinco entidades de Coordinación.
3. Añadir la acción Editar a las tablas, respetando inmutabilidad e historial.
4. Cubrir permisos, alcance, auditoría y estados bloqueados con pruebas.
5. Actualizar documentación y matriz de trazabilidad.

## Verificación

- Pruebas focalizadas de identidad y estructura académica.
- `./vendor/bin/pint --test`.
- `npm run typecheck`, lint y build cuando estén disponibles.
- `composer verify` con PostgreSQL y Redis activos.

## Evidencia local del 30 de agosto de 2026

- Formato PHP, PHPStan, Prettier, ESLint, tipos Vue y compilación: correctos.
- Arquitectura: 78 pruebas, 722 aserciones.
- Identidad, perfil, estructura académica y apertura de convocatoria: 45 pruebas, 403
  aserciones, sobre PostgreSQL efímero UTF-8.
- Suite: 253 de 254 pruebas y 2342 aserciones; solo `RedisConnectionTest` quedó sin
  ejecutar por ausencia del servicio Redis local.
