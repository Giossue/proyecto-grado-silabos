<?php

use Illuminate\Support\Facades\Route;
use Tests\TestCase;

// Lee las rutas registradas, asi que necesita la aplicacion en pie. No toca la base.
uses(TestCase::class);

/**
 * Toda pantalla de trabajo dice desde qué rol se está mirando.
 *
 * La direccion empieza por el area —`admin/`, `coordinacion/` o `docente/`— y no por el
 * nombre suelto de la pantalla. Antes convivian las dos formas: `admin/usuarios` junto a
 * `convocatorias`, y no habia manera de saber, leyendo la barra de direcciones, con que
 * rol se estaba entrando.
 */
it('encabeza cada pantalla con el area del rol', function (string $name, string $expected): void {
    $uri = Route::getRoutes()->getByName($name)?->uri();

    expect($uri)->toBeString()->toStartWith($expected);
})->with([
    // Docencia
    ['syllabi.index', 'docente/'],
    ['syllabi.show', 'docente/'],
    ['syllabi.edit', 'docente/'],
    ['syllabi.ai.show', 'docente/'],
    ['teacher.dashboard', 'docente/'],
    ['teacher.notifications.index', 'docente/'],
    ['teacher.documents.show', 'docente/'],
    // Coordinacion
    ['convocations.index', 'coordinacion/'],
    ['convocations.show', 'coordinacion/'],
    ['reviews.index', 'coordinacion/'],
    ['reviews.show', 'coordinacion/'],
    ['reviews.compare', 'coordinacion/'],
    ['reports.index', 'coordinacion/'],
    ['coordination.dashboard', 'coordinacion/'],
    ['coordination.sources.index', 'coordinacion/'],
    ['coordination.documents.show', 'coordinacion/'],
    // Administracion
    ['admin.dashboard', 'admin/'],
    ['admin.users.index', 'admin/'],
    ['admin.jobs.index', 'admin/'],
    ['admin.audit.index', 'admin/'],
    ['admin.notifications.index', 'admin/'],
    ['admin.processes.index', 'admin/'],
]);

it('deja una sola direccion corta que lleva al area de quien entra', function (string $name): void {
    // Los enlaces apuntan aqui una sola vez; el salto decide el area segun el rol activo.
    $route = Route::getRoutes()->getByName($name);

    expect($route)->not->toBeNull();
})->with([
    'dashboard',
    'notifications.index',
    'sources.index',
    'sources.show',
    'documents.show',
]);

it('mantiene la eleccion de rol fuera de toda area', function (): void {
    // Quien esta eligiendo rol todavia no tiene uno desde el que mirar.
    expect(Route::getRoutes()->getByName('role.index')?->uri())->toBe('rol');
});
