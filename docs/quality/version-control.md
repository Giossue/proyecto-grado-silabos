# Control de versiones

## Commits

- Una unidad coherente por commit.
- Asunto: `tipo(alcance): verbo imperativo`, máximo 72 caracteres.
- Tipos sugeridos: `feat`, `fix`, `test`, `docs`, `refactor`, `perf`, `build`, `ci`,
  `chore`, `security`.
- El cuerpo explica motivo/riesgo cuando el diff no es autoexplicativo.
- No combines formateo masivo con cambio funcional.

Ejemplos:

```text
feat(syllabi): create immutable revision on submission
test(review): reject approval outside coordinator scope
docs(ai): record evidence versioning decision
```

## Ramas y PR

- Ramas cortas desde una base actualizada.
- PR pequeño con resultado, trazabilidad, capturas/evidencia, migración y riesgos.
- No reescribas historia publicada sin coordinación explícita.
- No hagas commit/push automáticamente por trabajar con un agente; se requiere petición.

## Nunca versionar

`.env`, credenciales, tokens, dumps, archivos productivos, transcripciones sensibles,
exports reales, logs con datos personales, dependencias/builds generados o claves privadas.

## Cambios generados

Lockfiles sí se versionan con la causa correspondiente. Artefactos generados se versionan
solo si el repositorio lo decide explícitamente y pueden reproducirse/validarse.

