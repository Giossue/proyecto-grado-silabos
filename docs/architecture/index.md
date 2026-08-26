# Índice de arquitectura

## Lectura por tarea

| Si vas a... | Lee |
|---|---|
| Crear el repositorio | `stack.md`, `bootstrap.md`, `deployment.md` |
| Implementar un caso de uso | `modules.md`, `backend.md`, especificación de producto |
| Cambiar el esquema | `database.md` y skill `create-migration` |
| Crear una pantalla | `frontend.md` y checklist frontend |
| Crear un trabajo | `queues-and-jobs.md`, `observability.md` |
| Generar Word/PDF | `files-and-documents.md` |
| Trabajar con IA | `ai-service.md`, especificación de IA y threat model |
| Importar datos | `integrations.md` y pendientes PV-09/PV-10 |
| Cambiar despliegue | `deployment.md`, seguridad y un ADR |
| Adoptar una dependencia | `stack.md`, plan activo y ADR si es duradera |

## Principios

1. Monolito modular antes que distribución prematura.
2. Casos de uso explícitos antes que lógica repartida en controladores.
3. Invariantes en dominio y base de datos cuando sea posible.
4. Autorización en cada frontera y por registro.
5. Historial apend-only para evidencia académica.
6. Integraciones sustituibles detrás de contratos.
7. Asincronía observable para trabajo lento.
8. Degradación segura: la IA no es dependencia del núcleo.
9. Decisiones costosas registradas en ADR.
10. Pruebas y trazabilidad como parte del diseño.

