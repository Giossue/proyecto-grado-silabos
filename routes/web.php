<?php

use App\Http\Controllers\DashboardController;
use App\Http\Controllers\Health\ReadinessController;
use App\Http\Middleware\HandleInertiaRequests;
use App\Modules\Academic\Presentation\Http\Controllers\AcademicGovernanceController;
use App\Modules\Academic\Presentation\Http\Controllers\CareerAcademicStructureController;
use App\Modules\AiAssistance\Presentation\Http\Controllers\AiAssistanceController;
use App\Modules\Configuration\Presentation\Http\Controllers\AcademicSourceController;
use App\Modules\Configuration\Presentation\Http\Controllers\TemplateController;
use App\Modules\Documents\Presentation\Http\Controllers\DocumentController;
use App\Modules\Identity\Presentation\Http\Controllers\ActiveRoleController;
use App\Modules\Identity\Presentation\Http\Controllers\ManagedUserController;
use App\Modules\Operations\Presentation\Http\Controllers\AuditEventController;
use App\Modules\Operations\Presentation\Http\Controllers\JobExecutionController;
use App\Modules\Operations\Presentation\Http\Controllers\NotificationController;
use App\Modules\Operations\Presentation\Http\Controllers\OperationalReportController;
use App\Modules\Syllabus\Presentation\Http\Controllers\ConvocationController;
use App\Modules\Syllabus\Presentation\Http\Controllers\ReviewController;
use App\Modules\Syllabus\Presentation\Http\Controllers\SyllabusController;
use App\Support\RoleArea;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;
use Illuminate\Session\Middleware\StartSession;
use Illuminate\Support\Facades\Route;
use Illuminate\View\Middleware\ShareErrorsFromSession;

Route::inertia('/', 'Welcome')->name('home');
Route::get('/health/ready', ReadinessController::class)
    ->withoutMiddleware([
        StartSession::class,
        ShareErrorsFromSession::class,
        PreventRequestForgery::class,
        HandleInertiaRequests::class,
    ])
    ->name('health.ready');

