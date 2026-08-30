# I-18 — Constructor visual de mallas flexibles

## Objetivo

Transformar la gestión de mallas de Coordinación en un constructor por versión de malla
que reproduzca la lectura académica del documento institucional, sin fijar la estructura
de Software como formato universal. La misma información se podrá mantener mediante el
constructor visual o mediante formularios y tablas accesibles.

## Origen y decisión confirmada

El responsable del producto confirmó el 2026-08-30 que una malla llega asociada a una
carrera y puede variar en cantidad de ciclos, campos visibles y composición. Por ello la
configuración pertenece a cada versión de malla y no al frontend global.

`Malla-Software-8-ciclos2.pdf` se usa como evidencia visual representativa: contiene ocho
ciclos, 43 asignaturas, 5.760 horas, tarjetas con código/nombre/ACD/APE/AA/créditos,
unidades de organización curricular, relaciones y resúmenes. No se convierte en una
plantilla rígida para otras carreras.

El documento usa flechas de más de un color, pero no presenta una leyenda que confirme
su semántica. La implementación no deduce que un color sea prerrequisito o correquisito:
el tipo de relación se persiste explícitamente y su significado institucional se valida
por separado.

## Trazabilidad

- RF-008..016; RN-005..008; CU-03.
- ADM-04 y COR-13..15.
- CP-F estructura, alcance, configuración, inmutabilidad, auditoría y alternativa
  accesible.
- PV-08 continúa abierta para fórmulas, redondeo y expansión oficial de siglas de horas.

## Diseño

- `Vue Flow` aporta lienzo, zoom, desplazamiento, selección y conexiones; no contiene
  reglas de dominio ni es fuente de verdad.
- `versiones_malla` conserva configuración de presentación por versión, incluida la
  cantidad de ciclos.
- `asignaturas` conserva ciclo y orden estable; las coordenadas del lienzo se derivan y
  no se persisten como dato académico.
- Las definiciones de campos de tarjeta pertenecen a la versión de malla. Los valores
  adicionales pertenecen a la asignatura y están tipados por su definición.
- `requisitos_asignatura` conserva relaciones explícitas dentro de la misma versión.
- Una malla publicada, sus asignaturas, configuración, campos y relaciones son
  inmutables.
- El servidor aplica alcance por carrera, transacciones, validación y auditoría en toda
  mutación. El cliente solo refleja permisos.
- La vista visual y la vista formulario consumen el mismo contrato y ejecutan los mismos
  casos de uso.

## Entrega vertical

1. Registrar la adopción de Vue Flow y fijar dependencias en npm.
2. Agregar persistencia para ciclos, orden y campos configurables sin editar migraciones
   aplicadas.
3. Crear consulta autorizada y página completa del constructor por malla.
4. Implementar nodos académicos, relaciones y vista formulario equivalente.
5. Incorporar mutaciones de configuración, asignaturas, campos y relaciones en borrador.
6. Probar alcance lateral, validación, inmutabilidad, auditoría y contrato frontend.
7. Actualizar arquitectura, trazabilidad y evidencia de verificación.

## Criterios de aceptación

- Una coordinación solo abre y modifica mallas de su carrera vigente.
- La cantidad de ciclos no está fijada a ocho.
- Los campos visibles de una tarjeta se agregan, ordenan u ocultan por versión.
- El orden visual se reconstruye desde ciclo/posición, no desde coordenadas libres.
- Crear una conexión guarda una relación explícita; no se aceptan autorrelaciones,
  duplicados ni relaciones entre versiones distintas.
- Una persona puede realizar las operaciones esenciales sin usar arrastre.
- Una versión publicada se muestra en solo lectura y rechaza mutaciones en servidor.

## Verificación

- Pruebas feature sobre PostgreSQL para el caso de uso y sus constraints.
- Prueba de arquitectura/UI para ruta, página completa y alternativa formulario.
- `npm run lint:check`, `npm run format:check`, `npm run types:check`, build y pruebas PHP
  focalizadas; `composer verify` como puerta final cuando PostgreSQL y Redis estén
  disponibles.

### Evidencia local — 2026-08-30

- `composer verify`: 261 pruebas, 2.482 aserciones, sin fallos.
- ESLint, Prettier, Vue TypeScript, Pint y PHPStan nivel 7: correctos.
- Build Vite de producción: correcto; el constructor se genera como chunk propio.
- La configuración de ciclos y campos usa la variante de pantalla completa del Sheet;
  lint, tipos, build y 20 pruebas de arquitectura (595 aserciones) correctos.
- Revisión manual pendiente: teclado, lector de pantalla, zoom, móvil y temas sobre un
  navegador/dispositivo real; `PV-08` continúa abierta.

## Riesgos y reversión

- Vue Flow queda aislado en componentes de presentación; retirarlo no cambia el esquema
  académico ni los casos de uso.
- Las tablas nuevas son aditivas. La reversión elimina primero valores/definiciones y
  luego columnas nuevas, sin tocar versiones publicadas existentes.
- El lienzo grande necesita comprobación manual de teclado, lector, zoom y móvil; la
  tabla/formulario es la alternativa funcional, no una versión degradada de los datos.
