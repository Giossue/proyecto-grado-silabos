<?php

it('elige fechas con el calendario compartido y no con el campo nativo', function (): void {
    $root = dirname(__DIR__, 2);
    $offenders = [];
    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = file_get_contents($file->getPathname());
        if (! is_string($source) || ! str_contains($source, 'type="date"')) {
            continue;
        }

        $offenders[] = str_replace($root.'/', '', $file->getPathname());
    }

    sort($offenders);

    expect($offenders)->toBe([]);

    $picker = file_get_contents($root.'/resources/js/components/DatePicker.vue');
    $this->assertIsString($picker);

    // Los formularios se envian con los nombres de sus campos: sin el campo oculto, la
    // fecha elegida no llegaria al servidor.
    $this->assertStringContainsString(
        '<input v-if="name" type="hidden" :name="name" :value="model" />',
        $picker,
        'La fecha elegida dejo de viajar en el envio del formulario.',
    );

    // Las barras de filtros consultan al cambiar un campo y escuchan el evento nativo.
    $this->assertStringContainsString(
        "new Event('change', { bubbles: true })",
        $picker,
        'Elegir una fecha dejo de disparar el filtrado automatico.',
    );
});
