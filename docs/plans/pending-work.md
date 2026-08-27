# Trabajo pendiente

Corte del 26 de agosto de 2026. Este documento separa lo que falta según de quién
depende, porque son cosas de naturaleza distinta y no se resuelven igual.

## 1. Código: sin deuda

No hay `TODO`, `FIXME` ni funcionalidad a medias en `app/`, `resources/js/`, `database/`
ni `routes/`. La verificación completa —formato, análisis estático, tipos, pruebas y
compilación— pasa desde un checkout limpio: **204 pruebas y 2148 aserciones**.

Los quince incrementos están implementados y verificados. Ninguno tiene trabajo de
programación pendiente dentro de su alcance, salvo lo que las puertas `PV` mantienen
deliberadamente sin implementar.

I-15 cerró el último hueco funcional conocido: el plazo de la convocatoria ya tiene fecha
de inicio, se puede prorrogar con motivo y bloquea el envío al vencer; el relevo de un
docente es un acto único con sustento documental; y la coordinación encargada se distingue
de la titular.

## 2. Depende de una persona: revisión manual

Es el trabajo que queda del lado de los autores. No se puede automatizar y bloquea el
cierre de casi todos los planes, porque la Definition of Done lo exige.

| Qué | Dónde aplica | Por qué no está hecho |
|---|---|---|
| Teclado, foco y lector de pantalla | Las 29 páginas operativas | Requiere una persona navegando |
| Contraste percibido, zoom 200 % y 360 px | Todas las superficies | La comprobación hecha es de cálculo, no de percepción |
| Claro y oscuro en dispositivos reales | Toda la interfaz | `PV-19` fija la matriz de navegadores |
| Prueba con usuarios `DT-07` | Revisión y aprobación (I-04) | Necesita docentes reales |
| Fidelidad del DOCX contra el documento oficial | Documentos (I-05) | Depende de `PV-07` |

El guion paso a paso está en `docs/quality/manual-review-script.md`.

La ejecución de CI en remoto dejó de estar pendiente el 2026-08-26: el flujo
`Verificación` corre en GitHub Actions sobre cada push a `main` y pasa en verde.

## 3. Depende de la UEB: 17 puertas abiertas

No son tareas de programación: son decisiones que solo la institución puede tomar. El
sistema está construido para no suplantarlas, y por eso muestra avisos donde una de ellas
sigue abierta.

| Puerta | Decisión | Quién decide |
|---|---|---|
| PV-01 | Autoridad que emite, aprueba y publica la plantilla | Coordinación/autoridad |
| PV-02 | Precedencia entre malla, proyecto, guías y disposiciones | Autoridad académica |
| PV-03 | Periodo exacto de pilotaje y aceptación | Dirección/coordinación |
| PV-04 | Responsable de aceptación funcional | Dirección/coordinación |
| PV-05 | Cantidad real de docentes, paralelos, asignaciones y sílabos | Coordinación |
| PV-07 | DOCX oficial y reglas de exportación | Autoridad de plantilla |
| PV-08 | Fórmula y redondeo oficial de horas, créditos y totales | Coordinación/fuente |
| PV-11 | Conservación, backup, RPO y RTO | Técnico/autoridad |
| PV-12 | Base legal, finalidad y aviso de privacidad | UEB/datos |
| PV-13 | Hardware disponible para IA local | Personal técnico/autores |
| PV-14 | Modelos locales de embeddings y generación | Autores/evaluación experta |
| PV-15 | Correo institucional y contenido de avisos | Técnico/coordinación |
| PV-16 | Edición excepcional de contenido por coordinador | Coordinación |
| PV-17 | Instrumento y población para medir el proceso actual | Dirección/autores |
| PV-18 | Umbrales de utilidad y precisión de IA | Coordinación/docentes expertos |
| PV-19 | Navegadores y dispositivos reales | Técnico/usuarios |
| PV-20 | Línea, sublínea, director, pares y fechas académicas | Integración Curricular |

`PV-09` y `PV-10` se cerraron en I-11 con el acceso al respaldo institucional. El riesgo
asumido al cerrarlas está anotado en `decisions-pending.md`: se sostienen en evidencia
técnica directa, no en confirmación escrita de la UEB.

## 4. Estado de los planes

Los catorce siguen en `docs/plans/active/` a propósito. El propio criterio del proyecto lo
exige: *«Un plan no se mueve por código escrito; se mueve cuando cumple Definition of
Done»*, y la Definition of Done incluye la revisión manual de interfaz del punto 2.

| Plan | Implementación | Qué falta para cerrarlo |
|---|---|---|
| I-00 | completa | CI ejecutada en remoto |
| I-01 | completa | revisión manual de interfaz |
| I-02 | completa | revisión manual y `PV-01`, `PV-02`, `PV-07`, `PV-08` |
| I-03 | completa | revisión manual y `PV-05`, `PV-08` |
| I-04 | completa | revisión manual, `DT-07` y `PV-16` |
| I-05 | completa | fidelidad del DOCX y `PV-07`, `PV-11`, `PV-12`, `PV-15` |
| I-06 | completa | evaluación experta y `PV-02`, `PV-13`, `PV-14`, `PV-18` |
| I-07 | retirada el 2026-08-27 | ninguna; el módulo se eliminó |
| I-08 | completa | pruebas con participantes y dispositivos reales |
| I-09, I-10 | completas | revisión manual de interfaz |
| I-11 | completa | ninguna; cerró `PV-09` y `PV-10` |
| I-12 | completa | ninguna; solo renombrado |
| I-13 | completa | revisión manual de interfaz |
| I-14 | completa | ninguna; solo renombrado |
| I-15 | completa | revisión manual de interfaz; cerró `PV-06` y `DT-08` a `DT-11` |

## 5. Orden sugerido

1. Llevar a Coordinación las puertas que bloquean el sílabo en sí: `PV-07` y `PV-08`.
   Sin ellas, el documento generado no puede declararse oficial. `PV-06` se cerró el
   2026-08-26 con la consulta registrada en
   `references/entrevista-2026-08-26-hallazgos.md`.
2. Resolver `PV-12` antes de acercar cualquier dato personal real al sistema.
3. Hacer la revisión manual de interfaz del punto 2, que desbloquea el cierre de diez
   planes a la vez.
4. Ejecutar la CI en remoto para cerrar I-00.
