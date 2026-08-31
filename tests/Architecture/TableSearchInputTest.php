<?php

it('RNF UI oculta el control nativo de limpieza en las busquedas de tablas', function (): void {
    $root = dirname(__DIR__, 2);
    $input = (string) file_get_contents(
        $root.'/resources/js/components/ui/input/Input.vue',
    );

    expect($input)->toContain(
        '[&::-webkit-search-cancel-button]:appearance-none',
    );

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js'),
    );
    $searchInputs = 0;

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());

        if (! str_contains($source, 'type="search"')) {
            continue;
        }

        $searchInputs += substr_count($source, 'type="search"');

        expect(preg_match('/<Input[\s\S]*?type="search"/', $source))->toBe(1);
    }

    expect($searchInputs)->toBeGreaterThanOrEqual(8);
});
