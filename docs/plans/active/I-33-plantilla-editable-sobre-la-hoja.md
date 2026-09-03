# I-33: Plantilla editable sobre la hoja

## Estado

Implementado el 2026-09-02. Verificado en navegador local: soltar «Tabla» desde la paleta
crea el campo con el nombre en edición, Enter lo guarda; el menú del campo cambia tipo,
abre Propiedades y elimina; arrastrar el asa de un bloque lo reordena y avisa «Orden
guardado». Arquitectura (105) y `TemplateAndSourceTest` (12) en verde; eslint, vue-tsc
y build sin errores.

## Objetivo

El administrador arma la plantilla del sílabo sobre la hoja tal como se imprimirá,
arrastrando piezas desde una paleta y renombrando con un clic. Desaparecen el constructor
por tarjetas con formularios y el conmutador Editar / Vista previa: hay una sola
superficie, y con el proceso abierto se muestra de solo lectura.

## Trazabilidad

- RF-017..026; RN-009..012; CU-04; ADM-06.
- RNF-001, RNF-010, RNF-022 y RNF-025.
- Decisión del responsable del producto (2026-09-02): el constructor por tarjetas resulta
  abrumador; se quiere «arrastrar, pocos clics» como en la malla interactiva. Vue Flow no
  aplica porque la plantilla no tiene relaciones, solo orden y contenido.

## Estándar del impreso (análisis del sílabo IA-SW-2026)

Hoja carta, márgenes de 2.5 cm, Arial 11 pt, interlineado sencillo y 6 pt entre párrafos.
Logos UEB y Facultad arriba, título azul 0070C0 centrado. Bloques «1.» en 12 pt negrita,
campos «1.1» en 11 pt negrita. Tablas de 9 pt con cabecera azul 4F81BD y texto blanco,
filas alternas celeste DBE5F1. Listas con sangría francesa de 0.63 cm.

## Plan

- [x] Paleta con cinco piezas (Bloque, Texto, Tabla, Lista con viñetas, Lista numerada):
      arrastrables a la hoja y con clic que agrega al final del bloque activo.
- [x] Zonas de soltado entre bloques y entre campos, con línea indicadora.
- [x] Reordenar bloques y campos arrastrando su asa.
- [x] Renombrar con un clic sobre el título; Enter guarda, Escape cancela.
- [x] Barra flotante por campo: asa, menú con tipo de contenido, propiedades y eliminar.
- [x] Propiedades avanzadas (obligatorio, heredado, editable por docente, IA, ayuda,
      marcador) en un Sheet reutilizando `TemplateFieldSheet`.
- [x] Guardado automático con aviso corto; sin botones «Guardar».
- [x] Modo solo lectura cuando el proceso está abierto.
- [x] Pruebas de arquitectura, documentación de pantalla y verificación en navegador.

## Decisiones y alcance

- Sin cambios de backend: crear, renombrar, reordenar y eliminar ya existen. Los códigos
  técnicos (`key`) se generan en el cliente a partir del nombre más un sufijo único y no
  se muestran.
- Los bloques se reordenan entre sí arrastrando el asa de su título. Un campo se reordena
  solo dentro de su bloque (decisión del responsable del producto, 2026-09-02); al
  arrastrarlo, solo se abren las zonas de ese bloque.
- Arrastre nativo del navegador; en pantallas pequeñas la paleta se agrega con clic.
- El borrado de bloques y campos pide confirmación en un Dialog; el borrado de sílabos en
  curso sigue pasando por el diálogo global de I-32.

## Ajuste del 2026-09-03: propiedades del campo

«Propiedades» de un campo queda en dos cosas: la ayuda para el docente y, en los campos
que el docente escribe, si la IA puede asistirlo. Se retiraron «Obligatorio» (todo el
formato es obligatorio: `SaveFieldDefinition` guarda siempre `obligatorio = true` y la
plantilla por defecto ya no trae campos opcionales), «Editable por docente», «Se llena
desde la malla» y su dato de origen (solo la ficha de identificación se llena sola, y es
un bloque fijo) y «Marcador en el documento exportado». Los bloques fijos (identificación
y estado de revisión) solo admiten ayuda.
