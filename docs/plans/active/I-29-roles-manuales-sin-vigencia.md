# I-29: Roles de cuentas manuales, sin vigencia por fecha

## Estado

Implementado y verificado el 2026-09-02. La migración remota ya se ejecutó; queda
pendiente desplegar el artefacto de aplicación compatible antes de usar ADM-02 o ADM-03.

## Trazabilidad

- RF-003..006; RN-001..004; CU-02; UI-04, ADM-02 y ADM-03.
- No depende de una decisión `POR VALIDAR`: el responsable del producto decidió que el
  ejercicio de un rol de cuenta no se programa por fechas, sino que se habilita o retira
  manualmente.

## Resultado demostrable

Al crear o asignar un rol de cuenta, Administración selecciona únicamente rol y, cuando
aplica, carrera. No existen los campos «Vigente desde» ni «Vigente hasta», ni se guardan
en `asignaciones_rol`. Un rol se puede activar mientras su asignación esté `activa`; el
historial conserva las filas archivadas y la retirada sigue siendo manual.

## Decisiones y alcance

- Esta decisión afecta exclusivamente `asignaciones_rol`, que representa permisos de
  cuenta. No elimina fechas de `asignaciones_coordinador` ni `asignaciones_docente`:
  esas relaciones académicas tienen reglas y trazabilidad independientes.
- La migración elimina datos de vigencia ya almacenados en `asignaciones_rol`. El campo
  `activo` sustituye la condición temporal para resolver el rol efectivo.
- La integridad impide dos asignaciones activas con el mismo usuario, rol y carrera;
  las filas inactivas permanecen como historial.

## Cambios previstos

- Dominio: `RoleAssignment::effective()` filtra solo por `activo`.
- Backend: altas, asignaciones, filtros, sesión activa, contratos Inertia y seeders dejan
  de aceptar o exponer fechas de rol.
- Datos: nueva migración elimina ambas columnas y sus restricciones/índices temporales;
  agrega unicidad parcial para asignaciones activas.
- Frontend: ADM-02 y ADM-03 eliminan fechas, leyendas y columnas de vigencia.
- Documentación: modelo de roles, esquema y matriz de trazabilidad reflejan la retirada
  manual.

## Pruebas

- Alta y asignación de rol sin fechas; rol activo elegible y rol archivado no elegible.
- PostgreSQL rechaza duplicar una asignación activa de igual alcance.
- Pruebas de migración y regresión de Identity, análisis estático y build aplicables.

## Pasos

- [x] Delimitar el cambio a roles de cuentas y registrar la decisión.
- [x] Eliminar dependencias de vigencia de los contratos, dominio y presentación.
- [x] Migrar `asignaciones_rol` a la semántica manual y ajustar seeders/pruebas.
- [x] Actualizar documentación y trazabilidad.
- [x] Ejecutar verificaciones locales y preparar el procedimiento remoto.

## Riesgos y reversión

- La eliminación de las dos columnas no permite recuperar sus fechas históricas desde la
propia tabla. Antes de ejecutar en remoto se toma respaldo conforme a
`docs/security/hardening.md`. La reversión restaura columnas vacías y la estructura
anterior, pero no reconstruye los valores descartados.

## Evidencia de cierre local

- `php artisan migrate` aplicó `2026_09_02_000026_remove_role_assignment_validity` en
  la base local; una consulta a `information_schema.columns` confirmó que no quedan
  `vigente_desde` ni `vigente_hasta` en `asignaciones_rol`.
- `php artisan test --compact`: 296 pruebas, 4.391 aserciones, en verde tras actualizar
  la expectativa arquitectónica del selector manual de unidades curriculares.
- `./vendor/bin/pint --test`, `npm run types:check`, `npm run lint:check` y
  `npm run build`: en verde.
- Remoto: respaldo `silabos_ueb_db-2026-09-02-pre-i29.dump`, migración 000026 aplicada
  en lote 12; cero columnas de vigencia, índice `asignacion_rol_activa_unica` presente,
  seis roles activos y `/health/ready` con `200`. El código de aplicación debe
  desplegarse de inmediato: el artefacto anterior consulta las columnas eliminadas.
