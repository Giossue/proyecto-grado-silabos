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

it('elimina los resumenes metricos independientes fuera del dashboard', function (): void {
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
    expect($convocation)
        ->toBeString()
        ->not->toContain('Resumen de expedientes')
        ->not->toContain('convocation.counts.total');
    expect($report)
        ->toBeString()
        ->not->toContain('Resumen del informe')
        ->not->toContain('indicators.total')
        ->not->toContain('indicators.average_completion');
    // La página no vuelve a tener una tarjeta métrica propia; `fieldTotals` solo
    // se transfiere al constructor visual, cuyo panel de leyenda muestra el
    // resumen al estilo de la malla institucional (pedido del usuario, 2026-09-01).
    expect($curriculum)
        ->toBeString()
        ->not->toContain('Totales de la malla')
        ->toContain(':field-totals="fieldTotals"');
    expect($syllabusEdit)
        ->toBeString()
        ->not->toContain('<SyllabusCompletionStatus')
        ->not->toContain('completion.toFixed');
    expect($syllabusShow)
        ->toBeString()
        ->not->toContain('<SyllabusCompletionStatus')
        ->not->toContain('syllabus.completion');
});
