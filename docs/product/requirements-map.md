# Mapa de requisitos y trazabilidad

## Requisitos funcionales por capacidad

| Capacidad | RF | CU |
|---|---|---|
| Identidad y acceso | RF-001 a RF-007 | CU-01, CU-02 |
| Estructura académica | RF-008 a RF-016 | CU-03, CU-18 |
| Plantillas | RF-017 a RF-026 | CU-04 |
| Fuentes | RF-027 a RF-033 | CU-05 |
| Convocatorias y elaboración | RF-034 a RF-045 | CU-06, CU-07, CU-09 |
| IA | RF-046 a RF-054 | CU-08 |
| Revisión y aprobación | RF-055 a RF-065 | CU-10 a CU-14 |
| Documentos, informes y operación | RF-066 a RF-075 | CU-15 a CU-18 |

## Requisitos no funcionales

| Grupo | RNF |
|---|---|
| Seguridad y privacidad | RNF-001 a RNF-010 |
| Rendimiento, disponibilidad y colas | RNF-011 a RNF-017 |
| Compatibilidad, accesibilidad y UX | RNF-018 a RNF-023 |
| Integridad, recuperación y trazabilidad | RNF-024 a RNF-028 |
| Mantenibilidad, despliegue, observabilidad e IA | RNF-029 a RNF-036 |

## Reglas de negocio

Las reglas `RN-001` a `RN-034` viven formalmente en la SRS. Sus invariantes de mayor
impacto también aparecen en `domain-model.md` y `syllabus-lifecycle.md`. Si una regla
cambia, actualiza primero la SRS y luego esas vistas derivadas.

## Casos de prueba

- `CP-F01` a `CP-F35`: aceptación funcional.
- `CP-N01` a `CP-N16`: cualidades no funcionales.
- `IA-NEG-01` a `IA-NEG-09`: robustez y seguridad de la asistencia de IA.

El catálogo detallado reside en el Plan Maestro de Pruebas v0.1. Al crear pruebas
automatizadas, incluye el ID en el nombre, atributo o comentario de trazabilidad.

## Registro por cambio

Cada PR o plan activo debe contener una tabla como esta:

| Tipo | IDs cubiertos | Evidencia |
|---|---|---|
| Requisito | RF-___, RNF-___ | archivo/ruta |
| Regla | RN-___ | prueba unitaria/integración |
| Caso de uso | CU-___ | prueba feature |
| Interfaz | UI/DOC/COR/ADM-___ | captura/prueba componente |
| Prueba | CP-___ / IA-NEG-___ | resultado CI |
| Pendiente | PV-___ o ninguno | decisión/ADR |

No se cierra un requisito esencial sin al menos un caso de prueba trazable.

