<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// Los tokens de recuperación son efímeros. La limpieza mantiene la tabla acotada
// sin afectar un enlace que todavía esté dentro de su vigencia.
Schedule::command('auth:clear-resets')->everyFifteenMinutes()->withoutOverlapping();
