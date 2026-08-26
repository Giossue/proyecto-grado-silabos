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

    expect($control)
        ->toContain("'light'")
        ->toContain("'dark'")
        ->toContain("'system'")
        ->toContain('aria-label');
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
