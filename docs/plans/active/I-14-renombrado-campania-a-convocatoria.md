# I-14: «Campaña» pasa a llamarse convocatoria

## Estado

Implementado y verificado el 2026-08-21. `composer verify` en verde: 163 pruebas y
1887 aserciones, con el esquema recreado desde cero.

## Motivo

«Campaña» venía de la línea base del proyecto, pero arrastra un tono comercial que no
corresponde a un proceso académico. «Convocatoria» es el término que usa la Coordinación
para un trabajo que se abre a varias personas con un plazo, y no colisiona con «ciclo»,
que ya nombra la posición curricular de una materia.

## Alcance

- Base de datos: `campanias` → `convocatorias`, `fechas_limite_campania` →
  `fechas_limite_convocatoria`, `fuentes_campania` → `fuentes_convocatoria`, y la columna
  `campania_id` → `convocatoria_id` en cuatro tablas.
- Clases: `Campaign` → `Convocation`, con sus acciones, política, peticiones y
  controlador. `CampaignDeadline` → `ConvocationDeadline`.
- Relación de Eloquent `campaign()` → `convocation()` y las claves de payload que
  llegaban al front.
- Rutas: `/campanias` → `/convocatorias`; `campaigns.*` → `convocations.*`.
- Vistas: `pages/Coordination/Campaigns` → `Convocations`; `CampaignCreationSheet` →
  `ConvocationCreationSheet`.
- Auditoría: `campaign.created` y `campaign.opened` → `convocation.*`.
- Documentación: glosario, modelo de dominio, casos de uso, pantallas, trazabilidad y
  planes. El incremento I-03 pasa a `I-03-convocatorias-borradores.md`.

## Decisiones

- Las migraciones anteriores conservan los nombres con los que se creó el esquema. El
  cambio se aplica en una migración propia, para no reescribir la historia.
- Renombrar una tabla no reescribe el cuerpo de las funciones que la consultan:
  `validar_evidencia_ia` se redefine en la misma migración con los nombres nuevos. Sin
  eso, la validación de evidencia de IA fallaría en ejecución y no al migrar.
- En el código las clases siguen en inglés, como el resto del proyecto, y las tablas y la
  interfaz en español.

## Verificación

- `composer verify` completo y `migrate:fresh --seed` sobre un esquema vacío.
- Sin referencias al término anterior en `app/`, `resources/js/`, `routes/`, `tests/`,
  `docs/` ni en el cuerpo de las funciones de PostgreSQL.

## Fuera de alcance

Es un cambio de nombre: no altera autorización, alcance por carrera, ciclo de vida del
sílabo ni el comportamiento de la apertura.
