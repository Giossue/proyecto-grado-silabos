<?php

test('el editor docente separa el formulario del formato de impresión', function () {
    $root = dirname(__DIR__, 2);
    $editor = file_get_contents(
        $root.'/resources/js/pages/Teacher/Syllabi/Edit.vue',
    );
    $context = file_get_contents(
        $root.'/resources/js/components/domain/syllabus/SyllabusAcademicContext.vue',
    );

    expect($editor)
        ->toBeString()
        ->toContain('<SyllabusAcademicContext')
        ->toContain("block.content_type === 'table'")
        ->toContain('v-for="field in formFields(block)"')
        ->toContain('v-if="activeSection"')
        ->toContain('Sección anterior')
        ->toContain('Siguiente sección')
        ->toContain('@update:model-value="selectSectionById"')
        ->toContain('await flushPendingChanges()')
        ->toContain('scheduleSave(field)')
        ->not->toContain('<IdentificationCard')
        ->not->toContain('Guardar ahora')
        ->not->toContain('queueNow')
        ->not->toContain('<CardTitle>Colaboradores</CardTitle>');

    expect($context)
        ->toBeString()
        ->toContain('Contexto académico')
        ->toContain('solo lectura')
        ->toContain('md:grid-cols-2')
        ->toContain("value('nombre_asignatura')")
        ->toContain("value('nombre_docente')");
});
