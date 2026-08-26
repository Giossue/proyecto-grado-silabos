<?php

/**
 * La contraseña temporal la genera la interfaz, no la escribe el administrador. Estas
 * reglas evitan que vuelva a pedirse a mano —donde acaba siendo débil o repetida— o que
 * reaparezca un campo de confirmación que ya no confirma nada.
 */
it('genera la contrasena temporal en el cliente y no pide confirmarla', function (): void {
    $control = (string) file_get_contents(
        dirname(__DIR__, 2).'/resources/js/components/domain/identity/ManagedUserSheet.vue',
    );

    expect($control)
        ->toContain('generateTemporaryPassword')
        ->toContain('@click="regenerate"')
        ->toContain('readonly')
        ->not->toContain('password_confirmation');
});

it('cubre en el generador las cuatro clases que exige la politica del servidor', function (): void {
    $root = dirname(__DIR__, 2);
    $generator = (string) file_get_contents($root.'/resources/js/lib/temporaryPassword.ts');
    $request = (string) file_get_contents(
        $root.'/app/Modules/Identity/Presentation/Http/Requests/CreateManagedUserRequest.php',
    );

    // Si la política del servidor sube el mínimo, la longitud generada debe seguirla.
    preg_match('/Password::min\((\d+)\)/', $request, $minimo);
    preg_match('/TEMPORARY_PASSWORD_LENGTH = (\d+)/', $generator, $longitud);

    expect((int) $longitud[1])->toBeGreaterThanOrEqual((int) $minimo[1]);
    expect($generator)
        ->toContain('LOWERCASE')
        ->toContain('UPPERCASE')
        ->toContain('DIGITS')
        ->toContain('SYMBOLS')
        ->toContain('crypto.getRandomValues');

    // El servidor deja de confirmar, así que la validación tampoco debe exigirlo.
    expect($request)->not->toContain("'confirmed'");
});
