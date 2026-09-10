# I-58 — Configuración estructural de tablas

## Estado

Implementación técnica verificada localmente el 2026-09-08. I-66 reemplaza su formulario
por edición directa desde la tabla; el contrato interno y la compatibilidad permanecen.

## Problema

El diseño visual distingue variables automáticas, campos y datos repetibles solo por su
tipo interno. En la tabla, los datos de unidad y columna aparecen como recuadros con su
etiqueta, por lo que pueden confundirse con variables obtenidas de la base. Además, el
contrato ya representa columnas, cabeceras de unidad, repetición y totales, pero
Administración no dispone de un flujo comprensible para configurarlos después de crear
la tabla.

## Decisión confirmada

- `@clave` identifica exclusivamente una variable automática resuelta desde el contexto
  académico o institucional.
- `$clave` identifica un dato repetible de la tabla que completa Docencia o calcula el
  sistema. No consulta otra fuente de datos.
- Administración configura la estructura mediante nombres y opciones; no ve ni escribe
  los roles técnicos `unit`, `record` o `total`.
- Cambiar la estructura reconstruye el diseño de la tabla con el nuevo contrato. La
  interfaz lo advierte porque las combinaciones y estilos particulares de esa tabla se
  restablecen; después puede volver a aplicar formato desde **Editar tabla**.

## Alcance y trazabilidad

- RF-017..026 y RF-037..044.
- RN-009..012 y RN-020..024.
- CU-04 y CU-07.
- ADM-06 y DOC-01..05.
- Extiende I-56 e I-57; no cambia la autoridad de la malla ni las reglas de envío.

## Unidad vertical

- [x] Mostrar los nodos `column` como `$clave` y conservar `@clave` para variables.
- [x] Añadir un diálogo de estructura desde el modal de tabla.
- [x] Permitir configurar repetición por unidades, datos de cabecera, columnas, tipos,
      uso semántico y totalización.
- [x] Guardar esquema y reiniciar el documento visual de la tabla de forma atómica,
      protegida por huella, bloqueo, confirmación y auditoría.
- [x] Mantener compatibilidad con tablas existentes, grupos y bandas conservados.
- [x] Cubrir servidor, TypeScript y recorrido Chromium.
- [x] Actualizar producto, arquitectura y trazabilidad.

## Criterios de aceptación

1. En el editor, `@nombre_carrera` sigue siendo variable automática y una columna se ve
   como `$semana`, `$acd` o la clave correspondiente.
2. Administración puede agregar, renombrar, ordenar y quitar columnas sin escribir
   claves técnicas.
3. Una columna se define como texto o número; solo las numéricas pueden totalizarse o
   asumir los usos Semana, ACD, APE y AA.
4. Administración puede activar unidades, nombrarlas y agregar sus datos de cabecera.
5. El esquema inválido se rechaza en servidor y los usos semánticos no se duplican.
6. Guardar estructura reconstruye el molde, mantiene la configuración global de la
   plantilla y no modifica revisiones ya enviadas.
7. El formulario docente repite unidades y filas según el esquema resultante.

## Verificación prevista

- pruebas de `TableLayout`, actualización de estructura y snapshot;
- `composer types:check` y pruebas PHP focalizadas;
- `npm run types:check`, ESLint focalizado y `npm run build`;
- prueba Chromium del constructor en 1440 px y 360 px.

## Evidencia local

- `TemplateDocumentTest` y `TemplateAndSourceTest`: 31 pruebas y 301 aserciones.
- Pint focalizado y PHPStan: aprobados sin errores.
- `vue-tsc`, ESLint focalizado, Prettier y compilación Vite: aprobados.
- `template-visual-builder.mjs`, `document-pagination.mjs` y
  `template-document-editor.mjs`: 3 recorridos aprobados en Chromium; el primero cubre
  el diálogo estructural, generación automática de claves y vista de 360 px.
