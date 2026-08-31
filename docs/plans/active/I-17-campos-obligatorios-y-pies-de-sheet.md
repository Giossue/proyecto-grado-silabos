# I-17: Campos obligatorios y pies fijos de formularios

## Estado

Implementado y verificado automáticamente el 2026-08-30 por solicitud explícita del
responsable del producto. La comprobación visual manual en dispositivos reales permanece
dentro de PV-19.

## Trazabilidad

- RNF-001..036 como cobertura transversal de usabilidad y accesibilidad.
- UI-01..04; ADM-02..07; COR-02, COR-05..06 y COR-11..15; DOC-04 y DOC-08.
- Los CP individuales no constan formalmente en el repositorio.
- No depende de una decisión `POR VALIDAR`: solo hace visible la obligatoriedad ya
  definida por los `FormRequest` y no cambia permisos, estados ni reglas académicas.

## Decisión

- Toda etiqueta de un dato obligatorio muestra un asterisco rojo y una indicación
  accesible de «obligatorio».
- Los controles personalizados exponen `required` o `aria-required` de acuerdo con la
  validación del servidor.
- Las acciones de todos los formularios `FormSheet` permanecen en un pie fijo; solo el
  contenido central se desplaza y conserva espacio inferior para no ocultar campos.
- Todo campo textual ofrece un ejemplo contextual mediante `Ej. ...`; las etiquetas y
  ayudas visibles no revelan claves internas ni nombres de persistencia.
- Las condiciones `required_if`, `required_unless` y `required_without` se explican sin
  convertirlas en requisitos incondicionales.

## Pasos

- [x] Inventariar formularios, `Sheet` y reglas de validación relacionadas.
- [x] Incorporar el indicador compartido en etiquetas y leyendas.
- [x] Alinear controles visibles con las reglas obligatorias del backend.
- [x] Fijar las acciones de `FormSheet` en su pie compartido.
- [x] Incorporar ejemplos en los campos textuales y retirar ayudas técnicas visibles.
- [x] Agregar pruebas de regresión y actualizar trazabilidad.
- [x] Ejecutar formato, lint, tipos, pruebas y build aplicables.

## Evidencia

- `composer verify`: 257 pruebas y 2397 aserciones; escaneo de secretos, Pint, PHPStan,
  ESLint, Prettier, tipos Vue y compilación Vite en verde.
- `RequiredFieldsAndSheetFooterTest`: protege el indicador accesible, los 18 formularios
  `FormSheet`, el pie fijo a todo el ancho, los ejemplos de campos textuales y las reglas
  mínimas/condicionales del servidor.
- Pruebas funcionales enfocadas de autenticación, configuración personal, estructura
  académica, configuración y sílabos: 104 pruebas y 952 aserciones en verde.

## Riesgos y reversión

- El asterisco no sustituye el nombre accesible ni el mensaje de validación.
- El pie no sale del elemento `form`; el navegador y Laravel conservan su validación.
- No se agregan reglas `required` al backend: la auditoría comprueba las existentes y
  cualquier diferencia se corrige en presentación, sin inventar datos mínimos.
