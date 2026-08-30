<?php

it('convierte las filas en tarjetas desde la primitiva compartida y no tabla por tabla', function (): void {
    $root = dirname(__DIR__, 2);

    $row = file_get_contents($root.'/resources/js/components/ui/table/TableRow.vue');
    $this->assertIsString($row);

    // El panel vuelve a dibujar las celdas en vez de copiar su texto: si alguien lo
    // cambiara por una copia, los enlaces y el menu de acciones quedarian muertos.
    $this->assertSame(
        2,
        substr_count($row, '<slot />'),
        'El panel de detalle dejo de dibujar las mismas celdas de la fila.',
    );

    $this->assertStringContainsString(
        'SheetContent',
        $row,
        'El detalle de la fila ya no se abre en un panel.',
    );

    // Los nombres de columna se leen del encabezado. Escribirlos celda por celda
    // obligaria a repetirlos en las dieciocho tablas y a recordarlo en cada tabla nueva.
    $this->assertStringContainsString(
        "':scope > thead > tr:last-child > th'",
        $row,
        'Los rotulos de las tarjetas dejaron de leerse del encabezado de la tabla.',
    );

    $css = file_get_contents($root.'/resources/css/app.css');
    $this->assertIsString($css);

    foreach ([
        "table[data-cards='true']",
        'attr(data-label)',
        '[data-card-detail] > td',
    ] as $rule) {
        $this->assertStringContainsString(
            $rule,
            $css,
            'Falta la regla «'.$rule.'» que dibuja las tablas como tarjetas.',
        );
    }
});

it('no repite los nombres de columna dentro de las celdas de las paginas', function (): void {
    $root = dirname(__DIR__, 2);
    $offenders = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js/pages'),
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = file_get_contents($file->getPathname());
        if (! is_string($source) || ! str_contains($source, 'data-label')) {
            continue;
        }

        $offenders[] = str_replace($root.'/', '', $file->getPathname());
    }

    sort($offenders);

    expect($offenders)->toBe([]);
});

it('diferencia encabezados y registros alternos desde la tabla compartida', function (): void {
    $root = dirname(__DIR__, 2);
    $header = (string) file_get_contents($root.'/resources/js/components/ui/table/TableHeader.vue');
    $row = (string) file_get_contents($root.'/resources/js/components/ui/table/TableRow.vue');
    $css = (string) file_get_contents($root.'/resources/css/app.css');

    expect($header)->toContain('bg-muted')
        ->and($row)->toContain('odd:bg-card')
        ->and($row)->toContain('even:bg-muted/50')
        ->and($row)->toContain('hover:bg-muted/80');

    expect($css)->not->toContain('--table-header')
        ->not->toContain('--table-row-alternate')
        ->not->toContain('--table-row-hover')
        ->and($css)->toContain('> tr:nth-child(even)')
        ->and($css)->toContain('var(--color-muted) 50%');
});
