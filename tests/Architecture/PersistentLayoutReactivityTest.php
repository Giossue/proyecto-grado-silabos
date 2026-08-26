<?php

/**
 * El layout de Inertia es persistente: el `setup` de sus componentes corre una sola vez y
 * no se repite al navegar ni al cambiar de rol. Derivar `page.props` a una constante
 * congela la interfaz con el estado del primer render; el menú lateral llegó a quedarse
 * sin las opciones del rol activo por ese motivo.
 */
it('deriva el estado de pagina de forma reactiva en el layout persistente', function (): void {
    $root = dirname(__DIR__, 2);
    $componentes = [
        'resources/js/components/AppSidebar.vue',
        'resources/js/components/NavUser.vue',
        'resources/js/components/AppSidebarHeader.vue',
    ];
    // AppShell queda fuera a propósito: su `isOpen` alimenta `default-open`, que el
    // proveedor del sidebar solo lee al montar y luego gobierna con su propia cookie.

    foreach ($componentes as $ruta) {
        $archivo = $root.'/'.$ruta;
        expect($archivo)->toBeReadableFile();
        $contenido = (string) file_get_contents($archivo);

        preg_match_all(
            '/const\s+(\w+)\s*=\s*(?:page|usePage\(\))\.props(?![^;]*computed)/m',
            $contenido,
            $coincidencias,
        );

        expect($coincidencias[1])->toBe(
            [],
            "{$ruta} deriva page.props a una constante; use computed para que el layout persistente reaccione.",
        );
    }
});

it('construye el menu lateral como valor calculado', function (): void {
    $contenido = (string) file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/AppSidebar.vue',
    );

    expect($contenido)
        ->toContain('const mainNavItems = computed<NavItem[]>(')
        ->toContain('const activeRole = computed(');
});
