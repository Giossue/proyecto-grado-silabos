<?php

/**
 * El control de tema vive en el encabezado compartido, así que lo alcanzan los tres
 * roles sin declarar nada por pantalla. Si alguien lo mueve a una página concreta, esta
 * prueba lo delata.
 */
it('ofrece el control de tema en el encabezado autenticado', function (): void {
    $raiz = dirname(__DIR__, 2);
    $encabezado = (string) file_get_contents($raiz.'/resources/js/components/AppSidebarHeader.vue');

    expect($encabezado)
        ->toContain('AppearanceToggle')
        ->and($raiz.'/resources/js/components/AppearanceToggle.vue')->toBeReadableFile();

    // El layout autenticado es uno solo: si dejara de incluir el encabezado, el control
    // desaparecería para todos los roles a la vez.
    $layout = (string) file_get_contents($raiz.'/resources/js/layouts/app/AppSidebarLayout.vue');
    expect($layout)->toContain('AppSidebarHeader');
});

it('ofrece las notificaciones en el encabezado y no en el menu lateral', function (): void {
    $raiz = dirname(__DIR__, 2);
    $encabezado = (string) file_get_contents($raiz.'/resources/js/components/AppSidebarHeader.vue');
    $menu = (string) file_get_contents($raiz.'/resources/js/components/AppSidebar.vue');

    expect($encabezado)
        ->toContain('notificationsIndex')
        ->toContain('page.props.notifications.unread_count')
        ->toContain('?? 0')
        ->toContain("page.component === 'Notifications/Index'")
        ->toContain('<TooltipContent>Notificaciones</TooltipContent>')
        ->not->toContain('sin leer')
        ->toContain('<Badge')
        ->toContain('<AppearanceToggle />');
    expect($menu)
        ->not->toContain("title: 'Notificaciones'")
        ->not->toContain('notificationsIndex');
});

it('ofrece el control de tema tambien sin haber entrado', function (string $archivo): void {
    // Quien todavía no inició sesión también necesita poder cambiar de tema.
    $contenido = (string) file_get_contents(dirname(__DIR__, 2).'/'.$archivo);

    expect($contenido)->toContain('AppearanceToggle');
})->with([
    'resources/js/layouts/auth/AuthSimpleLayout.vue',
    'resources/js/pages/Welcome.vue',
]);

it('conserva las tres opciones de tema y no las reduce a un interruptor', function (): void {
    $control = (string) file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/AppearanceToggle.vue',
    );

    // El tema visible se anuncia con el Tooltip compartido, no con `title` nativo:
    // ambos a la vez mostrarían dos burbujas sobre el mismo botón.
    expect($control)
        ->toContain("'light'")
        ->toContain("'dark'")
        ->toContain("'system'")
        ->toContain('aria-label')
        ->toContain('<TooltipContent>Tema: {{ current.label }}</TooltipContent>')
        ->not->toContain(':title=');
});

it('recorre los temas con una pulsacion en vez de abrir un menu', function (): void {
    // El control es un botón que cicla las tres opciones. Si vuelve a ser un menú
    // desplegable, cada cambio costaría dos interacciones en lugar de una.
    $control = (string) file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/AppearanceToggle.vue',
    );

    expect($control)
        ->toContain('@click')
        ->toContain('% options.length')
        ->not->toContain('DropdownMenu');
});

it('mantiene el encabezado a la vista y sin repetir el nombre de la pantalla', function (): void {
    $raiz = dirname(__DIR__, 2);

    $encabezado = (string) file_get_contents($raiz.'/resources/js/components/AppSidebarHeader.vue');

    // Fijo arriba y con fondo propio: sin fondo, el contenido se leeria por debajo.
    expect($encabezado)
        ->toContain('sticky top-0')
        ->toContain('bg-background');

    // El layout comparte las migas para que la pantalla sepa que dice el encabezado.
    $layout = (string) file_get_contents($raiz.'/resources/js/layouts/app/AppSidebarLayout.vue');
    expect($layout)->toContain('provide(breadcrumbsKey');

    $marco = (string) file_get_contents($raiz.'/resources/js/components/domain/PageFrame.vue');

    // El titulo se esconde cuando repite, pero sigue siendo un `h1` para el lector de
    // pantalla: quitarlo dejaria la pagina sin encabezado de nivel uno.
    // La pantalla entrega su nombre al encabezado y no lo dibuja. Nada oculto: el
    // nombre que se ve arriba es el encabezado de nivel uno de la pagina.
    expect($marco)
        ->toContain('usePageTitle')
        ->toContain('pageTitle.value = props.title')
        ->not->toContain('<h1');

    $migas = (string) file_get_contents($raiz.'/resources/js/components/Breadcrumbs.vue');
    expect($migas)
        ->toContain('<h1')
        ->toContain('aria-current="page"');
});

it('aparta de las franjas del sistema todo lo que se pega a un borde', function (string $archivo, string $regla): void {
    // El telefono reserva una franja para la barra de estado arriba y para la de gestos
    // abajo. Hoy la pagina no se dibuja debajo de ellas —falta `viewport-fit=cover` en la
    // plantilla— asi que estas medidas valen cero. Estan puestas para que el dia que
    // alguien pida el borde a borde no haya que descubrir uno por uno que quedo tapado.
    $contenido = (string) file_get_contents(dirname(__DIR__, 2).'/'.$archivo);

    expect($contenido)->toContain($regla);
})->with([
    // Boton flotante de acciones y el hueco que reserva bajo la tabla.
    ['resources/js/components/domain/PageFrame.vue', 'env(safe-area-inset-bottom)'],
    ['resources/js/components/domain/PageFrame.vue', 'env(safe-area-inset-right)'],
    // Panel de detalle de una fila, que sube desde abajo.
    ['resources/js/components/ui/table/TableRow.vue', 'env(safe-area-inset-bottom)'],
    // Hoja de filtros, que baja desde arriba.
    ['resources/js/components/domain/MobileFilterSheet.vue', 'env(safe-area-inset-top)'],
    // Encabezado fijo.
    ['resources/js/components/AppSidebarHeader.vue', 'env(safe-area-inset-top)'],
]);

it('explica el boton que abre y cierra el menu', function (): void {
    $raiz = dirname(__DIR__, 2);
    $boton = (string) file_get_contents($raiz.'/resources/js/components/ui/sidebar/SidebarTrigger.vue');

    // Un boton que es solo un dibujo necesita decir en algun sitio lo que hace.
    expect($boton)
        ->toContain('TooltipContent')
        ->toContain("'Mostrar menú'")
        ->toContain("'Ocultar menú'")
        ->toContain(':aria-label="label"');

    // El menu flotante de la barra reducida sale pegado a su icono: repetir el titulo
    // dentro hacia que la primera opcion pareciera un encabezado.
    $nav = (string) file_get_contents($raiz.'/resources/js/components/NavMain.vue');
    expect($nav)->not->toContain('DropdownMenuLabel');
});
