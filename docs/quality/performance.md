# Rendimiento

## Presupuestos de línea base

- RNF-011: p95 de vistas/CRUD comunes ≤ 2 s bajo carga acordada, excluyendo IA/exportación.
- RNF-012: autoguardado confirma en ≤ 3 s o muestra pendiente/fallo.
- RNF-014: 95 % de exportaciones representativas ≤ 60 s.
- RNF-015: prueba inicial con al menos 50 usuarios autenticados concurrentes; ajustar con
  `PV-05`.

Son metas propuestas hasta la validación de volumen/infraestructura.

## Método

1. Define escenario, datos y ambiente.
2. Mide baseline con percentiles y tasa de error.
3. Localiza cuello de botella con perfiles/consultas/métricas.
4. Cambia una causa, no varios componentes a ciegas.
5. Repite igual escenario y compara.
6. Conserva prueba y presupuesto; revierte si no mejora o aumenta riesgo.

## Riesgos conocidos

- cola de revisión con relaciones N+1;
- editor cargando todas las revisiones/evidencias;
- diffs de tablas repetibles grandes;
- reportes sin índices o sin paginación;
- render DOCX/PDF en petición web;
- IA sin límite de concurrencia;
- autoguardado demasiado frecuente;
- auditoría con payload completo.

## Reglas

- Selecciona solo props necesarios en Inertia.
- Pagina y filtra en servidor.
- Usa trabajos para operaciones pesadas.
- Cachea únicamente datos derivables y define invalidación.
- Redis no corrige una consulta sin índice ni una arquitectura defectuosa.
- Mide PostgreSQL con datos representativos antes de agregar índices.

## Baseline técnico I-08

`composer benchmark:readiness` ejecuta por defecto 500 peticiones con concurrencia 50 y
solo admite URLs HTTP de loopback. El 2026-08-14, sobre el servidor PHP integrado local,
PostgreSQL 18 y Redis 8, obtuvo cero fallos, p95 0,415 s y 126,42 req/s con cachés de
producción.

Este resultado prueba el harness y el endpoint de salud; no simula sesiones, consultas de
negocio, autoguardado ni exportación, y no acepta RNF-011..015. La prueba funcional con
datos/infraestructura representativos continúa bloqueada por `PV-05`.
