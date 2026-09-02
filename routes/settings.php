<?php

use App\Http\Controllers\Settings\ProfileController;
use App\Http\Controllers\Settings\SecurityController;
use Illuminate\Support\Facades\Route;

Route::middleware(['auth'])->group(function () {
    Route::redirect('settings', '/settings/profile');

    Route::get('settings/profile', [ProfileController::class, 'edit'])->name('profile.edit');
    Route::patch('settings/profile', [ProfileController::class, 'update'])->name('profile.update');
});

Route::middleware(['auth', 'verified'])->group(function () {
    // Sin volver a pedir la contraseña: la sesión ya autenticó a la persona.
    Route::get('settings/security', [SecurityController::class, 'edit'])->name('security.edit');

    Route::put('settings/password', [SecurityController::class, 'update'])
        ->middleware('throttle:6,1')
        ->name('user-password.update');

    Route::inertia('settings/appearance', 'settings/Appearance')->name('appearance.edit');
});

/*
 * Copias de Configuración por área, para que la dirección diga desde qué rol se mira,
 * como el resto de pantallas. Las direcciones cortas de arriba siguen funcionando.
 */
foreach (['admin' => 'admin', 'coordination' => 'coordinacion', 'teacher' => 'docente'] as $prefix => $segment) {
    Route::prefix($segment)->name("{$prefix}.")->middleware(['auth', 'verified', 'active-role'])->group(function (): void {
        Route::get('configuracion/perfil', [ProfileController::class, 'edit'])->name('profile.edit');
        Route::get('configuracion/seguridad', [SecurityController::class, 'edit'])->name('security.edit');
        Route::inertia('configuracion/apariencia', 'settings/Appearance')->name('appearance.edit');
    });
}
