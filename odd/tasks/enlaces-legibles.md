# Enlaces legibles con códigos

Objetivo: las direcciones de carrera y materia usan códigos en vez de UUID. Rama: main. Pruebas: `npx vitest run` en apps/api y apps/web.

## Specs
- S1 Direcciones (sílabos y revisiones quedan igual):
  - `/admin/carreras/:career/{malla,materias-asignaciones,docentes,proyecto-carrera}`
  - `/admin/carreras/:career/proyecto-carrera/:malla/:subject`
  - `/coordinacion/proyecto-carrera/:malla/:subject`
  - `/docente/historial/:career`
  `:career` = código de carrera, `:malla` = código de malla, `:subject` = código de materia (solo es único dentro de su malla).
- S2 «Eso pasa en toda la vida jajam eso nadie lo puede cuidar, enseguida debería lanzarle un 404 y ya»: un código que ya no existe (o un enlace antiguo) da 404; sin redirecciones.
- S3 «pongamos algo estandar»: los códigos de carrera, malla y materia solo admiten letras sin tilde, números y guiones simples (`^[A-Za-z0-9]+(-[A-Za-z0-9]+)*$`), en formularios, API e importaciones de Excel, con un mensaje claro en español.
- S4 Menú lateral, títulos, ayuda de pantalla (screenHelpCatalog.json y screenTours.ts), navegación, guardas y pruebas (incluidas e2e) siguen funcionando.

## Tasks
- T1 | S1-S4 | delegada (respaldo de contexto) | implementada, sin commit; e2e sin ejecutar

## Log
- L1 (2026-11-26) «los links son bien raros, por ejemplo acá https://silabos.devs-ueb.tech/admin/estructura-academica/carreras/<uuid>/docentes o en el proyecto de carrera, se maneja bien raro eso, no podemos simplificar eso mejor? puedes mapear como se generan los links que no sé si será de los ids de las tablas pero eso toca mejorar como digo»
- L2 «1. Eso pasa en toda la vida jajam eso nadie lo puede cuidar, enseguida debería lanzarle un 404 y ya / 2. entonces miremos como hacerlo mejor pues, pongamos algo estandar / 3. pues hazlo iugal»
- L3 Códigos actuales (VPS y local) ya cumplen S3.
- L4 (2026-11-26) T1: RED observado antes de implementar (shared 2, api 4, web 26 fallos). GREEN: `npx vitest run` shared 164/164, api 2503/2503, web 1156/1156; `tsc` api sin errores y web sin errores fuera de `.next/` (24 en tipos generados antiguos que aún nombran las rutas movidas). Lint: solo los avisos previos. Pendiente: `apps/api/scripts/fusionar-carreras.sql` renombra mallas como «código (código absorbido)», fuera de S3 y de las superficies autorizadas.
- L(minúsculas) (2026-11-26) «ahi te recomendario todo en minuscula, o sea que en las uel»: las direcciones usan los códigos en minúsculas; unicidad sin distinguir mayúsculas.
