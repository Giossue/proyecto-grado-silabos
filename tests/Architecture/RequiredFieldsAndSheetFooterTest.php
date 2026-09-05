<?php

it('muestra un indicador accesible y tematico para los campos obligatorios', function (): void {
    $root = dirname(__DIR__, 2);
    $label = (string) file_get_contents($root.'/resources/js/components/ui/label/Label.vue');
    $fieldLabel = (string) file_get_contents($root.'/resources/js/components/ui/field/FieldLabel.vue');
    $fieldLegend = (string) file_get_contents($root.'/resources/js/components/ui/field/FieldLegend.vue');
    $datePicker = (string) file_get_contents($root.'/resources/js/components/DatePicker.vue');
    // El calendario de sílabos va por días: sin hora en ningún formulario.
    foreach ([
        'resources/js/components/domain/syllabus/SyllabusProcessSheet.vue',
        'resources/js/components/domain/syllabus/DeadlineExtensionSheet.vue',
    ] as $sheet) {
        $source = (string) file_get_contents($root.'/'.$sheet);
        expect($source)
            ->toContain('<DatePicker')
            ->not->toContain('type="time"')
            ->not->toContain('DateTimePicker');
    }

    expect($label)
        ->toContain('required?: boolean')
        ->toContain('reactiveOmit(props, "class", "required")')
        ->toContain('class="text-destructive"')
        ->toContain('aria-hidden="true">*</span>')
        ->toContain('class="sr-only">(obligatorio)</span>');
    expect($fieldLabel)
        ->toContain('required?: boolean')
        ->toContain(':required="props.required"');
    expect($fieldLegend)
        ->toContain('required?: boolean')
        ->toContain('text-destructive')
        ->toContain('(obligatorio)');
    expect($datePicker)->toContain(':aria-required="required"');
});

it('mantiene las acciones de todos los formularios sheet en un pie fijo', function (): void {
    $root = dirname(__DIR__, 2);
    $sheet = (string) file_get_contents($root.'/resources/js/components/domain/FormSheet.vue');
    $actions = (string) file_get_contents($root.'/resources/js/components/domain/FormSheetActions.vue');
    $mobileFilters = (string) file_get_contents($root.'/resources/js/components/domain/MobileFilterSheet.vue');

    // El `pt-1` evita que el contenedor con scroll recorte el `ring-1` de la
    // primera tarjeta del contenido (pedido del usuario, 2026-09-01).
    expect($sheet)
        ->toContain('flex-1 overflow-y-auto px-4 pt-1 pb-28');
    expect($actions)
        ->toContain('<SheetFooter')
        ->toContain('absolute inset-x-0 bottom-0')
        ->toContain('bg-card')
        ->toContain('safe-area-inset-bottom')
        ->not->toContain('sm:left-auto')
        ->not->toContain('sm:max-w-lg');
    expect($mobileFilters)
        ->toContain('max-sm:overflow-hidden')
        ->toContain('max-sm:flex-1 max-sm:overflow-y-auto')
        ->toContain('w-full shrink-0 sm:hidden');

    $iterator = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($root.'/resources/js/components/domain'),
    );
    $formSheets = [];

    foreach ($iterator as $file) {
        if (! $file->isFile() || $file->getExtension() !== 'vue') {
            continue;
        }

        $source = (string) file_get_contents($file->getPathname());
        if (! str_contains($source, '<FormSheetActions')) {
            continue;
        }

        $formSheets[] = $file->getFilename();
        expect($source)->toContain('<FormSheet');
    }

    expect(count($formSheets))->toBeGreaterThanOrEqual(18);
});

it('muestra ejemplos y oculta claves internas en los campos textuales', function (): void {
    $root = dirname(__DIR__, 2);
    $directories = [
        $root.'/resources/js/components/domain',
        $root.'/resources/js/pages',
    ];
    $violations = [];

    foreach ($directories as $directory) {
        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($directory),
        );

        foreach ($iterator as $file) {
            if (! $file->isFile() || $file->getExtension() !== 'vue') {
                continue;
            }

            $source = (string) file_get_contents($file->getPathname());
            preg_match_all(
                '/<Input\b(?:(?!\/>)[\s\S])*?\/>/',
                $source,
                $matches,
                PREG_OFFSET_CAPTURE,
            );

            foreach ($matches[0] as [$input, $offset]) {
                preg_match('/(?<!:)\btype="([^"]+)"/', $input, $typeMatch);
                $type = $typeMatch[1] ?? 'text';

                if (! in_array($type, ['text', 'email', 'url', 'tel'], true)
                    && ! str_contains($input, ':type=')) {
                    continue;
                }

                $line = substr_count(substr($source, 0, $offset), "\n") + 1;
                $relativePath = str_replace($root.'/', '', $file->getPathname());

                if (! preg_match('/(?::placeholder|placeholder)=/', $input)) {
                    $violations[] = "$relativePath:$line no tiene placeholder";

                    continue;
                }

                if (preg_match('/(?<!:)\bplaceholder="([^"]+)"/', $input, $placeholder)
                    && ! str_starts_with($placeholder[1], 'Ej. ')) {
                    $violations[] = "$relativePath:$line no usa un ejemplo";
                }
            }

            expect($source)->not->toContain('Dato académico estructurado:');
        }
    }

    expect($violations)->toBe([]);
});

