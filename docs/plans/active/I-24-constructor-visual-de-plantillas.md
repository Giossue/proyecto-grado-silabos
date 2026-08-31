# I-24 — Constructor visual de plantillas

## Objetivo

Reemplazar el panel de configuración de campos por un constructor visual de bloques,
inspirado en el flujo de Google Forms: creación contextual con `+`, edición directa y
reordenamiento mediante arrastrar y soltar.

## Alcance y supuesto confirmado por producto

- Un bloque es una parte principal del documento, como «Evaluación»; no es un campo de
  contenido ni un catálogo fijo.
- Cada bloque contiene uno o varios campos. Cada campo tendrá un nombre visible y un
  tipo de contenido pedagógico: texto, tabla, lista con viñetas o lista numerada.
- Se puede crear, ordenar y eliminar bloques; dentro de cada bloque se puede crear,
  ordenar y eliminar campos de forma independiente.
- Los códigos técnicos y las referencias `PV-#` no se muestran en la interfaz; se
  mantienen solo en documentación y reglas internas cuando sean necesarias.

## Trazabilidad

- RF-017..026; RN-009..012; CU-04; ADM-05..07.
- RNF-001, RNF-010, RNF-022 y RNF-025.
- UI: I-24.

## Plan

- [x] Definir persistencia y compatibilidad entre bloques visibles y valores históricos.
- [x] Crear casos de uso y validación para crear, actualizar y reordenar bloques de borrador.
- [x] Sustituir el panel por el constructor visual accesible, con creación contextual y arrastrar/soltar.
- [x] Adaptar la edición docente a los cuatro tipos de contenido y conservar plantillas publicadas.
- [x] Eliminar referencias `PV-#` de toda interfaz y mensajes visibles.
- [x] Añadir pruebas de dominio, interfaz y regresión; ejecutar verificaciones completas aplicables.
- [x] Corregir la jerarquía visible: Bloque como parte del documento y Campo como su contenido.

## Riesgo controlado

Las versiones publicadas y los sílabos existentes se conservan tal como están. La nueva
experiencia opera únicamente sobre borradores y toda modificación de estructura sigue
siendo transaccional y autorizada.

## Resultado

El constructor se incorporó en `ADM-05`: cada bloque contiene campos con nombre y tipo
de contenido editables en el sitio. Bloques y campos se pueden agregar, eliminar y
reordenar por arrastre o con controles de teclado; las flechas ofrecen una alternativa
accesible al arrastre. Las versiones publicadas se mantienen solo de lectura.

Las pruebas específicas del módulo y las comprobaciones de formato, tipos de la
interfaz y compilación finalizaron correctamente. La suite global conserva fallos
ajenos ya existentes en Estructura académica, Asistencia de IA, Convocatorias, el
control de apariencia y Redis local; no se modificaron en este alcance.
