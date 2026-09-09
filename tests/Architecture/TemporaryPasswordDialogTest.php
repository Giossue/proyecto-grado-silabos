<?php

/**
 * El diálogo no se puede descartar: sin botón de cierre, sin «Esc» y sin clic fuera. Es
 * la salida visible de un bloqueo que ya impone el servidor, pero si se volviera
 * descartable la pantalla diría que se puede seguir usando la aplicación cuando no.
 */
it('presenta el cambio de contrasena temporal como un dialogo que no se descarta', function (): void {
    $root = dirname(__DIR__, 2);
    $dialog = (string) file_get_contents(
        $root.'/resources/js/components/TemporaryPasswordDialog.vue',
    );
    $dialogContent = (string) file_get_contents(
        $root.'/resources/js/components/ui/dialog/DialogContent.vue',
    );

    expect($dialogContent)
        ->toContain('@escape-key-down="preventImplicitDismiss"')
        ->toContain('@interact-outside="preventImplicitDismiss"')
        ->toContain('@pointer-down-outside="preventImplicitDismiss"')
        ->toContain('event.preventDefault()')
        ->not->toContain('<DialogClose')
        ->not->toContain('showCloseButton');

    expect($dialog)
        ->toContain('<DialogContent class="sm:max-w-md">')
        ->toContain('debe_cambiar_contrasena')
        ->toContain('SecurityController.update.form()')
        ->toContain('<Save')
        // Cerrar sesión es la única alternativa a cambiarla.
        ->toContain('logout()');
});

it('monta el dialogo en el layout autenticado y no en una pagina suelta', function (): void {
    $root = dirname(__DIR__, 2);
    $layout = (string) file_get_contents($root.'/resources/js/layouts/app/AppSidebarLayout.vue');

    expect($layout)->toContain('<TemporaryPasswordDialog />');

    // Si el bloqueo dependiera solo del componente, bastaría con recargar para saltárselo.
    $middleware = (string) file_get_contents($root.'/app/Http/Middleware/RequirePasswordChange.php');
    $bootstrap = (string) file_get_contents($root.'/bootstrap/app.php');

    expect($bootstrap)->toContain('RequirePasswordChange::class');
    expect($middleware)
        ->toContain("'dashboard'")
        ->toContain("'user-password.update'")
        ->toContain("'logout'");
});