it('presenta el ciclo académico sin detalles de implementación', function (): void {
    $root = dirname(__DIR__, 2);
    $surfaces = [
        'resources/js/pages/Admin/Templates/Show.vue',
        'resources/js/pages/Sources/Show.vue',
        'resources/js/pages/Coordination/Reviews/Show.vue',
        'resources/js/pages/Syllabi/Documents.vue',
        'resources/js/pages/Teacher/Syllabi/Show.vue',
        'resources/js/pages/Teacher/Syllabi/Edit.vue',
        'resources/js/pages/Teacher/Syllabi/Submit.vue',
        'resources/js/pages/Syllabi/Compare.vue',
        'resources/js/components/domain/configuration/TemplateFieldSheet.vue',
        'resources/js/components/domain/configuration/AcademicSourceEditSheet.vue',
    ];

    foreach ($surfaces as $surface) {
        $source = (string) file_get_contents($root.'/'.$surface);

        expect($source)
            ->not->toContain('Huella')
            ->not->toContain('SHA-256')
            ->not->toContain('Versión inmutable')
            ->not->toContain('Clave estable')
            ->not->toContain('inmutable');
    }

    $template = (string) file_get_contents(
        $root.'/resources/js/pages/Admin/Templates/Show.vue',
    );
    $source = (string) file_get_contents(
        $root.'/resources/js/pages/Sources/Show.vue',
    );
    $review = (string) file_get_contents(
        $root.'/resources/js/pages/Coordination/Reviews/Show.vue',
    );

    expect($template)
        ->not->toContain('field.help ?? field.type')
        ->not->toContain('{{ block.type }}');
    expect($source)->not->toContain('fragment.fingerprint');
    expect($review)->not->toContain('revision.fingerprint');

    foreach ([
        'app/Modules/Configuration/Presentation/Http/Controllers/TemplateController.php',
        'app/Modules/Configuration/Presentation/Http/Controllers/AcademicSourceController.php',
        'app/Modules/Syllabus/Presentation/Http/Controllers/ReviewController.php',
        'app/Modules/Documents/Presentation/Http/Controllers/DocumentController.php',
    ] as $controller) {
        $source = (string) file_get_contents($root.'/'.$controller);
        expect($source)->not->toContain("'fingerprint' =>");
    }

    $publishTemplate = (string) file_get_contents(
        $root.'/app/Modules/Configuration/Application/TemplateStructureValidator.php',
    );
    expect($publishTemplate)->not->toContain('PV-08');
});

it('conserva en el servidor las obligaciones minimas y condicionales', function (): void {
    $root = dirname(__DIR__, 2).'/app/Modules';
    $requests = [
        'Academic/Presentation/Http/Requests/StoreAcademicRecordRequest.php' => [
            "'user_id' => ['required'",
            "'required_if:quality,encargado'",
        ],
        'Configuration/Presentation/Http/Requests/CreateSourceRequest.php' => [
            "'nombre' => [",
            "'required',",
            "Rule::unique('fuentes_academicas', 'nombre')",
        ],
        'Configuration/Presentation/Http/Requests/SaveFieldDefinitionRequest.php' => [
            "'section_id' => [",
            "'content_type' => ['required'",
            "'block_id' => [",
        ],
        'Identity/Presentation/Http/Requests/CreateManagedUserRequest.php' => [
            "'role_code' => ['required'",
            "'required_unless:role_code,'.RoleCode::Administrator->value",
        ],
        'Syllabus/Presentation/Http/Requests/StoreConvocationRequest.php' => [
            "'source_ids' => ['required', 'array', 'min:1'",
            "'process_id' => [",
        ],
        'Syllabus/Presentation/Http/Requests/StoreSyllabusProcessRequest.php' => [
            "'due_at' => ['required'",
        ],
        'Syllabus/Presentation/Http/Requests/StoreCorrectionRequest.php' => [
            "'observation_ids' => ['required', 'array', 'min:1'",
            "'justification' => ['required'",
        ],
    ];

    foreach ($requests as $path => $rules) {
        $source = (string) file_get_contents($root.'/'.$path);

        foreach ($rules as $rule) {
            expect($source)->toContain($rule);
        }
    }
});
