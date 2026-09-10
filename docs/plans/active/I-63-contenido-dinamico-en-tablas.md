# I-63 — Contenido dinámico dentro de tablas

## Estado

Completado por solicitud explícita del responsable del producto el 2026-09-09.

## Trazabilidad

RF-017..026, RF-037..044; RN-009..012, RN-020..024; CU-04, CU-07;
ADM-06 y DOC-04. No depende de una decisión `POR VALIDAR` y no cambia permisos.

## Resultado demostrable

Al editar una tabla, Administración selecciona una celda y usa **Insertar** para añadir
texto automático de la fotografía (`@`), una respuesta que completará Docencia o una
marca condicional ligada a una opción. El guardado persiste tanto el documento como
las nuevas definiciones de campo en la transacción existente.

## Decisiones

- `@clave` sigue reservado para datos automáticos del catálogo seguro.
- Un campo docente se muestra por su nombre; su clave técnica se genera sin pedirla.
- `$clave` sigue reservado para columnas de filas repetibles.
- Una marca condicional compara una respuesta contra una opción y presenta `X` cuando
  coincide; no ejecuta código ni expresiones libres.
- Las acciones de datos repetibles solo aparecen cuando el bloque tiene un `TableLayout`;
  una tabla fija como Identificación se diseña directamente.

## Cambios previstos

- Extender el editor de tabla con menú de inserción y diálogo de campo nuevo.
- Exponer opciones normalizadas de los campos al constructor.
- Conservar y validar opciones de campos nuevos dentro del documento.
- Añadir pruebas PHP y Chromium y actualizar trazabilidad.

## Pasos

- [x] Implementar inserción de variable, campo y marca condicional.
- [x] Persistir campos de selección y sus opciones de forma segura.
- [x] Ocultar configuración repetible en tablas fijas.
- [x] Verificar resolución, guardado e interacción.
- [x] Actualizar documentación durable.

## Riesgos y reversión

El riesgo principal es insertar referencias inválidas o perder la selección de celda al
abrir el menú. El servidor normaliza claves, tipos y opciones antes de escribir. La
reversión elimina los controles nuevos sin migraciones; los nodos ya válidos siguen
siendo compatibles con el resolvedor documental.

## Evidencia de cierre

- `php artisan test tests/Feature/Configuration/TemplateDocumentTest.php`: 16 pruebas,
  157 aserciones.
- `npm run lint:check`, `npm run types:check` y `npm run build`: aprobados.
- `tests/Browser/template-table-content.mjs`: aprobado en Chromium; cubre `@`, alta de
  campo de selección y reutilización inmediata como marca condicional.
