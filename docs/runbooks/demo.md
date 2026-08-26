# Demostración funcional de los tres roles

## Propósito y límites

Este recorrido demuestra `CU-01` a `CU-18` con datos sintéticos. No valida decisiones
institucionales abiertas, no usa el formato DOCX oficial, no conecta una base UEB y no
evalúa la calidad de un modelo de IA. Los adaptadores `baseline` y `fixture` existen solo
para comprobar los contratos y la degradación segura.

## Preparación reproducible

Use únicamente la base local de demostración. `migrate:fresh` elimina todo su contenido;
antes de ejecutarlo compruebe que `.env` apunta a `silabos_ueb` en `127.0.0.1:55432` y
que no contiene datos reales.

```bash
cp .env.example .env
composer install
npm ci
docker compose up -d
php artisan key:generate
php artisan migrate:fresh --seed --force
npm run build
```

Para demostrar la IA contractual y la importación sintética, cambie solo en el ambiente
local:

```text
AI_DRIVER=baseline
INSTITUTIONAL_IMPORT_DRIVER=fixture
```

Después limpie la configuración y levante los procesos en terminales separadas:

```bash
php artisan config:clear
php artisan serve
```

```bash
php artisan queue:work redis \
  --queue=critical,notifications,documents,ai,integrations,default \
  --timeout=130 --tries=3
```

El valor `REDIS_QUEUE_RETRY_AFTER=180` debe permanecer por encima del timeout máximo de
120 segundos de los jobs. En una instalación supervisada se prefieren procesos separados
por cola; el comando combinado es suficiente para la demostración.

Las cuentas creadas por el seeder usan exclusivamente datos sintéticos:

| Rol | Correo | Contraseña |
|---|---|---|
| Administrador | `admin@silabos.test` | `Demo-2026!` |
| Coordinador | `coordinador@silabos.test` | `Demo-2026!` |
| Docente | `docente@silabos.test` | `Demo-2026!` |

## Recorrido

### 1. Administrador: gobierno institucional, cuentas y plantilla

1. Inicie sesión como Administrador y seleccione el rol **Administrador**. Esto
   demuestra `CU-01` y que el rol efectivo no se infiere del último rol usado.
2. En **Estructura académica → Facultades**, cree `Facultad de demostración` con código
   `FAC-DEMO`. Entre a **Carreras**, cree `Carrera de demostración` con código `CARR-DEMO`
   y seleccione esa facultad. Compruebe la relación en ambas tablas; Campus, Modalidades y
   Periodos académicos permanecen como submenús y colecciones globales independientes.
   Use **Editar** para corregir el nombre de la carrera y compruebe el cambio en
   **Auditoría**.
3. En **Usuarios y roles**, cree una cuenta temporal con nombre `Docente Piloto`, correo
   `docente.piloto@silabos.test`, contraseña `Pilot-2026!Secure`, rol **Docente** y carrera
   **Software**. Abra su detalle, revise la vigencia, desactívela y vuelva a activarla.
   Esto demuestra el ciclo administrado y la revocación de sesiones de `CU-02` sin alterar
   la cuenta docente principal.
4. Cree también `Coordinador Piloto`, correo `coordinador.piloto@silabos.test`, contraseña
   `Pilot-2026!Secure`, rol **Coordinador** y carrera **Carrera de demostración**. En
   **Coordinaciones**, vincúlelo a esa carrera con vigencia actual. Esto demuestra que una
   coordinación es una asignación de una cuenta y no otro catálogo de personas.
5. Vuelva a **Estructura académica → Modalidades**, cree la modalidad
   `Demostración` con código `demo`, archívela, reactívela y confirme que el historial
   permanece. Administración no debe mostrar formularios para crear materias ni asignar
   docencia.
6. En **Plantillas**, cree `Plantilla de demostración`, limitada a la carrera Software.
   En el constructor seleccione el primer bloque y agregue un campo con:

   - clave `objetivo.general`;
   - etiqueta `Objetivo general`;
   - tipo **Texto largo**;
   - ayuda `Describa el propósito formativo de la asignatura`;
   - **Obligatorio**, **Editable por docente** y **Permite asistencia de IA** activos;
   - **Heredado de maestro** inactivo.

   Publique y congele la versión. Intente editarla y confirme que la interfaz solo ofrece
   crear una versión nueva. Esto demuestra `CU-04` y la inmutabilidad de publicación.

### 2. Coordinador: estructura de carrera, fuente y convocatoria

1. Cierre sesión, ingrese como Coordinador y seleccione **Coordinador · Software**.
2. En **Mallas y materias**, cree `MALLA-SW-DEMO`, versión 2. Agregue la materia `SW-701`
   denominada `Sistemas Distribuidos`, ciclo 7, cuatro créditos y 160 horas. Publique la
   malla y compruebe que queda inmutable.
3. En **Oferta y paralelos**, abra `SW-701` para el periodo académico, campus y modalidad
   sintéticos existentes; cree el paralelo `A`. En **Asignación docente**, asigne
   `Docente Demo` a ese paralelo con vigencia actual. Ninguna opción de otra carrera debe
   aparecer. Esto completa el reparto de `CU-03`.
