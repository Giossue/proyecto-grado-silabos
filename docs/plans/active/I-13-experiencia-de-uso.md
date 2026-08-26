# I-13: Rol activo, panel con indicadores y superficie visual

## Estado

Implementado y verificado el 2026-08-26. `composer verify` en verde: 204 pruebas y
2148 aserciones. El cierre depende de la revisión manual descrita en
`docs/plans/pending-work.md`.

El 2026-08-26 el control de tema dejó de ser un menú desplegable y pasó a recorrer las
tres opciones con una sola pulsación, sin perder ninguna.

## Trazabilidad

- RF-001..007 (rol activo), RF-066..075 (panel e informes), RNF-001..036 como cobertura
  no funcional agregada.
- RN-001..004; CU-01, CU-02 y CU-15.
- UI-02, ADM-04 y DOC-10.
- No abre ni cierra ninguna puerta `PV`.

## Cambios

### Rol activo

- Con un único rol elegible se activa solo: elegir entre una sola opción no es elegir.
  Con dos o más, el selector se conserva intacto, que es el caso que la separación de
  responsabilidades protege. Con ninguno se muestra la pantalla, que explica la
  situación.
- El selector desaparece del menú lateral y del panel cuando la persona tiene un solo
  rol.
- Un identificador de sesión que deja de ser válido —asignación vencida, revocada o de
  otra persona— se descarta y se vuelve a aplicar la regla del rol único, en lugar de
  dejar a la persona sin rol.

### Panel

- «Acciones principales» y la tarjeta de rol se sustituyen por cuatro indicadores por
  rol, calculados en `DashboardController` con el alcance del rol activo: Administración
  cuenta global, Coordinación dentro de su carrera y Docencia solo los expedientes en
  los que colabora.
- Los indicadores usan el contrato de `StatTile`: etiqueta, valor con figuras
  proporcionales y una línea de contexto. Sin variación respecto a un periodo anterior,
  porque no existe una serie temporal que la respalde.
- La insignia con el nombre del rol se retira: la identidad ya está en el pie del menú.

### Navegación y superficie

- El menú lateral se construye como valor calculado. Antes se derivaba a una constante y,
  al vivir en el layout persistente de Inertia, se congelaba con el estado del primer
  render: quien entraba sin rol activo se quedaba sin opciones para toda la sesión.
- Una entrada con subopciones se despliega y contrae, y con el menú reducido a iconos
  las muestra en un menú flotante sin expandir la barra.
- El control de tema pasa al encabezado compartido, así que alcanza a los tres roles sin
  declararlo por pantalla. Conserva las tres opciones de Configuración y las recorre en
  ciclo —claro, oscuro, sistema— con una sola pulsación, sin abrir un menú.
- Las tablas dejan de repetir en su tarjeta el título y la descripción de la página: 14
  cabeceras retiradas en 10 archivos.

### Color y elevación

- La tarjeta pasa a ser más clara que el fondo en ambos temas, de modo que su sombra la
  eleve en lugar de hundirla.
- El contorno de las superficies usa un anillo con token propio por tema, en vez de un
  borde de color fijo que en oscuro resultaba duro.
- La sombra se define como escala del sistema —control, superficie, menú y modal— y cada
  tema fija su valor. En oscuro no se usan sombras: la separación la dan el color y el
  anillo.

## Defectos corregidos

| Defecto | Causa | Prueba que lo protege |
|---|---|---|
| El menú lateral se quedaba sin las opciones del rol | Constante en un layout persistente | `PersistentLayoutReactivityTest` |
| Un panel de edición se reabría al guardar | La clave del componente incluía los datos editados, así que Inertia lo recreaba con el panel todavía abierto | `SheetReopeningTest` |
| Quien perdía la validez de su rol en sesión se quedaba sin ninguno | No se reintentaba la regla del rol único | `ActiveRoleTest` |

## Verificación

- `DashboardMetricsTest`: cada rol recibe sus indicadores y ninguno cuenta datos fuera de
  su alcance.
- `ActiveRoleTest`: activación del rol único, ausencia de activación con varios roles y
  rechazo del rol ajeno.
- `HeaderAppearanceControlTest`, `PersistentLayoutReactivityTest` y
  `SheetReopeningTest` como reglas de arquitectura.
- `ManagementCreationUiTest` deja de fijar valores de color y comprueba la relación entre
  fondo y superficie, que es lo que debe sostenerse aunque la paleta cambie.

## Fuera de alcance

No cambia autorización, alcance por carrera ni ciclo de vida del sílabo. La comprobación
de contraste realizada es de cálculo, no de percepción: teclado, lector, zoom y
dispositivos reales siguen en `PV-19`.
