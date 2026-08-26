# Integraciones institucionales

## Principio

La base institucional es una fuente externa. Este sistema no escribe en ella. Un
adaptador de anticorrupción traduce registros externos al modelo propio y deja evidencia
de cada decisión.

## Flujo objetivo de importación

1. crear `EjecucionImportacion` con origen y parámetros;
2. leer mediante credenciales de mínimo privilegio;
3. almacenar/stagear filas necesarias con huella;
4. validar esquema, tipos y claves;
5. comparar con el estado local;
6. clasificar alta, cambio, sin cambio, rechazo o conflicto;
7. presentar simulación cuando el impacto sea relevante;
8. aplicar en transacción por lotes idempotentes, solo cuando exista autorización y
   reglas institucionales confirmadas;
9. registrar items, conflictos, métricas y auditoría;
10. permitir reanudar sin duplicar.

## Contratos

- `InstitutionalDataReader`: obtiene lotes/páginas sin conocer el dominio interno.
- `AcademicRecordMapper`: normaliza y valida.
- `ImportReconciler`: decide propuesta de alta/cambio/conflicto.
- `ImportApplier`: contrato reservado para una fase posterior; no está implementado
  mientras `PV-09`, `PV-10` y `PV-12` permanezcan abiertos.

## Simulación implementada en I-07

- `InstitutionalDataReader` se resuelve por configuración. El entorno normal usa
  `disabled`; las pruebas y demostración usan `anonymized-fixture-v1`, incorporado en
  código, versionado, sin personas y sin I/O externo.
- La solicitud fija origen, perfil, versiones de contrato/lector/mapper/reconciliador y
  clave UUID de idempotencia antes de encolar `SimulateInstitutionalImportJob`.
- El job admite hasta 1 000 filas, 32 KiB por fila y 2 MiB por lote. Verifica UTF-8,
  estructura, claves allowlist, tipos, rangos, referencias repetidas y huellas canónicas.
- Todo el lote se clasifica en memoria y se fija en PostgreSQL dentro de una sola
  transacción. Una fila inválida se rechaza; una referencia duplicada o identidad no
  confirmada queda en conflicto.
- El reconciliador puede señalar un candidato y una posible alta, actualización o
  ausencia de cambio, pero fuerza el resultado `conflict`. No crea, enlaza ni actualiza
  catálogos académicos.
- ADM-08 solo presenta métricas y valores normalizados. Nunca entrega payload original,
  referencia externa, huellas, versiones internas ni identificadores visibles.
- La única resolución disponible es `exclude`, con justificación de 20 a 2 000
  caracteres, actor y fecha. La decisión es inmutable y no aplica cambios.
- Un contrato inválido falla sin reintento funcional; una fuente no disponible usa tres
  intentos del worker y persiste una causa segura sin copiar el error técnico.

## Conflictos

No fusionar por nombre parecido sin criterio aprobado. Prioriza identificadores
institucionales una vez confirmado `PV-10`. Mientras tanto, conserva ambas referencias y
requiere conciliación humana.

## Otras integraciones

Correo, almacenamiento, documentos e IA siguen el mismo patrón: interfaz interna,
adaptador, timeout, reintento acotado, idempotencia, métricas y fake de pruebas.

## Bloqueos actuales

No construyas el adaptador productivo, credenciales, red, reglas de enlace ni aplicación
antes de resolver `PV-09`, `PV-10` y `PV-12`. I-07 solo implementa el puerto, fixture
anonimizado, simulador y pruebas de reconciliación conservadora.
