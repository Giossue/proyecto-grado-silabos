# Plantillas y fuentes

## Trazabilidad

- RF-017 a RF-033; CU-04 y CU-05.
- RN-009 a RN-016.
- ADM-05 a ADM-07; COR-11.
- PV-01, PV-02 y PV-07. PV-08 quedó cerrada en I-57 el 2026-09-08.

## Comportamiento

- La UEB mantiene una sola plantilla institucional de sílabo, común a todas las carreras.
  La carrera se fija en la convocatoria y en sus fuentes académicas, no en la estructura
  del documento. Solo sus versiones publicadas pueden seleccionarse para convocatorias
  nuevas.
- Una plantilla borrador se compone de bloques y campos tipados. En la interfaz, un
  **bloque** es una parte principal del documento (por ejemplo, «Evaluación») y un
  **campo** es un contenido dentro de ese bloque (por ejemplo, «Criterios de
  evaluación»). Las entidades de persistencia conservan su estructura interna sin
  exponerla a quien configura la plantilla.
- Las definiciones dinámicas nunca crean o eliminan tablas físicas.
- La previsualización usa datos de prueba antes de publicar.
- Publicar crea una versión inmutable con identidad y vigencia.
- Clonar crea otra identidad; desactivar solo impide usos futuros.
- Una fuente académica es un documento de la Coordinación de la carrera (I-26): nombre,
  descripción y un contenido en Markdown. No tiene versiones, fragmentos
  ni conflictos, y Administración no participa.
- El contenido se redacta en COR-11 como una hoja de documento visual con cinta de
  opciones (encabezados, énfasis, listas, cita, tabla con selector de tamaño, código,
  enlace y divisor). Se guarda como Markdown seguro, pero la Coordinación no ve ni
  alterna a sintaxis Markdown: el formato se aplica y se renderiza en tiempo real.
- Una convocatoria fija fuentes activas de la carrera; al abrirla deben continuar
  activas. La evidencia de IA guarda su propia fotografía (nombre, extracto y huella del
  contenido), por lo que editar la fuente después no reescribe análisis pasados.
- En ADM-05 y COR-11, el listado es la vista inicial y la creación se abre desde
  una acción principal en un panel lateral derecho; los errores permanecen visibles
  hasta corregirse y el panel solo se cierra después de una respuesta exitosa.
- I-59 deja ADM-06 como una hoja vacía sin constructor, bloques, campos, tablas ni
  personalización. La ruta no serializa esas estructuras. La persistencia anterior se
  conserva para no alterar sílabos o revisiones existentes mientras se define el nuevo
  modelo de edición. COR-11 mantiene su editor independiente.

## Criterios críticos

- No se publica una plantilla con marcador DOCX obligatorio sin mapeo.
- Un sílabo histórico sigue renderizando aunque la plantilla se desactive.
- La evidencia de IA nunca usa una fuente inactiva ni ajena a la convocatoria.
- Modificar una versión publicada de plantilla falla en servidor, aunque se fuerce la
  petición.
- Solo la Coordinación de la carrera crea o edita sus fuentes; otro rol recibe 403.
