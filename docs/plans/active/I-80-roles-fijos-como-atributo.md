# I-80 — Roles fijos como atributo de la asignación

## Decisión y alcance

Por decisión explícita del responsable del producto el 15 de septiembre de 2026,
`administrador`, `coordinador` y `docente` son valores fijos del dominio, no un
catálogo administrable. Se elimina la tabla `roles` y `asignaciones_rol` pasa a
guardar `rol` como valor restringido.

La asignación mantiene el alcance de carrera, su estado y su historia. No se cambian
permisos, rutas ni responsabilidades sobre paralelos: `asignaciones_paralelo` continúa
apuntando a la asignación RBAC docente.

## Trazabilidad

- RN-001, RN-002, RN-003: autorización por rol y alcance.
- CU de administración de cuentas, selección de contexto y gestión académica.
- I-74: sustituida solo en la referencia física `rol_id → roles`.

## Plan

1. [x] Añadir `asignaciones_rol.rol`, copiar los valores existentes y proteger dominio,
   alcance y unicidad activa con restricciones PostgreSQL.
2. [x] Recrear el trigger de coordinación para que use `NEW.rol`; retirar la FK y tabla
   `roles` únicamente después del backfill validado.
3. [x] Reemplazar consultas, modelos, seeders y pruebas para usar `RoleCode` y el atributo
   `rol`, sin catálogo persistido.
4. [x] Publicar la aplicación y aplicar la migración en producción conforme al runbook, verificar esquema e
   invariantes, y sincronizar la documentación del esquema.

## Recuperación

La migración incluye `down`: recrea el catálogo fijo, restituye `rol_id` desde `rol`,
restaura FK e índice de unicidad y vuelve a crear el trigger dependiente del catálogo.
No se elimina ninguna asignación ni evidencia histórica.

## Evidencia local

- Migración `000072` aplicada y seeder repetido sin duplicar asignaciones.
- Pest completo: 428 pruebas, 6600 aserciones.
- Pruebas focalizadas posteriores: 91 pruebas, 760 aserciones.
- Pint de los archivos modificados: correcto.
- Larastan conserva 55 hallazgos preexistentes en módulos ajenos; el nuevo
  `RoleAssignment` no añade ninguno.
- Producción: migración `000072` aplicada en lote 45. Se comprobó que `roles` y
  `rol_id` no existen, `rol` existe, ambos `CHECK` y el trigger de coordinación están
  presentes, y los únicos valores persistidos son los tres autorizados.
