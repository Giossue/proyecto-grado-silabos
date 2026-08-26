# ADR-0003: IA desacoplada y bajo control humano

- Estado: Aceptado
- Fecha: 2026-08-14
- Trazabilidad: DP-10, RN-028 a RN-030, RF-046 a RF-054, RNF-016, RNF-035, RNF-036.

## Contexto

La IA puede ayudar a contrastar contenido con fuentes, pero sus resultados no son
determinísticos y el hardware/modelo aún no están validados. Una decisión académica debe
permanecer atribuible a una persona.

## Decisión

Laravel invoca un servicio local por un contrato sustituible y asíncrono. Cada salida
incluye evidencia y versión. El usuario decide si aplica una sugerencia. El núcleo no
depende de la disponibilidad de IA.

## Consecuencias

- Se puede evaluar/cambiar modelo sin modificar reglas de dominio.
- Se necesita persistir configuración y evidencia para reproducibilidad.
- La interfaz distingue recomendación de error determinístico.
- No se permiten aprobaciones, rechazos, bloqueos o ediciones automáticas.
