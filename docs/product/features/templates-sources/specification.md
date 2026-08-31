# Plantillas y fuentes

## Trazabilidad

- RF-017 a RF-033; CU-04 y CU-05.
- RN-009 a RN-016.
- ADM-05 a ADM-07; COR-11.
- PV-01, PV-02, PV-07 y PV-08.

## Comportamiento

- Una plantilla borrador se compone de bloques y campos tipados. En la interfaz, un
  **bloque** es una parte principal del documento (por ejemplo, «Evaluación») y un
  **campo** es un contenido dentro de ese bloque (por ejemplo, «Criterios de
  evaluación»). Las entidades de persistencia conservan su estructura interna sin
  exponerla a quien configura la plantilla.
- Las definiciones dinámicas nunca crean o eliminan tablas físicas.
- La previsualización usa datos de prueba antes de publicar.
- Publicar crea una versión inmutable con identidad y vigencia.
- Clonar crea otra identidad; desactivar solo impide usos futuros.
- Una fuente conserva autoridad, responsable, alcance, versión, vigencia, estado y huella.
- Una convocatoria activa versiones específicas de fuentes.
- Las contradicciones exactas se detectan y requieren resolución humana.
- En ADM-05 y COR-11, el listado es la vista inicial y la creación se abre desde
  una acción principal en un panel lateral derecho; los errores permanecen visibles
  hasta corregirse y el panel solo se cierra después de una respuesta exitosa.
- ADM-06 aplica el mismo patrón al alta y edición de campos, y el detalle de COR-11 al
  alta de fragmentos; la estructura o evidencia existente permanece como contenido
  principal.

## Criterios críticos

- No se publica una plantilla con marcador DOCX obligatorio sin mapeo.
- Un sílabo histórico sigue renderizando aunque la plantilla se desactive.
- La evidencia de IA nunca usa una fuente inactiva o fuera de vigencia.
- Modificar una versión publicada falla en servidor, aunque se fuerce la petición.
