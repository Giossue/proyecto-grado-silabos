# Casos de uso

| ID | Caso de uso | Actor principal | Requisitos |
|---|---|---|---|
| CU-01 | Iniciar y cerrar sesión | Todos | RF-001, RF-002, RF-007 |
| CU-02 | Gestionar usuarios y roles | Administrador | RF-003 a RF-006 |
| CU-03 | Gestionar estructura académica global y por carrera | Administrador/Coordinador | RF-008 a RF-016 |
| CU-04 | Diseñar y publicar plantilla | Administrador | RF-017 a RF-026 |
| CU-05 | Versionar y activar fuentes | Coordinador/Administrador | RF-027 a RF-033 |
| CU-06 | Abrir convocatoria de sílabos | Coordinador | RF-034 a RF-036 |
| CU-07 | Elaborar sílabo | Docente | RF-037 a RF-044 |
| CU-08 | Analizar contenido con IA | Docente | RF-046 a RF-054 |
| CU-09 | Enviar sílabo | Docente | RF-043, RF-045, RF-047 |
| CU-10 | Revisar y observar | Coordinador | RF-055 a RF-058 |
| CU-11 | Corregir y reenviar | Docente | RF-058 a RF-060 |
| CU-12 | Comparar revisiones | Coordinador/Docente autorizado | RF-061 |
| CU-13 | Aprobar sílabo | Coordinador | RF-062, RF-063 |
| CU-14 | Reabrir sílabo aprobado | Coordinador | RF-064 |
| CU-15 | Exportar Word y PDF | Usuario autorizado | RF-066 a RF-069 |
| CU-16 | Consultar avance e informes | Coordinador | RF-036, RF-070 a RF-072 |
| CU-17 | Auditar el proceso | Administrador | RF-073, RF-074 |
| CU-18 | Sincronizar datos institucionales | Administrador | RF-016, RF-075 |

## Plantilla breve para implementar un caso

Antes de modificar código, documenta en el plan activo:

- actor y rol;
- disparador;
- precondiciones;
- flujo principal;
- alternativas y errores;
- transición/efecto persistente;
- autorización por registro;
- evento de auditoría;
- notificaciones/trabajos posteriores al commit;
- criterios de aceptación y casos `CP`;
- dependencias `PV`.
