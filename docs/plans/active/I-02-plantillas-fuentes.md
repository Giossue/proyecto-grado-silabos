# I-02: Plantillas y fuentes versionadas

## Estado

Implementado y verificado automáticamente. El cierre depende de la revisión manual de
interfaz y de las puertas `PV-01`, `PV-02`, `PV-07` y `PV-08`; ver
`docs/plans/pending-work.md`. `composer verify` en verde el 2026-08-21: 163 pruebas y 1887 aserciones.

## Trazabilidad

- RF-017 a RF-033; RN-009 a RN-016; CU-04 y CU-05.
- ADM-05 a ADM-07; COR-11.
- PV-01, PV-02, PV-07 y PV-08.

## Resultado demostrable

El administrador diseña y previsualiza una plantilla tipada sin cambiar el esquema de
base, y publica una versión inmutable. Coordinación o administración versiona fuentes
estructuradas, activa una versión con huella y recibe un conflicto determinístico cuando
otra fuente vigente contradice el mismo dato exacto.

## Decisiones y supuestos

- PV-01 bloquea la autoridad institucional definitiva. El prototipo permite publicar
  solo al Administrador como control técnico temporal, claramente reemplazable.
- PV-07 bloquea el motor/mapeo DOCX final. La publicación valida estructura y marcadores
  declarados, pero no selecciona librería ni genera el documento oficial.
- PV-08 bloquea fórmulas oficiales. Se almacenan reglas declarativas; no se inventan
  fórmulas académicas.
- PV-02 bloquea precedencia automática. Las contradicciones se bloquean y requieren
  resolución humana; el sistema no escoge una fuente ganadora.

## Casos de uso

### CU-04 — Diseñar y publicar plantilla

- Actor: Administrador con rol vigente.
- Flujo: crea plantilla/version, secciones, bloques y campos; previsualiza; publica.
- Errores: claves duplicadas, estructura vacía, tipos no admitidos, marcador obligatorio
  sin correspondencia o intento de mutar una versión publicada.
- Efecto: publicación transaccional, huella SHA-256 y evento de auditoría.
- Evidencia prevista: pruebas de validador, inmutabilidad y pantalla ADM-05/06/07.

### CU-05 — Versionar y activar fuentes

- Actor: Coordinador dentro de su carrera o Administrador técnico.
- Flujo: crea fuente, versión y fragmentos con datos estructurados y vigencia; activa.
- Errores: alcance ajeno, versión vacía, fechas inválidas o contradicción exacta.
- Efecto: versión inmutable/activa, huellas por fragmento y fuente, conflicto persistente.
- Evidencia prevista: políticas por carrera, pruebas de conflicto y pantalla COR-11.

## Cambios previstos

- Dominio: tipos de campo, estados de versión, validación y huellas canónicas.
- Backend: acciones transaccionales de diseño/publicación y versión/activación.
- Datos: tablas de configuración sin DDL dinámico; restricciones de versión/estado.
- Frontend: listados, constructor de página completa, previsualización y fuentes.
- Seguridad/auditoría: alcance por rol y carrera, y versiones publicadas append-only.
- Trabajos/integraciones: DOCX y extracción quedan detrás de puertos para I-05/I-07.

## Pruebas

- autorización Administrador/Coordinador/Docente y alcance de carrera;
- claves estables y tipos válidos;
- publicar exige estructura representativa y congela la versión;
- clonación crea identidad nueva;
- activación calcula huella y desactiva uso futuro sin borrar historia;
- contradicción exacta crea conflicto y no elige precedencia;
- `composer verify`.

## Pasos

- [x] Crear esquema y modelos de plantillas/fuentes.
- [x] Implementar constructor y previsualización ADM-05/06/07.
- [x] Implementar publicación inmutable y clonación.
- [x] Implementar gestión de fuentes COR-11.
- [x] Implementar detección/resolución humana de conflictos.
- [x] Alinear las altas de ADM-05 y COR-11 con el panel lateral derecho compartido.
- [x] Mover campos de ADM-06 y fragmentos de COR-11 al mismo panel sin ocultar la
      estructura o evidencia existente.
- [x] Actualizar trazabilidad y verificación automatizada.
- [ ] Completar validación institucional de PV-01/PV-02/PV-07/PV-08 y prueba manual UX.

## Riesgos y reversión

- No se guarda HTML arbitrario ni código ejecutable en reglas.
- Las fórmulas quedan como esquema declarativo validado, sin evaluación genérica.
- Cualquier elección de DOCX o precedencia requiere cerrar su PV y otra migración/ADR.
- Las versiones publicadas nunca se corrigen en sitio; se clonan.

## Evidencia de cierre

- `TemplateAndSourceTest`: 8 pruebas, 53 aserciones focalizadas.
- PostgreSQL bloquea mutación directa de campos publicados mediante trigger.
- Contradicción exacta persiste, requiere justificación humana y se audita.
- ADM-05 y COR-11 priorizan sus listados y abren el formulario de alta desde una
  acción principal en un panel lateral derecho.
- ADM-06 abre el alta/edición de campos y COR-11 el alta de fragmentos desde el mismo
  `Sheet`; los errores permanecen dentro del panel.
- `ManagementCreationUiTest` impide volver a incrustar estas altas en sus páginas.
- `composer verify`: 140 pruebas, 1374 aserciones, análisis y build aprobados.
- No se eligió motor DOCX, fórmula oficial ni precedencia institucional.
