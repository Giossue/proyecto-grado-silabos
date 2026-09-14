# I-75 — Malla con estructura fija

## Decisión confirmada

La malla no admite que una carrera cree columnas o atributos arbitrarios para sus
asignaturas. Sus campos académicos son fijos, tipados y forman parte de
`asignaturas`. Los únicos componentes editables de la malla son sus materias,
ciclos, orden y relaciones de requisito.

## Cambio

1. Retirar el EAV académico: `definiciones_campo_malla` y
   `valores_campo_asignatura`.
2. Conservar los campos tipados de `asignaturas`; ACD, APE, AA, créditos y total se
   presentan como conjunto fijo. El total se deriva de ACD + APE + AA.
3. Retirar rutas, casos de uso y validación de `custom_values`.
4. Mantener `requisitos_asignatura`, programación, paralelos y
   `docentes_paralelo`: expresan relaciones reales, no atributos flexibles.
5. La migración `000060` aborta si encuentra definiciones libres o valores EAV, para
   evitar pérdida silenciosa.

## Verificación previa

El 2026-09-14, local y producción tenían cero definiciones libres y cero valores EAV.

## Despliegue

La migración elimina tablas que el artefacto anterior consulta. Debe desplegarse el
artefacto de esta decisión junto con `000060`, con una breve ventana de mantenimiento o
compatibilidad controlada; no se aplica aislada sobre la aplicación antigua.
