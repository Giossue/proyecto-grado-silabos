<?php

it('muestra un indicador accesible y tematico para los campos obligatorios', function (): void {
    $root = dirname(__DIR__, 2);
    $label = (string) file_get_contents($root.'/resources/js/components/ui/label/Label.vue');
    $fieldLabel = (string) file_get_contents($root.'/resources/js/components/ui/field/FieldLabel.vue');
    $fieldLegend = (string) file_get_contents($root.'/resources/js/components/ui/field/FieldLegend.vue');
    $datePicker = (string) file_get_contents($root.'/resources/js/components/DatePicker.vue');

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

    expect($sheet)
        ->toContain('flex-1 overflow-y-auto px-4 pb-28');
    expect($actions)
        ->toContain('<SheetFooter')
        ->toContain('fixed inset-x-0 bottom-0')
        ->toContain('bg-card')
        ->toContain('safe-area-inset-bottom');
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

it('conserva en el servidor las obligaciones minimas y condicionales', function (): void {
    $root = dirname(__DIR__, 2).'/app/Modules';
    $requests = [
        'Academic/Presentation/Http/Requests/StoreAcademicRecordRequest.php' => [
            "'user_id' => ['required'",
            "'valid_from' => ['required'",
            "'required_if:quality,encargado'",
        ],
        'Configuration/Presentation/Http/Requests/AddSourceFragmentRequest.php' => [
            "'key' => ['required'",
            "'content' => ['nullable', 'required_without:structured_value'",
            "'structured_value' => ['nullable', 'required_without:content'",
        ],
        'Configuration/Presentation/Http/Requests/SaveFieldDefinitionRequest.php' => [
            "'block_id' => [",
            "'type' => ['required'",
            "'master_source' => ['nullable', 'required_if:inherited,true'",
        ],
        'Identity/Presentation/Http/Requests/CreateManagedUserRequest.php' => [
            "'role_code' => ['required'",
            "'required_unless:role_code,'.RoleCode::Administrator->value",
        ],
        'Syllabus/Presentation/Http/Requests/StoreConvocationRequest.php' => [
            "'source_version_ids' => ['required', 'array', 'min:1'",
            "'draft_deadline' => ['required'",
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
