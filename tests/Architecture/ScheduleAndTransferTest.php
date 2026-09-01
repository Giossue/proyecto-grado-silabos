<?php

/**
 * Reglas de I-15. Protegen decisiones que se toman una vez y se olvidan: dónde vive el
 * calendario, qué bloquea el plazo y qué no puede perderse en un relevo.
 */
it('modela el calendario como etapas y no como columnas de la convocatoria', function (): void {
    $root = dirname(__DIR__, 2);
    $schedule = (string) file_get_contents($root.'/app/Modules/Syllabus/Application/ConvocationSchedule.php');
    $create = (string) file_get_contents($root.'/app/Modules/Syllabus/Application/Actions/CreateConvocation.php');

    expect($schedule)
        ->toContain("STAGE_START = 'start'")
        ->toContain("STAGE_DRAFT = 'draft'");

    // Duplicar la fecha en `convocatorias` dejaría dos sitios donde buscarla.
    expect($create)
        ->toContain('ConvocationSchedule::STAGE_START')
        ->toContain('fechas_limite_convocatoria');
});

it('bloquea el envio por plazo en la accion y no en el controlador', function (): void {
    $root = dirname(__DIR__, 2);
    $submit = (string) file_get_contents($root.'/app/Modules/Syllabus/Application/Actions/SubmitSyllabus.php');
    $controller = (string) file_get_contents(
        $root.'/app/Modules/Syllabus/Presentation/Http/Controllers/SyllabusController.php',
    );

    expect($submit)->toContain('assertOpenForSubmission');
    // Si la comprobación viviera en el controlador, cualquier otra entrada la esquivaría.
    expect($controller)->not->toContain('assertOpenForSubmission');
});

it('conserva la fecha anterior y el motivo al prorrogar', function (): void {
    $extend = (string) file_get_contents(
        dirname(__DIR__, 2).'/app/Modules/Syllabus/Application/Actions/ExtendConvocationDeadline.php',
    );

    expect($extend)
        ->toContain("'previous_due_at'")
        ->toContain("'reason'")
        ->toContain('convocation.deadline_extended')
        // Adelantar la fecha dejaría fuera de plazo a quien ya estaba dentro.
        ->toContain('lessThanOrEqualTo');
});

it('deja rastro del avance descartado en un relevo', function (): void {
    $transfer = (string) file_get_contents(
        dirname(__DIR__, 2).'/app/Modules/Syllabus/Application/Actions/TransferSyllabusTeacher.php',
    );

    expect($transfer)
        ->toContain("'discarded_completion'")
        ->toContain('syllabus.teacher_transferred')
        // Un expediente en revisión no se traspasa: el revisor quedaría sin interlocutor.
        ->toContain("=== 'en_revision'")
        // Cerrar una vigencia y abrir otra por separado deja el sílabo sin responsable.
        ->toContain('DB::transaction');
});

it('marca la aprobacion hecha por quien redacto', function (): void {
    $approve = (string) file_get_contents(
        dirname(__DIR__, 2).'/app/Modules/Syllabus/Application/Actions/ApproveSyllabus.php',
    );

    // DT-10 la permite. No se impide, pero tiene que ser consultable.
    expect($approve)->toContain("'self_approved'");
});