Route::middleware(['auth', 'verified'])->group(function () {
    /*
     * Fuera de toda área: aquí se elige el rol, así que todavía no hay uno desde el que
     * mirar. Es la única pantalla de trabajo sin `admin/`, `coordinacion/` ni `docente/`.
     */
    Route::get('rol', [ActiveRoleController::class, 'index'])->name('role.index');
    Route::post('rol', [ActiveRoleController::class, 'store'])->name('role.store');

    /*
     * Direcciones canónicas de las pantallas que sirven a más de un rol. Son las que usan
     * los enlaces, y llevan a la copia del área correspondiente. Escribir el enlace una
     * sola vez evita que cada botón tenga que preguntarse con qué rol se está entrando.
     */
    Route::get('dashboard', [DashboardController::class, 'index'])
        ->middleware('active-role')
        ->name('dashboard');
    Route::get('notificaciones', fn () => RoleArea::redirect('notifications.index'))
        ->name('notifications.index');
    Route::get('fuentes', fn () => RoleArea::redirect('sources.index'))->name('sources.index');
    Route::get('fuentes/{source}', fn (string $source) => RoleArea::redirect('sources.show', ['source' => $source]))
        ->name('sources.show');
    Route::get('revisiones/{revision}/documentos', fn (string $revision) => RoleArea::redirect('documents.show', ['revision' => $revision]))
        ->name('documents.show');

    /*
     * Sin pantalla propia: destinos de formulario y descargas. No aparecen en la barra de
     * direcciones, así que no dicen desde qué rol se entró.
     */
    Route::middleware('active-role')->group(function () {
        Route::post('notificaciones/leer-todas', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');
        Route::post('notificaciones/{notification}/leer', [NotificationController::class, 'markRead'])->name('notifications.read');
        // Nombre y correo son identidad administrativa. Coordinación gestiona la
        // asignación académica, pero esta ruta solo la autoriza Administración.
        Route::patch('usuarios/{user}/datos', [ManagedUserController::class, 'updateProfile'])
            ->name('users.profile.update');
        Route::get('exportaciones/{artifact}/{format}', [DocumentController::class, 'download'])
            ->whereIn('format', ['docx', 'pdf'])
            ->name('exports.download');
        Route::post('revisiones/{revision}/documentos', [DocumentController::class, 'store'])->name('documents.store');
        Route::post('fuentes', [AcademicSourceController::class, 'store'])->name('sources.store');
        Route::post('fuentes/versiones/{version}/fragmentos', [AcademicSourceController::class, 'addFragment'])->name('sources.fragments.store');
        Route::post('fuentes/versiones/{version}/activar', [AcademicSourceController::class, 'activate'])->name('sources.versions.activate');
        Route::post('fuentes/versiones/{version}/clonar', [AcademicSourceController::class, 'clone'])->name('sources.versions.clone');
        Route::post('fuentes/conflictos/{conflict}/resolver', [AcademicSourceController::class, 'resolveConflict'])->name('sources.conflicts.resolve');
    });

    // --- Docencia ----------------------------------------------------------------
    Route::prefix('docente')->middleware('active-role')->group(function () {
        // Copias de las pantallas compartidas: mismo controlador, nombre propio del área.
        Route::name('teacher.')->group(function () {
            Route::get('panel', [DashboardController::class, 'index'])->name('dashboard');
            Route::get('notificaciones', [NotificationController::class, 'index'])->name('notifications.index');
            Route::get('revisiones/{revision}/documentos', [DocumentController::class, 'show'])->name('documents.show');
        });
        Route::get('mis-silabos', [SyllabusController::class, 'index'])->name('syllabi.index');
        Route::get('mis-silabos/{syllabus}', [SyllabusController::class, 'show'])->name('syllabi.show');
        Route::post('mis-silabos/{syllabus}/iniciar', [SyllabusController::class, 'start'])->name('syllabi.start');
        Route::get('mis-silabos/{syllabus}/editar', [SyllabusController::class, 'edit'])->name('syllabi.edit');
        Route::patch('mis-silabos/{syllabus}/campos/{field}', [SyllabusController::class, 'updateField'])->name('syllabi.fields.update');
        Route::get('mis-silabos/{syllabus}/campos/{field}/asistencia-ia', [AiAssistanceController::class, 'show'])->name('syllabi.ai.show');
        Route::post('mis-silabos/{syllabus}/campos/{field}/asistencia-ia', [AiAssistanceController::class, 'store'])
            ->middleware('throttle:ai-analysis')
            ->name('syllabi.ai.store');
        Route::post('mis-silabos/{syllabus}/campos/{field}/asistencia-ia/{recommendation}/decision', [AiAssistanceController::class, 'feedback'])->name('syllabi.ai.feedback');
        Route::post('mis-silabos/{syllabus}/campos/{field}/asistencia-ia/{recommendation}/aplicar', [AiAssistanceController::class, 'apply'])->name('syllabi.ai.apply');
        Route::post('mis-silabos/{syllabus}/validar', [SyllabusController::class, 'validateDraft'])->name('syllabi.validate');
        Route::get('mis-silabos/{syllabus}/enviar', [SyllabusController::class, 'submitConfirmation'])->name('syllabi.submit.confirm');
        Route::post('mis-silabos/{syllabus}/enviar', [SyllabusController::class, 'submit'])->name('syllabi.submit.store');
        Route::post('mis-silabos/{syllabus}/observaciones/{observation}/responder', [SyllabusController::class, 'respondObservation'])
            ->name('syllabi.observations.respond');
    });

    // --- Coordinación ------------------------------------------------------------
    Route::prefix('coordinacion')->middleware('active-role')->group(function () {
        Route::name('coordination.')->group(function () {
            Route::get('panel', [DashboardController::class, 'index'])->name('dashboard');
            Route::get('notificaciones', [NotificationController::class, 'index'])->name('notifications.index');
            Route::get('fuentes', [AcademicSourceController::class, 'index'])->name('sources.index');
            Route::get('fuentes/{source}', [AcademicSourceController::class, 'show'])->name('sources.show');
            Route::get('revisiones/{revision}/documentos', [DocumentController::class, 'show'])->name('documents.show');
        });
        Route::get('informes', [OperationalReportController::class, 'index'])->name('reports.index');
        Route::get('convocatorias', [ConvocationController::class, 'index'])->name('convocations.index');
        Route::post('convocatorias', [ConvocationController::class, 'store'])->name('convocations.store');
        Route::get('convocatorias/{convocation}', [ConvocationController::class, 'show'])->name('convocations.show');
        Route::post('convocatorias/{convocation}/abrir', [ConvocationController::class, 'open'])->name('convocations.open');
        Route::post('convocatorias/{convocation}/prorroga', [ConvocationController::class, 'extendDeadline'])->name('convocations.deadline.extend');
        Route::get('revisiones', [ReviewController::class, 'index'])->name('reviews.index');
        Route::get('revisiones/{before}/comparar/{after}', [ReviewController::class, 'compare'])->name('reviews.compare');
        Route::get('revisiones/{revision}', [ReviewController::class, 'show'])->name('reviews.show');
        Route::post('revisiones/{revision}/observaciones', [ReviewController::class, 'storeObservation'])->name('reviews.observations.store');
        Route::post('revisiones/{revision}/solicitar-correccion', [ReviewController::class, 'requestCorrection'])->name('reviews.correction.store');
        Route::post('observaciones/{observation}/verificar', [ReviewController::class, 'verifyObservation'])->name('reviews.observations.verify');
        Route::post('revisiones/{revision}/aprobar', [ReviewController::class, 'approve'])->name('reviews.approve');
        Route::post('silabos/{syllabus}/reabrir', [ReviewController::class, 'reopen'])->name('reviews.reopen');
        Route::post('silabos/{syllabus}/relevo-docente', [ReviewController::class, 'transferTeacher'])->name('reviews.teacher.transfer');
        Route::redirect('mallas-materias', '/coordinacion/mallas');
        Route::get('mallas', [CareerAcademicStructureController::class, 'curricula'])
            ->name('coordination.academic.curricula.index');
        Route::get('mallas/{curriculum}', [CareerAcademicStructureController::class, 'curriculumBuilder'])
            ->whereUuid('curriculum')
            ->name('coordination.academic.curricula.show');
        Route::redirect('materias', '/coordinacion/mallas')
            ->name('coordination.academic.subjects.index');
        Route::redirect('oferta-paralelos', '/coordinacion/ofertas');
        Route::get('ofertas', [CareerAcademicStructureController::class, 'offerings'])
            ->name('coordination.academic.offerings.index');
        Route::get('paralelos', [CareerAcademicStructureController::class, 'parallels'])
            ->name('coordination.academic.parallels.index');
        Route::get('asignaciones-docentes', [CareerAcademicStructureController::class, 'teacherAssignments'])
            ->name('coordination.academic.teacher-assignments.index');
        Route::post('estructura-academica/{entity}', [CareerAcademicStructureController::class, 'store'])
            ->name('coordination.academic.store');
        Route::patch('estructura-academica/{entity}/{record}', [CareerAcademicStructureController::class, 'update'])
            ->whereUuid('record')
            ->name('coordination.academic.update');
        Route::patch('estructura-academica/{entity}/{record}/estado', [CareerAcademicStructureController::class, 'setStatus'])
            ->whereUuid('record')
            ->name('coordination.academic.status.update');
        Route::delete('mallas/{curriculum}', [CareerAcademicStructureController::class, 'destroyCurriculum'])
            ->whereUuid('curriculum')
            ->name('coordination.academic.curricula.destroy');
        Route::patch('mallas/{curriculum}/configuracion', [CareerAcademicStructureController::class, 'updateCurriculumConfiguration'])
            ->whereUuid('curriculum')
            ->name('coordination.academic.curricula.configuration.update');
        Route::post('mallas/{curriculum}/campos', [CareerAcademicStructureController::class, 'storeCurriculumField'])
            ->whereUuid('curriculum')
            ->name('coordination.academic.curricula.fields.store');
        Route::delete('mallas/{curriculum}/campos/{field}', [CareerAcademicStructureController::class, 'destroyCurriculumField'])
            ->whereUuid(['curriculum', 'field'])
            ->name('coordination.academic.curricula.fields.destroy');
        Route::post('mallas/{curriculum}/relaciones', [CareerAcademicStructureController::class, 'storeSubjectRequirement'])
            ->whereUuid('curriculum')
            ->name('coordination.academic.curricula.requirements.store');
        Route::delete('mallas/{curriculum}/relaciones/{requirement}', [CareerAcademicStructureController::class, 'destroySubjectRequirement'])
            ->whereUuid(['curriculum', 'requirement'])
            ->name('coordination.academic.curricula.requirements.destroy');
        Route::delete('mallas/{curriculum}/materias/{subject}', [CareerAcademicStructureController::class, 'destroySubject'])
            ->whereUuid(['curriculum', 'subject'])
            ->name('coordination.academic.curricula.subjects.destroy');
        Route::patch('mallas/{curriculum}/posicion-materia', [CareerAcademicStructureController::class, 'updateSubjectLayout'])
            ->whereUuid('curriculum')
            ->name('coordination.academic.curricula.layout.update');
    });

    // --- Administración ----------------------------------------------------------
    Route::prefix('admin')->middleware('active-role')->name('admin.')->group(function () {
        Route::get('panel', [DashboardController::class, 'index'])->name('dashboard');
        Route::get('notificaciones', [NotificationController::class, 'index'])->name('notifications.index');
        Route::get('fuentes', [AcademicSourceController::class, 'index'])->name('sources.index');
        Route::get('fuentes/{source}', [AcademicSourceController::class, 'show'])->name('sources.show');
        Route::get('procesos', [JobExecutionController::class, 'index'])->name('jobs.index');
        Route::post('procesos/{execution}/reintentar', [JobExecutionController::class, 'retry'])->name('jobs.retry');
        Route::get('auditoria', [AuditEventController::class, 'index'])->name('audit.index');
        Route::get('usuarios', [ManagedUserController::class, 'index'])->name('users.index');
        Route::post('usuarios', [ManagedUserController::class, 'store'])->name('users.store');
        Route::get('usuarios/{user}', [ManagedUserController::class, 'show'])->name('users.show');
        Route::post('usuarios/{user}/roles', [ManagedUserController::class, 'assignRole'])->name('users.roles.store');
        Route::patch('usuarios/{user}/estado', [ManagedUserController::class, 'setStatus'])->name('users.status.update');
        Route::redirect('facultades-carreras', '/admin/estructura-academica/facultades');
        Route::get('estructura-academica/{section?}', [AcademicGovernanceController::class, 'index'])
            ->whereIn('section', ['facultades', 'carreras', 'campus', 'modalidades', 'periodos-academicos'])
            ->name('academic.index');
        Route::post('gobierno-academico/{entity}', [AcademicGovernanceController::class, 'store'])->name('academic.store');
        Route::patch('gobierno-academico/{entity}/{record}', [AcademicGovernanceController::class, 'update'])
            ->whereUuid('record')
            ->name('academic.update');
        Route::patch('gobierno-academico/{entity}/{record}/estado', [AcademicGovernanceController::class, 'setStatus'])
            ->whereUuid('record')
            ->name('academic.status.update');
        Route::get('plantillas', [TemplateController::class, 'index'])->name('templates.index');
        Route::post('plantillas', [TemplateController::class, 'store'])->name('templates.store');
        Route::get('plantillas/versiones/{version}', [TemplateController::class, 'show'])->name('templates.show');
        Route::post('plantillas/versiones/{version}/secciones', [TemplateController::class, 'storeSection'])->name('templates.sections.store');
        Route::patch('plantillas/versiones/{version}/secciones/orden', [TemplateController::class, 'reorderSections'])->name('templates.sections.reorder');
        Route::patch('plantillas/versiones/{version}/secciones/{section}', [TemplateController::class, 'updateSection'])->name('templates.sections.update');
        Route::delete('plantillas/versiones/{version}/secciones/{section}', [TemplateController::class, 'destroySection'])->name('templates.sections.destroy');
        Route::post('plantillas/versiones/{version}/campos', [TemplateController::class, 'storeField'])->name('templates.fields.store');
        Route::patch('plantillas/versiones/{version}/campos/{field}', [TemplateController::class, 'updateField'])->name('templates.fields.update');
        Route::patch('plantillas/versiones/{version}/bloques/orden', [TemplateController::class, 'reorderBlocks'])->name('templates.blocks.reorder');
        Route::delete('plantillas/versiones/{version}/bloques/{block}', [TemplateController::class, 'destroyBlock'])->name('templates.blocks.destroy');
        Route::post('plantillas/versiones/{version}/publicar', [TemplateController::class, 'publish'])->name('templates.publish');
        Route::post('plantillas/versiones/{version}/clonar', [TemplateController::class, 'clone'])->name('templates.clone');
    });
});

require __DIR__.'/settings.php';
