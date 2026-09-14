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
        ->toContain('v-for="section in syllabus.sections"')
        ->toContain('await flushPendingChanges()')
        ->toContain('scheduleSave(field)')
        ->toContain('v-if="canValidate"')
        ->toContain('v-else-if="canSubmit"')
        ->toContain('Validar sílabo')
        ->toContain('Enviar sílabo')
        ->toContain('validation?.version_bloqueo === lockVersion.value')
        ->not->toContain('<IdentificationCard')
        ->not->toContain('Guardar ahora')
        ->not->toContain('Volver al resumen')
        ->not->toContain('Validar borrador')
        ->not->toContain('Revisar y enviar')
        ->not->toContain('saveLabel')
        ->not->toContain('Campo guardado')
        ->not->toContain('Cambio pendiente')
        ->not->toContain('Guardando…')
        ->not->toContain('Sin cambios')
        ->not->toContain('queueNow')
        ->not->toContain('activeSection')
        ->not->toContain('selectSection')
        ->not->toContain('Secciones del sílabo')
        ->not->toContain('<CardTitle>Colaboradores</CardTitle>');

    expect($context)
        ->toBeString()
        ->toContain('Contexto académico')
        ->toContain('solo lectura')
        ->toContain('md:grid-cols-2')
        ->toContain("value('nombre_asignatura')")
        ->toContain("value('nombre_docente')");
});
