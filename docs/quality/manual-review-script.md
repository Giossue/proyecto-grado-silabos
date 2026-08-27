# Guion de revisión manual

Cubre lo que la Definition of Done exige y ninguna prueba automatizada puede demostrar:
teclado, foco, lector de pantalla, contraste percibido, zoom y ancho reducido. Al
terminarlo se desbloquea el cierre de nueve planes.

Marca cada casilla solo si se cumple. Si algo falla, anota la página y qué ocurrió al
final del documento; eso es un defecto con dueño, no una opinión.

## Antes de empezar

- Fija el tema en **Claro** u **Oscuro** desde el encabezado, nunca en «Sistema»: si
  queda en automático no sabrás cuál estás revisando.
- Ten a mano el ancho reducido: en el navegador, `F12` y activa la vista de dispositivo
  con **360 px**.
- Para el lector de pantalla en Linux, `Orca` se activa con `Super + Alt + S`.

## Muestra a revisar

No hace falta recorrer las 29 páginas. Estas seis cubren todos los patrones del sistema;
si funcionan, el resto los reutiliza.

| # | Página | Ruta | Qué patrón representa |
|---|---|---|---|
| 1 | Acceso | `/login` | Formulario simple y errores |
| 2 | Panel | `/admin/panel`, `/coordinacion/panel`, `/docente/panel` | Indicadores y encabezado |
| 3 | Carreras | `/admin/estructura-academica/carreras` | Listado, filtros, tabla, menú de fila y panel lateral |
| 4 | Usuarios | `/admin/usuarios` | Listado con estados y acciones |
| 5 | Editor de sílabo | `/docente/mis-silabos` → abrir uno → Editar | La superficie más compleja: campos dinámicos y autoguardado |
| 6 | Revisión | `/coordinacion/informes` y cola de revisión | Lectura densa y tablas anchas |

## 1. Teclado y foco

Recorre cada página de la muestra usando **solo el teclado**.

- [ ] `Tab` avanza en el orden visual, sin saltos hacia atrás ni trampas.
- [ ] **Siempre se ve dónde está el foco**: ningún elemento lo recibe de forma invisible.
- [ ] El menú lateral es alcanzable y sus submenús se abren con `Enter` o `Espacio`.
- [ ] En una tabla, el menú de tres puntos se abre con teclado y sus opciones se
      recorren con flechas.
- [ ] Al abrir un panel lateral el foco entra en él y **no se escapa** al fondo.
- [ ] `Esc` cierra el panel y el foco vuelve al botón que lo abrió.
- [ ] Tras guardar, el panel se cierra **una sola vez** y no reaparece.
- [ ] Ningún control necesita el ratón para usarse.

## 2. Lector de pantalla

Con Orca activo, sobre las páginas 3 y 5 de la muestra.

- [ ] El título de cada página se anuncia al entrar.
- [ ] Los campos se anuncian con su etiqueta, no con su posición.
- [ ] Un error de validación se anuncia y dice **qué campo** y **qué corregir**.
- [ ] Los botones de solo icono se anuncian con su propósito, no como «botón».
- [ ] La tabla se anuncia con sus encabezados de columna.
- [ ] Al abrir el panel lateral se anuncia su título.

## 3. Contraste percibido

Los cálculos ya se hicieron; esto es mirar con ojos.

- [ ] En **ambos temas**, el texto secundario gris se lee sin esfuerzo.
- [ ] Las etiquetas de estado se distinguen sin depender solo del color.
- [ ] El borde de un campo se ve antes de tocarlo.
- [ ] La tarjeta se distingue del fondo en los dos temas.
- [ ] Las sombras no crean halos sucios en oscuro.

## 4. Zoom al 200 %

Con `Ctrl` y `+` hasta el 200 %, en las páginas 3 y 5.

- [ ] No se pierde contenido ni aparecen barras horizontales.
- [ ] Nada se solapa ni queda cortado.
- [ ] Los botones siguen siendo alcanzables.

## 5. Ancho de 360 px

- [ ] El menú lateral se convierte en algo abrible y no tapa el contenido.
- [ ] Las tablas se desplazan sin romper la página.
- [ ] Los paneles laterales ocupan el ancho completo y siguen siendo usables.
- [ ] Ningún texto se corta a media palabra.

## 6. Ambos temas

Repite un recorrido rápido por la muestra cambiando de tema.

- [ ] Ningún texto queda invisible sobre su fondo.
- [ ] Los iconos se ven en los dos temas.
- [ ] Ningún elemento conserva un color del otro tema.

## Defectos encontrados

| Página | Qué ocurrió | Qué se esperaba |
|---|---|---|
| | | |

## Al terminar

Si no hay defectos, anota la fecha y quién revisó en `docs/quality/acceptance-status.md`
y marca la revisión manual como cumplida en los planes I-01 a I-05, I-08, I-09, I-10 e
I-13. Con eso pueden cerrarse y moverse a `docs/plans/completed/`.

Si aparecen defectos, cada uno se corrige con su prueba de regresión antes de cerrar.
