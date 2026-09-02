# Arquitectura del sistema

## Vista ejecutiva

La solución es un **monolito modular Laravel** con interfaz Inertia/Vue. PostgreSQL
conserva el estado académico y la trazabilidad; Redis coordina trabajos; los archivos se
guardan de forma privada; la IA y la importación institucional son adaptadores externos.

```text
Navegador
  │ HTTPS + sesión + Inertia
  ▼
Aplicación Laravel 13
  ├─ Identidad y acceso
  ├─ Estructura académica
  ├─ Plantillas y fuentes
  ├─ Convocatorias
  ├─ Sílabos y revisiones
  ├─ Revisión y aprobación
  ├─ Validación determinística
  ├─ Documentos y notificaciones
  ├─ Auditoría y reportes
  └─ Integraciones
       │                 │
       ▼                 ▼
  PostgreSQL       Redis + workers
       │                 ├─ exportación Word/PDF
       │                 ├─ análisis de IA
       │                 └─ importación/notificaciones
       ├─ almacenamiento privado
       ├─ servicio HTTP local de IA
       └─ fuente institucional de solo lectura/importación
```

## Dirección de dependencias

```text
Presentación HTTP/Inertia
        ↓
Aplicación (casos de uso, transacciones, DTO)
        ↓
Dominio (reglas, estados, políticas invariantes)
        ↓
Infraestructura (Eloquent, Redis, archivos, HTTP, documentos)
```

El dominio no importa Vue, Inertia, Redis, clientes HTTP ni detalles de almacenamiento.
La infraestructura implementa puertos definidos por los módulos. Laravel puede unirlos
en proveedores de servicio sin convertir cada módulo en un microservicio.

## Módulos

| Módulo | Responsabilidad principal |
|---|---|
| Identidad | usuarios, roles, sesiones y alcance efectivo |
| Académico | carreras, periodos, mallas, asignaturas, ofertas y asignaciones |
| Configuración | plantillas, campos, fuentes, versiones y publicación |
| Convocatorias | proceso institucional, preparación por carrera, apertura, pausas, plazos y seguimiento |
| Sílabos | borradores, secciones, revisiones, colaboradores y estados |
| Revisión | observaciones, respuestas, comparación, aprobación y reapertura |
| Validación | reglas determinísticas y resultados reproducibles |
| IA | ejecuciones, recomendaciones, evidencia y retroalimentación |
| Documentos | archivos privados, Word/PDF y artefactos versionados |
| Operaciones | notificaciones, auditoría, outbox, trabajos e informes |
| Integraciones | importaciones, reconciliación y conflictos institucionales |

Consulta `docs/architecture/modules.md` para límites y dependencias permitidas.

## Invariantes arquitectónicos

- El monolito es la unidad de despliegue; los módulos son límites de código y datos.
- PostgreSQL es la única fuente de verdad transaccional.
- Redis puede vaciarse sin perder información académica.
- Las revisiones y versiones publicadas se insertan; no se sobrescriben.
- Las transiciones de estado pasan por un único servicio de dominio/aplicación.
- Toda autorización crítica se evalúa en servidor y sobre el registro concreto.
- IA, correo, almacenamiento e importación se acceden mediante interfaces.
- La aplicación principal funciona cuando la IA está fuera de servicio.
- La generación documental y tareas lentas se ejecutan en cola.
- La auditoría registra actor, acción, recurso, tiempo, metadatos y resultado.

## Estructura de código objetivo

```text
app/
├── Modules/
│   ├── Identity/
│   ├── Academic/
│   ├── Configuration/
│   ├── Campaigns/
│   ├── Syllabi/
│   ├── Review/
│   ├── Validation/
│   ├── AiAssistance/
│   ├── Documents/
│   ├── Operations/
│   └── Integrations/
│       ├── Application/
│       ├── Domain/
│       ├── Infrastructure/
│       └── Presentation/
├── Providers/
└── Support/
resources/js/
├── components/
│   ├── ui/
│   └── domain/
├── composables/
├── layouts/
├── lib/
├── pages/
│   ├── Admin/
│   ├── Coordinator/
│   └── Teacher/
└── types/
database/
├── factories/
├── migrations/
└── seeders/
tests/
├── Feature/
├── Unit/
└── Architecture/
```

Esta estructura es una guía. Si el código demuestra que un agrupamiento más simple es
mejor, registra el cambio en ADR y conserva los límites de dependencia.

## Decisiones registradas

- `ADR-0001`: monolito modular con Laravel/Inertia.
- `ADR-0002`: historial mediante revisiones y versiones inmutables.
- `ADR-0003`: IA desacoplada y bajo control humano.
- `ADR-0004`: starter Vue vigente de Laravel 13 con Inertia 3.

Los detalles están en `docs/architecture/adr/`.
