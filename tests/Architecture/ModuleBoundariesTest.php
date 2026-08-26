<?php

arch('RNF-029 el dominio no depende de presentación ni infraestructura')
    ->expect('App\Modules\*\Domain')
    ->not->toUse([
        'Illuminate\Http',
        'Illuminate\Support\Facades\Redis',
        'Inertia',
    ]);

arch('RNF-029 los controladores no son invocables desde el dominio')
    ->expect('App\Http\Controllers')
    ->not->toBeUsedIn('App\Modules\*\Domain');
