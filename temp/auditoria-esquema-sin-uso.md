# Auditoría estática de esquema sin uso

Generado por `python3 temp/audit_unused_schema.py`. No consultó una base de datos ni registros.
El esquema se obtuvo de los métodos `up` de las migraciones; migraciones, documentación y artefactos no cuentan como uso.

## Resultado
- Tablas de dominio reconstruidas: **52**
- Modelos Eloquent mapeados: **50**
- Tablas candidatas: **0**
- Columnas candidatas: **0**

## Tablas sin consumidor de producción identificable
- Ninguna.

## Columnas sin lectura/escritura identificable
- Ninguna.

## Cómo interpretar

- **sin referencia**: no apareció en `app`, `routes`, `config` ni `resources/js`; es el candidato de mayor prioridad para revisión.
- **solo soporte**: aparece únicamente en pruebas, factories o seeders; puede ser deuda de esquema o una ruta aún no implementada.
- El análisis no demuestra que una columna sea eliminable: una clave foránea, historial, SQL dinámico, JSON o integración pueden necesitarla aunque no aparezca como palabra literal.
- Antes de eliminar: verificar restricciones/FK, migrar en una copia y conservar una migración reversible según `docs/security/hardening.md`.
