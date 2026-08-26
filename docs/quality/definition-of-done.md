# Definition of Done

Una unidad está terminada solo si las secciones aplicables se cumplen.

## Producto y trazabilidad

- [ ] Resultado y alcance coinciden con la especificación.
- [ ] RF/RNF/RN/CU/UI/CP relacionados están identificados.
- [ ] Criterios de aceptación se demostraron.
- [ ] No se codificó como confirmado un `PV` abierto.
- [ ] Fuera de alcance no se incorporó por accidente.

## Implementación

- [ ] Respeta límites de módulo y dirección de dependencias.
- [ ] Controladores/páginas no concentran reglas de negocio.
- [ ] Entradas, errores y contratos externos están tipados/validados.
- [ ] Mutaciones críticas son transaccionales e idempotentes cuando corresponde.
- [ ] Efectos asíncronos ocurren después del commit.
- [ ] No hay código muerto, flags temporales olvidados o TODO sin registro.

## Datos

- [ ] Cambios de esquema usan migración revisada.
- [ ] Constraints, índices, claves y estrategia de borrado son explícitos.
- [ ] Forward, backfill, verificación y recuperación están considerados.
- [ ] Datos históricos/inmutables no se sobrescriben.
- [ ] Seeders/fixtures son sintéticos y reproducibles.

## Seguridad y privacidad

- [ ] Autenticación y autorización por registro probadas.
- [ ] Denegación no filtra contenido o existencia indebida.
- [ ] Archivos y exportaciones permanecen privados.
- [ ] CSRF, XSS, inyección, mass assignment, rate limits y uploads se evaluaron.
- [ ] Logs/errores no contienen secretos ni contenido sensible innecesario.
- [ ] Dependencias nuevas fueron justificadas y verificadas.

## Interfaz

- [ ] Usa componentes/patrones existentes y lenguaje académico.
- [ ] Carga, vacío, error, permiso, conflicto, pendiente y éxito están resueltos.
- [ ] Formularios muestran campo, causa y acción correctiva.
- [ ] Teclado, foco, lector, contraste, claro/oscuro y 360 px se revisaron.
- [ ] No muestra UUID, rutas ni detalles de proveedor.
- [ ] Recomendaciones de IA y validaciones determinísticas se distinguen.

## Pruebas y calidad

- [ ] Pruebas unitarias cubren invariantes/reglas nuevas.
- [ ] Pruebas feature cubren éxito, validación, permiso, conflicto e idempotencia.
- [ ] Integraciones tienen fake/contrato y prueba real separada cuando aplica.
- [ ] Pruebas de regresión protegen cada defecto corregido.
- [ ] Formato, análisis, tipos, pruebas y build pasan desde un checkout limpio.
- [ ] No se debilitó una prueba para ocultar un fallo.

## Operación y documentación

- [ ] Logs, métricas y auditoría permiten diagnosticar sin exponer datos.
- [ ] Trabajos tienen timeout, reintentos, idempotencia y estado observable.
- [ ] Documentación/ADR/plan/trazabilidad están sincronizados.
- [ ] Se registró cualquier deuda diferida con impacto.
- [ ] Hay evidencia de verificación y estrategia de reversión.

Si un ítem aplicable falla, el trabajo no está Done aunque compile.

