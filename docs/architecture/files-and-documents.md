# Archivos y documentos

## Objetos privados

Fuentes, plantillas DOCX y exportaciones viven en un disco privado. La base conserva:

- UUID del objeto;
- nombre lógico y MIME detectado;
- tamaño y huella;
- propietario y alcance;
- clasificación;
- ubicación interna no expuesta;
- fecha y estado.

Las descargas pasan por autorización por registro y usan streaming o URL temporal corta.
El nombre físico no concede acceso.

## Carga segura

- límite de tamaño y extensiones permitidas por capacidad;
- detección de tipo real, no solo nombre;
- nombre generado por servidor;
- cuarentena/escaneo cuando la infraestructura lo permita;
- rechazo de archivos activos no necesarios;
- metadatos y errores sin contenido sensible;
- limpieza de cargas abandonadas mediante trabajo controlado.

## Generación documental

Entrada inmutable:

```text
revision_id + template_version_id + renderer_version + locale
```

Proceso:

1. autorizar solicitud;
2. fijar una clave idempotente;
3. cargar snapshot de revisión y plantilla;
4. validar marcadores/mapeos;
5. generar DOCX;
6. generar PDF desde la misma entrada aprobada;
7. validar estructura y render visual;
8. calcular huella, guardar objeto y registrar artefacto;
9. notificar finalización.

El motor de generación se seleccionará después de una prueba con el DOCX oficial
(`PV-07`). Se accede mediante `DocumentRenderer`, no desde el dominio.

I-05 incorpora `baseline-ooxml-pdf-v1` como implementación técnica reversible del
puerto. Valida estructura OOXML, XML principal y marcadores PDF antes de publicar; su
salida se rotula como provisional y no demuestra fidelidad visual institucional.

## Fidelidad

Las pruebas incluyen tablas, saltos, encabezados/pies, caracteres, contenido largo,
repetibles, páginas y fuentes. La equivalencia se evalúa con contenido extraído y render
visual. Nunca declares éxito solo porque el archivo abre.

## Retención

No implementes borrado definitivo hasta resolver `PV-11` y `PV-12`. Una política futura
debe cubrir originales, artefactos, temporales, backups y derecho/obligación de conservar.
