<?php

it('reserva las cards metricas para el dashboard', function (): void {
    $root = dirname(__DIR__, 2);
    $vueRoot = $root.'/resources/js';
    $statTileConsumers = [];
    $metricCardViolations = [];
    $definitionCardViolations = [];

    $files = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($vueRoot),
    );

    foreach ($files as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $path = $file->getPathname();
        $relativePath = str_replace($root.'/', '', $path);
        $source = file_get_contents($path);

        expect($source)->toBeString();

        if (str_contains($source, '<StatTile')) {
            $statTileConsumers[] = $relativePath;
        }

        if (
            $relativePath === 'resources/js/pages/Dashboard.vue'
            || $relativePath === 'resources/js/components/domain/StatTile.vue'
        ) {
            continue;
        }

        preg_match_all(
            '/<Card(?:\s[^>]*)?>(?:(?!<\/Card>).)*<\/Card>/s',
            $source,
            $cards,
        );

        foreach ($cards[0] as $card) {
            if (
                preg_match('/text-(?:2xl|3xl|4xl)/', $card) === 1
                || preg_match(
                    '/<CardTitle[^>]*>\s*Completitud\s*<\/CardTitle>/',
                    $card,
                ) === 1
            ) {
                $metricCardViolations[] = $relativePath;
                break;
            }
        }

        if (
            preg_match(
                '/<div[^>]*class="[^"]*bg-card[^"]*"[^>]*>\s*<dt\b.*?<dd\b/s',
                $source,
            ) === 1
        ) {
            $definitionCardViolations[] = $relativePath;
        }
    }

    sort($statTileConsumers);

    expect($statTileConsumers)->toBe([
        'resources/js/pages/Dashboard.vue',
    ]);
    expect(array_values(array_unique($metricCardViolations)))->toBeEmpty();
    expect(array_values(array_unique($definitionCardViolations)))->toBeEmpty();
});

it('conserva los indicadores operativos fuera del dashboard en formatos compactos', function (): void {
    $root = dirname(__DIR__, 2);
    $convocation = file_get_contents(
        $root.'/resources/js/pages/Coordination/Convocations/Show.vue',
    );
    $report = file_get_contents(
        $root.'/resources/js/pages/Coordination/Reports/Index.vue',
    );
    $curriculum = file_get_contents(
        $root.'/resources/js/pages/Coordination/Academic/CurriculumBuilder.vue',
    );
    $syllabusEdit = file_get_contents(
        $root.'/resources/js/pages/Teacher/Syllabi/Edit.vue',
    );
    $syllabusShow = file_get_contents(
        $root.'/resources/js/pages/Teacher/Syllabi/Show.vue',
    );
    $completion = file_get_contents(
        $root.'/resources/js/components/domain/syllabus/SyllabusCompletionStatus.vue',
    );

    expect($convocation)
        ->toBeString()
        ->toContain('Resumen de expedientes')
        ->toContain('aria-label="Resumen de expedientes de la convocatoria"');
    expect($report)
        ->toBeString()
        ->toContain('Resumen del informe')
        ->toContain('aria-label="Resumen de indicadores del informe"');
    expect($curriculum)
        ->toBeString()
        ->toContain('aria-label="Totales de la malla"')
        ->not->toContain('class="rounded-lg border bg-card px-4 py-3 shadow-surface"');
    expect($syllabusEdit)
        ->toBeString()
        ->toContain('<SyllabusCompletionStatus');
    expect($syllabusShow)
        ->toBeString()
        ->toContain('<SyllabusCompletionStatus');
    expect($completion)
        ->toBeString()
        ->toContain('role="progressbar"')
        ->not->toContain('<Card');
});
