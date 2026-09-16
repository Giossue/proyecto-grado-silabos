# I-82 — Eliminar la entidad Malla

## Decisión

Una carrera tiene una única estructura curricular, sin versiones, sin estado propio y sin
agrupaciones adicionales. `mallas` se retira: `codigo_malla` y
`cantidad_ciclos_malla` pasan a `carreras`, y `asignaturas` queda directamente ligada a
la carrera mediante `carrera_id`.

## Alcance

1. Migrar datos y restricciones sin borrar asignaturas, requisitos, programaciones,
   paralelos ni sílabos.
2. Sustituir el agregado y las consultas persistentes de `Curriculum` por `Career`.
3. Conservar «Malla» como nombre de la interfaz para el editor curricular, no como
   entidad ni tabla.
4. Eliminar los flujos de crear, activar, desactivar o borrar mallas.
5. Actualizar pruebas, modelo de dominio y fotografía del esquema de producción.

## Invariantes

- El código de malla es único y obligatorio por carrera.
- La cantidad de ciclos es obligatoria y está entre 1 y 30.
- Una asignatura pertenece a una sola carrera; su código es único dentro de ella.
- Una programación puede usar únicamente una asignatura de la carrera en alcance.
- Las fotografías históricas del sílabo no se modifican.

## Despliegue

La migración crea primero las columnas y copia los datos, redirige las claves de
asignaturas, y solo entonces elimina `mallas`. Se aplica localmente y en producción con
el migrador bloqueado; la documentación de producción se actualiza tras comprobar el
esquema remoto.

## Estado

- Implementación y migración local verificadas el 15 de septiembre de 2026.
- Pendiente de publicación y despliegue para aplicar la migración remota y actualizar la
  fotografía de producción.
