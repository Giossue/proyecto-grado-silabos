# Backend Laravel

## Petición de escritura

```text
Route
  → middleware de sesión y rol
  → Form Request (forma y tipos)
  → Policy/Gate (actor + registro + estado)
  → Action/Use Case
      → regla de dominio
      → transacción
      → repositorios/Eloquent
      → auditoría/outbox
  → redirect Inertia + feedback
```

## Responsabilidades

- **Controller**: recibe, autoriza/delega y transforma la respuesta.
- **Form Request**: valida la frontera; no decide reglas académicas complejas.
- **Action**: coordina caso de uso, transacción e idempotencia.
- **Domain**: protege transiciones e invariantes sin depender de HTTP.
- **Policy**: combina rol, alcance, asignación, vigencia y estado.
- **Repository/Query**: persiste o lee sin filtrar reglas en la UI.
- **Job/Listener**: efectos lentos o externos posteriores al commit.

## Escrituras críticas

Envío, corrección, aprobación, reapertura, publicación y activación usan:

1. carga con el mecanismo de concurrencia acordado;
2. reautorización dentro del caso de uso;
3. validación de transición;
4. transacción PostgreSQL;
5. cambio + fotografía/revisión + evento de auditoría;
6. outbox/trabajo después del commit;
7. respuesta idempotente.

## Validación

- Tipos, formato y presencia: Form Request.
- Reglas dependientes del estado o del rol: caso de uso o dominio.
- Integridad estructural: constraints e índices PostgreSQL.
- Reglas configurables de plantilla: motor determinístico versionado.
- IA: nunca se usa como validación obligatoria.

Los errores de negocio tienen códigos internos estables para pruebas/logs y mensajes
académicos localizables para la interfaz.

## Lecturas

- Pagina colecciones desde la consulta.
- Selecciona solo columnas necesarias y precarga relaciones explícitas.
- Los filtros permitidos se declaran; no interpolar orden/columnas del cliente.
- Reportes exponen definición y usan el mismo alcance que el detalle.
- Usa read models/DTO cuando una pantalla combina varios módulos.

## Tiempo, IDs y concurrencia

- Inyecta un `Clock` en reglas sensibles a fechas.
- Genera UUID en aplicación.
- Guarda instantes UTC y presenta en `America/Guayaquil`.
- Incluye `version_bloqueo` o marca temporal en recursos editables.
- Devuelve un conflicto recuperable con comparación/recarga, nunca last-write-wins oculto.

## Excepciones y logs

- No muestres trazas al usuario.
- Propaga un `correlacion_id` por petición/trabajo.
- Registra identificadores internos y metadatos mínimos, no contenido completo.
- Distingue error esperado de dominio, entrada inválida, permiso y fallo inesperado.