4. En **Fuentes académicas**, cree `Guía académica de demostración`, tipo `Guía`, autoridad
   `Coordinación de Software`, responsable `Custodia de demostración`. Abra la versión
   borrador y agregue un fragmento con clave `objetivo.referencia`, título
   `Orientación del objetivo` y contenido `El objetivo debe expresar propósito, alcance y
   resultado formativo verificable.`. Active la versión. Esto demuestra `CU-05`; la
   aplicación debe advertir que una contradicción futura requiere decisión humana.
5. En **Convocatorias**, prepare `Convocatoria de demostración`, periodo `2026-2027`, la plantilla
   publicada, agrupación **Un sílabo por oferta**, la fuente activa y una fecha límite
   posterior al momento actual. Abra el detalle, revise el resumen y pulse **Abrir y
   generar expedientes**. Deben aparecer los expedientes de `SW-601` y `SW-701`, sin
   duplicarse al repetir la acción. Esto demuestra `CU-06`.

### 3. Docente: borrador, IA y primer envío

1. Ingrese como Docente, seleccione **Docente · Software** y abra **Mis sílabos**. Confirme
   que aparecen únicamente las materias asignadas e inicie el expediente de Arquitectura
   de Software (`CU-07`).
2. Abra el editor, escriba en **Objetivo general** y espere la confirmación **Guardado**.
   Ejecute **Validar**; las validaciones determinísticas deben aparecer separadas de la
   ayuda de IA.
3. Abra **Asistencia de IA**, solicite análisis y espere al worker. La recomendación debe
   mostrar fuente, versión y fragmento. Registre aceptación o rechazo y, si corresponde,
   aplique el texto de forma explícita. Compruebe que el campo solo cambia después de esa
   acción humana (`CU-08`).
4. Regrese al editor, valide y pulse **Revisar y enviar**. En la confirmación cree la
   revisión 1. La pantalla debe explicar que el snapshot queda inmutable (`CU-09`).

### 4. Coordinador y docente: corrección, comparación y aprobación

1. Como Coordinador, abra **Revisiones**, entre a la revisión 1 y registre la observación
   `Precise el resultado formativo esperado` sobre el campo Objetivo general (`CU-10`).
2. Seleccione esa observación, escriba una justificación y solicite corrección. El estado
   debe ser **Corrección solicitada**.
3. Como Docente, abra el expediente, responda la observación, ajuste el objetivo, espere
   el autoguardado, valide y reenvíe. Debe crearse la revisión 2 sin cambiar la revisión 1
   (`CU-11`).
4. Como Coordinador, abra **Comparar revisiones** y compruebe el antes/después (`CU-12`).
   Verifique la observación respondida y apruebe la revisión 2 (`CU-13`).
5. Compruebe que el aprobado no admite edición. No lo reabra todavía: conserve ese estado
   para generar los documentos en el paso siguiente.

### 5. Documentos, informes, operación e importación

1. Desde la revisión aprobada abra **Documentos** y
   solicite DOCX/PDF. El worker de `documents` debe dejar ambos disponibles como archivos
   privados; la pantalla identifica el renderer como técnico provisional (`CU-15`).
2. Vuelva al expediente, pulse **Reabrir**, indique `Ajuste posterior de demostración` y
   confirme que se conserva la aprobación y aparece una nueva línea de trabajo en
   **Corrección solicitada** (`CU-14`).
3. Como Coordinador, abra **Informes**, filtre la convocatoria y contraste totales con su
   detalle. Ningún registro de otra carrera debe ser visible (`CU-16`).
4. Como Administrador, abra **Trabajos** y **Auditoría**. Compruebe progreso, intentos,
   correlación y eventos del recorrido, sin contenido académico completo (`CU-17`).
5. En **Integraciones**, ejecute el perfil visible **Escenario académico sintético**
   (`baseline`) una vez. Debe
   terminar con filas aceptadas/rechazadas y conflictos, sin cambiar asignaturas, mallas,
   ofertas ni asignaciones. Excluya un conflicto con justificación y repita la misma clave
   solo mediante la prueba automatizada de idempotencia. No existe acción **Aplicar**
   mientras `PV-09`, `PV-10` y `PV-12` estén abiertas (`CU-18`).
6. Cierre sesión para completar `CU-01`.

## Resultado esperado y registro

Conserve fecha, ambiente, versión del código, rol que ejecutó cada etapa y resultado. No
registre contraseñas, cookies, UUID, contenido completo ni capturas con datos personales.
La demostración es satisfactoria técnicamente cuando:

- los tres roles solo ven su rol y alcance;
- el envío, corrección, aprobación y reapertura conservan todas las revisiones;
- IA, exportación, notificaciones e importación terminan en sus colas observables;
- apagar `AI_DRIVER` no impide guardar, validar, enviar, revisar ni aprobar;
- la importación no altera catálogos académicos;
- cualquier hallazgo manual se registra en la matriz de aceptación, sin cambiar un `PV`.
