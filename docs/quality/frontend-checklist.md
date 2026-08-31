# Checklist frontend

## Tarea y jerarquía

- [ ] La acción principal y el siguiente paso son evidentes.
- [ ] Los botones secundarios textuales no llevan iconos de acción; los indicadores de
      carga y controles exclusivamente icónicos conservan su función.
- [ ] No hay títulos, cards o resúmenes duplicados.
- [ ] La densidad permite escanear trabajo repetido.
- [ ] Tablas se usan para colecciones comparables; páginas para workflows complejos.
- [ ] Etiquetas y estados usan el glosario.

## Datos y permisos

- [ ] No aparecen UUID, rutas, claves o proveedores.
- [ ] El servidor filtra; la UI no depende solo de ocultar controles.
- [ ] Vacío, sin permiso y no encontrado son estados distintos.
- [ ] Filtros/orden/página se preservan en URL cuando conviene.
- [ ] Conteos y filas comparten alcance.

## Formularios

- [ ] Etiquetas, ayudas y requerido son claros.
- [ ] Error indica campo, causa y corrección.
- [ ] Valores heredados muestran origen y aspecto de solo lectura.
- [ ] Pendiente bloquea duplicados sin congelar toda la pantalla.
- [ ] Guardado/guardado fallido/conflicto/cambios sin guardar son visibles.
- [ ] Una versión inmutable explica la consecuencia antes de confirmar.

## IA

- [ ] Se etiqueta como recomendación, no validación.
- [ ] Fuente, versión y fragmento se pueden consultar.
- [ ] Aplicar requiere acción explícita y muestra el cambio.
- [ ] Fallo/ausencia de evidencia no bloquea.
- [ ] Confianza no se presenta con falsa precisión.

## Accesibilidad y responsive

- [ ] Flujo completo por teclado y orden de foco lógico.
- [ ] Foco visible y restaurado en diálogos/navegación.
- [ ] Nombre/estado accesible de controles e iconos.
- [ ] Errores/cambios dinámicos se anuncian.
- [ ] Contraste y significado sin depender del color.
- [ ] Claro y oscuro revisados.
- [ ] 360 px, tablet y escritorio sin scroll horizontal global.
- [ ] Zoom 200 % y texto largo no rompen acciones.

## Calidad

- [ ] Props/emit/contratos TypeScript sin `any` evasivo.
- [ ] Componentes existentes reutilizados.
- [ ] No hay llamadas manuales paralelas que dupliquen comportamiento Inertia.
- [ ] Pruebas cubren estados y acciones críticas.
- [ ] Build, lint, tipos y pruebas pasan.

## Automatización disponible

La puerta `composer verify` ejecuta ESLint con el preset recomendado de
`eslint-plugin-vuejs-accessibility`. Verifica, entre otras reglas, asociación explícita de
etiquetas, ausencia de `autofocus` y ausencia de `tabindex` positivo. Esto reduce
regresiones estáticas, pero todos los puntos manuales anteriores permanecen abiertos hasta
registrar evidencia en `acceptance-status.md` con la matriz real de `PV-19`.
