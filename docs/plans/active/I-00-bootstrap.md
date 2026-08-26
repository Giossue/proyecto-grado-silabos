# I-00: Bootstrap verificable

## Estado

Completado localmente el 2026-08-14. La ejecución remota de CI queda como evidencia del
primer push autorizado.

## Resultado demostrable

Una persona clona el repositorio, configura variables no secretas, instala dependencias,
levanta Laravel/PostgreSQL/Redis, inicia sesión, abre una página Inertia y ejecuta toda la
verificación en limpio.

## Trazabilidad

- DP-11 y ADR-0001/0004.
- RNF-001 a RNF-008, RNF-024 y RNF-029 a RNF-034 como base.
- UI-01.
- DT-01, DT-02, DT-04 y DT-05.

| Tipo | IDs cubiertos | Evidencia prevista |
|---|---|---|
| Requisito | RNF-001 a RNF-008, RNF-024, RNF-029 a RNF-034 | configuración, middleware, health checks y CI |
| Caso de uso | CU-01 | pruebas Feature de sesión y acceso autenticado |
| Interfaz | UI-01 | página de acceso y página autenticada Inertia |
| Prueba | CP-N relacionados con seguridad, despliegue y mantenibilidad | `composer verify` y smoke PostgreSQL/Redis |
| Pendiente | DT-01, DT-02, DT-04, DT-05 | alternativas reversibles descritas abajo |

## Decisiones y supuestos temporales

- DT-01: se conserva Fortify, pero el registro público queda desactivado. No se fija SSO.
- DT-02: se adopta Pest porque el instalador oficial lo soporta; los lockfiles fijan las
  versiones y `composer verify` será el comando canónico del repositorio.
- DT-04: el disco `private` de Laravel es la única ubicación de archivos funcionales.
- DT-05: se evaluará PHPStan/Larastan y se mantendrá solo si es compatible con Laravel 13
  y PHP 8.5 sin reducir las reglas de análisis.
- El starter se genera fuera del árbol y se fusiona conservando toda la documentación.
- PostgreSQL es obligatorio para desarrollo y pruebas; no se habilitará SQLite como
  alternativa silenciosa. Redis es coordinación descartable y tendrá una prueba integrada
  separada cuando el servicio local esté disponible.

## Pasos

- [x] Crear Laravel 13 con starter Vue oficial y fusionarlo sin perder el rol.
- [x] Confirmar lockfiles/versiones y actualizar `stack.md`.
- [x] Desactivar registro público hasta decisión.
- [x] Configurar PostgreSQL y Redis reproducibles.
- [x] Crear estructura modular mínima y prueba de límites.
- [x] Configurar archivos privados y pruebas fake.
- [x] Configurar colas y un job smoke posterior al commit.
- [x] Agregar Docker Compose de desarrollo y `.env.example` seguro.
- [x] Agregar formato, lint, tipos, pruebas, build y CI.
- [x] Agregar health checks y logging estructurado mínimo.
- [x] Verificar instalación local limpia y documentar comandos.

## Pruebas

- smoke de sesión y página autenticada;
- conexión/migración PostgreSQL;
- fake de Redis/cola y prueba integrada Redis separada;
- disco privado no accesible por URL pública;
- arquitectura de dependencias;
- CI desde checkout limpio.

## Riesgos y reversión

- El starter puede cambiar: el lockfile manda y ADR-0004 se actualiza.
- SSO no confirmado: conservar Fortify detrás de servicios/política sustituible.
- No crear datos de producción; seeders solo sintéticos.

## Evidencia de cierre

- `composer verify` aprobado el 2026-08-14: 72 pruebas, 295 aserciones, Larastan nivel 7,
  ESLint, Prettier, TypeScript, Pint y build Vite.
- PostgreSQL 18 en `55432` y Redis 8 en `56379` comprobados localmente.
- Job smoke real despachado a Redis y completado por worker con progreso 100 %.
- CI definida en `.github/workflows/verify.yml`; el enlace remoto depende del primer push.
- Arranque, cuentas sintéticas y comandos documentados en `README.md`.
