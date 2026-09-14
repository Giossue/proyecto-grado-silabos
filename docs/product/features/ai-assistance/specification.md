# Asistencia de IA

## Trazabilidad

- RF-046 a RF-054; CU-08.
- RN-015, RN-016 y RN-028 a RN-030.
- RNF-013, RNF-016, RNF-017, RNF-035 y RNF-036.
- DOC-06; CP funcionales relacionados e IA-NEG-01 a IA-NEG-09.
- PV-02, PV-13, PV-14 y PV-18.

## Comportamiento

- Solo campos/secciones habilitados solicitan análisis.
- Administración define por campo el valor predeterminado de IA y puede impedir que
  Coordinación lo sustituya para su carrera. Un valor fijado por Administración no se
  puede alterar desde Coordinación ni mediante una petición forzada.
- La solicitud se procesa en cola y muestra estado.
- La recuperación se restringe a fuentes vigentes/activas del rol.
- Cada recomendación muestra explicación, procedencia y extracto verificable.
- Aceptar o aplicar requiere acción explícita; ignorar o marcar no útil es válido.
- La ejecución conserva huellas, modelos, parámetros, fuentes, respuesta y decisión.
- Solicitudes equivalentes pueden reutilizar un resultado según una clave documentada.
- Fallo, tiempo de espera o evidencia insuficiente no bloquea el proceso principal.
- En DOC-04 hay un solo acceso global: después de validar sin errores puede solicitar en
  una acción el análisis de todos los campos textuales habilitados que tengan contenido.
  El panel agrupa el resultado por sección/campo y conserva las decisiones y citas.

## Límites

- No aprobar, rechazar, calificar, bloquear ni cambiar estado.
- No inventar una precedencia entre fuentes en conflicto.
- No modificar texto sin vista previa y confirmación humana.
- No enviar contenido a un proveedor externo distinto del autorizado expresamente en el
  despliegue ni habilitar uno por defecto.
- No presentar confianza como probabilidad científica si no está calibrada.

## Criterios críticos

- Una fuente desactivada no aparece en nueva evidencia.
- Instrucciones hostiles dentro de una fuente se tratan como datos, no órdenes.
- Toda salida conserva la versión exacta de fuente e instrucciones.
- Con el servicio de IA apagado se completan guardado, envío, revisión y aprobación.

## Estado de implementación I-06

- DOC-06 está integrado en cada campo textual con `ia_habilitada`. La solicitud fija el
  contenido, `version_bloqueo`, plantilla, reglas, idioma, versiones del contrato y de las
  instrucciones, parámetros técnicos y conjunto exacto de fuentes.
- Solo se recuperan versiones vinculadas a la convocatoria cuya fuente y versión están
  activas y vigentes para la carrera. Un conjunto vacío o mayor al límite queda como no
  concluyente. Valores exactos divergentes para la misma `clave_dato` se muestran como
  conflicto y no se ordenan mientras `PV-02` siga abierto.
- `AiAnalysisGateway` tiene implementaciones deshabilitada, HTTP local y simulador
  determinista. El cliente HTTP solo admite loopback, no sigue redirecciones, aplica
  timeout y tamaño máximo, y rechaza referencias fuera de la fotografía o acciones
  académicas en la respuesta.
- Recomendaciones y citas se insertan durante la ejecución y quedan inmutables al cerrar.
  Aceptar, ignorar y marcar no útil agregan feedback; aplicar exige confirmación,
  coincidencia de huella y concurrencia optimista, conserva antes/después y nunca cambia
  el estado del sílabo.
- `contract-simulator-v1` normaliza únicamente espacios y puntuación para demostrar el
  contrato. No es un modelo académico validado y no cierra `PV-13`, `PV-14` ni `PV-18`.
- I-73 agrega adaptadores configurables para OpenAI, Claude y DeepSeek sin cambiar el
  control humano. Comparten URL, modelo y clave; no exponen razonamiento y DeepSeek se
  invoca explícitamente en modo sin pensamiento. El proveedor alojado solo recibe el
  contenido y la evidencia que Laravel ya autorizó y fotografió.

## Ampliación I-72 en curso

- La primera rebanada sustituye la navegación separada por campo en el recorrido normal
  por un `Sheet` único dentro del editor y una solicitud global que reutiliza el análisis
  por campo. El chat libre, el contexto cruzado entre secciones y la configuración
  efectiva por carrera todavía no están implementados.
- El contrato de presentación usa `status` de forma consistente entre Laravel y Vue.
- La plantilla ya conserva `ia_coordinacion_configurable`; la preferencia efectiva por
  carrera y su resolvedor se completarán en I-72.2.
