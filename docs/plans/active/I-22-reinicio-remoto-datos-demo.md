# I-22: Reinicio remoto con datos de demostración

## Estado

Implementado y verificado el 2026-08-31.

## Trazabilidad

- RNF-001..036; soporte operativo de CU-01..17 y las pantallas ADM, COR y DOC.
- No altera requisitos funcionales ni depende de una decisión `POR VALIDAR`.
- La autorización explícita conserva intactos usuarios y toda su identidad asociada.

## Resultado demostrable

La base remota conserva usuarios, roles, asignaciones, sesiones y credenciales, mientras
que el resto de los datos funcionales se sustituye por un conjunto sintético coherente
que permite recorrer los módulos disponibles.

## Cambios previstos

- Datos remotos: copia previa, reinicio acotado de datos no identitarios y carga demo.
- Código: seeder idempotente si el conjunto actual no cubre los módulos disponibles.
- Seguridad: conexión mediante `.pgpass`; sin contraseñas, documentos ni datos personales
  en la evidencia.

## Pruebas

- Conteos antes/después, restricciones PostgreSQL y migraciones al día.
- Puerta local aplicable para el seeder y comprobación remota de integridad.

## Pasos

- [x] Identificar la conexión remota autorizada y el esquema aplicado.
- [x] Confirmar dependencias entre identidad y datos académicos.
- [x] Crear copia recuperable y reiniciar únicamente los datos autorizados.
- [x] Cargar y verificar los datos sintéticos.

## Riesgos y reversión

- Una asignación de rol por carrera puede requerir conservar esa carrera para no dejar
  una identidad con una clave foránea inválida.
- La copia previa permite restaurar el estado existente únicamente con autorización
  expresa del responsable.

## Evidencia

- Copia completa cifrada creada y validada mediante listado de `pg_restore` antes del
  reinicio; se conserva fuera del repositorio, con permisos restringidos.
- Se conservaron 4 usuarios, 3 roles, 4 asignaciones de rol y 4 sesiones.
- El escenario sintético contiene 2 campus, 2 modalidades, 1 periodo, 1 malla activa,
  6 asignaturas, 6 ofertas/paralelos/asignaciones docentes, 1 plantilla publicada, 1
  fuente activa con 2 fragmentos, 1 convocatoria abierta y 6 sílabos en borrador.
- `migrate:status` remoto confirma todas las migraciones aplicadas; las comprobaciones
  posteriores confirman una malla activa, plantilla publicada, fuente activa,
  convocatoria abierta y cero asignaciones de rol con carrera inexistente.
