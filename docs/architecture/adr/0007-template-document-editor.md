# ADR-0007: Editor acotado de plantilla con Tiptap y PHPWord

- Estado: Aceptado para I-56
- Fecha: 2026-09-06
- Autoridad: petición explícita del responsable; editor simple, no una suite Word.
- Sustituye: limitación visual de I-34 a tablas prefabricadas; conserva su modelo de datos.

## Contexto y opciones

El administrador necesita celdas combinadas horizontal y verticalmente, formato básico,
campos docentes y variables automáticas, dentro de los bloques actuales. PHPWord
genera documentos en servidor y no ofrece un editor de navegador. Un contenteditable
propio exigiría implementar selección, historial y geometría de tablas. Una suite de
oficina incrustada añade infraestructura e importación documental fuera del alcance
que el responsable ratificó; el laboratorio fue retirado.

## Decisión

Usar Tiptap Vue 3 con StarterKit acotado, tablas, textStyle, textAlign y mention, versión
3.31.3 fijada. Núcleo y extensiones seleccionadas MIT; sin servicios, colaboración en
tiempo real ni extensiones comerciales. Reutilizar shadcn-vue existente para la cinta.

El contrato durable no es HTML: un JSON permitido y limitado, validado por Laravel en
`TemplateDocument`. Permiso administrador, alcance de bloque, transacción, bloqueos del
proceso, confirmación de reinicio y fingerprint son independientes de Tiptap. Campos
retirados conservan definición y referencias históricas, pero dejan de ser obligatorios
o editables; reinsertarlos restaura sus opciones anteriores. No se agregan migraciones.

Las tablas repetibles conservan datos tipados, encabezados de unidad y sumas. No se
combinan celdas entre grupos que se expanden diferentes cantidades de veces. Cada
revisión copia diseño y variables resueltas. PHPWord traduce el contrato validado para
DOCX; no ejecuta HTML ni obtiene recursos de URLs incluidas en el documento.

## Consecuencias y verificación

Se agrega peso frontend y una dependencia del adaptador de edición, no del dominio.
El editor tiene límites de 2 MB, 6000 nodos, 12 niveles, 100 filas de diseño por tabla y
24 columnas; las filas generadas con datos docentes pueden superar las filas de diseño.
Las variables se amplían en un archivo PHP para fuentes ya incluidas en el snapshot.

Pruebas de navegador cubren formato, mención con teclado, combinación/separación,
guardado/reapertura, errores y controles exclusivos de Docencia. Pruebas PHP cubren
contrato, permisos, conflictos, reinicio confirmado, conservación histórica y DOCX.
PV-07 (fidelidad documental), PV-08 (fórmulas) y PV-19 (dispositivos reales) no se cierran.

Revisar la elección ante incompatibilidad con Vue/Vite, cambios de licencia o fallos de
accesibilidad que no puedan corregirse con la cinta y los controles compartidos.

## Referencias

- [Integración oficial con Vue 3](https://tiptap.dev/docs/editor/getting-started/install/vue3)
- [Extensión Table](https://tiptap.dev/docs/editor/extensions/nodes/table)
- [Extensión Mention](https://tiptap.dev/docs/editor/extensions/nodes/mention)

Trazabilidad: RF-017..026, RF-037..044, RF-066..074; RN-009..012, RN-031..034;
CU-04/06/15; ADM-06, DOC-01, COR-06; I-56.
