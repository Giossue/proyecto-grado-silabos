<?php

/**
 * Un panel controlado con `v-model:open` no puede llevar una clave que dependa de los
 * datos que edita: al guardar, Inertia refresca los props, la clave cambia, Vue recrea
 * el componente y el panel vuelve a abrirse porque su estado sigue en verdadero.
 */
it('no vincula la clave de un panel abierto a los datos que edita', function (): void {
    $raiz = dirname(__DIR__, 2).'/resources/js';
    $archivos = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($raiz));
    $sospechosos = [];

    foreach ($archivos as $archivo) {
        if (! $archivo->isFile() || $archivo->getExtension() !== 'vue') {
            continue;
        }
        $contenido = (string) file_get_contents($archivo->getPathname());
        if (! str_contains($contenido, 'v-model:open')) {
            continue;
        }

        // Una clave con varias interpolaciones mezcla identidad y contenido.
        preg_match_all('/:key="`([^`]*)`"/', $contenido, $claves);
        foreach ($claves[1] as $clave) {
            if (substr_count($clave, '${') > 1) {
                $sospechosos[] = str_replace($raiz.'/', '', $archivo->getPathname());
            }
        }
    }

    expect($sospechosos)->toBe(
        [],
        'Estos paneles se reabrirán solos al guardar: '.implode(', ', $sospechosos),
    );
});
