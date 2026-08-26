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
use App\Modules\Integrations\Presentation\Http\Controllers\InstitutionalImportController;
use App\Modules\Operations\Presentation\Http\Controllers\AuditEventController;
use App\Modules\Operations\Presentation\Http\Controllers\JobExecutionController;
use App\Modules\Operations\Presentation\Http\Controllers\NotificationController;
use App\Modules\Operations\Presentation\Http\Controllers\OperationalReportController;
use App\Modules\Syllabus\Presentation\Http\Controllers\ConvocationController;
use App\Modules\Syllabus\Presentation\Http\Controllers\ReviewController;
use App\Modules\Syllabus\Presentation\Http\Controllers\SyllabusController;
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
    Route::get('rol', [ActiveRoleController::class, 'index'])->name('role.index');
    Route::post('rol', [ActiveRoleController::class, 'store'])->name('role.store');
    Route::get('dashboard', [DashboardController::class, 'index'])->name('dashboard');

    Route::middleware('active-role')->group(function () {
        Route::get('notificaciones', [NotificationController::class, 'index'])->name('notifications.index');
        Route::post('notificaciones/leer-todas', [NotificationController::class, 'markAllRead'])->name('notifications.read-all');
        Route::post('notificaciones/{notification}/leer', [NotificationController::class, 'markRead'])->name('notifications.read');
        Route::get('informes', [OperationalReportController::class, 'index'])->name('reports.index');
        Route::get('convocatorias', [ConvocationController::class, 'index'])->name('convocations.index');
        Route::post('convocatorias', [ConvocationController::class, 'store'])->name('convocations.store');
        Route::get('convocatorias/{convocation}', [ConvocationController::class, 'show'])->name('convocations.show');
        Route::post('convocatorias/{convocation}/abrir', [ConvocationController::class, 'open'])->name('convocations.open');
        Route::post('convocatorias/{convocation}/prorroga', [ConvocationController::class, 'extendDeadline'])->name('convocations.deadline.extend');
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
        Route::get('revisiones', [ReviewController::class, 'index'])->name('reviews.index');
        Route::get('revisiones/{before}/comparar/{after}', [ReviewController::class, 'compare'])->name('reviews.compare');
        Route::get('revisiones/{revision}/documentos', [DocumentController::class, 'show'])->name('documents.show');
        Route::post('revisiones/{revision}/documentos', [DocumentController::class, 'store'])->name('documents.store');
        Route::get('revisiones/{revision}', [ReviewController::class, 'show'])->name('reviews.show');
        Route::post('revisiones/{revision}/observaciones', [ReviewController::class, 'storeObservation'])->name('reviews.observations.store');
        Route::post('revisiones/{revision}/solicitar-correccion', [ReviewController::class, 'requestCorrection'])->name('reviews.correction.store');
        Route::post('observaciones/{observation}/verificar', [ReviewController::class, 'verifyObservation'])->name('reviews.observations.verify');
        Route::post('revisiones/{revision}/aprobar', [ReviewController::class, 'approve'])->name('reviews.approve');
        Route::post('silabos/{syllabus}/reabrir', [ReviewController::class, 'reopen'])->name('reviews.reopen');
        Route::post('silabos/{syllabus}/relevo-docente', [ReviewController::class, 'transferTeacher'])->name('reviews.teacher.transfer');
        Route::get('exportaciones/{artifact}/{format}', [DocumentController::class, 'download'])
            ->whereIn('format', ['docx', 'pdf'])
            ->name('exports.download');
        Route::get('fuentes', [AcademicSourceController::class, 'index'])->name('sources.index');
        Route::post('fuentes', [AcademicSourceController::class, 'store'])->name('sources.store');
        Route::get('fuentes/{source}', [AcademicSourceController::class, 'show'])->name('sources.show');
        Route::post('fuentes/versiones/{version}/fragmentos', [AcademicSourceController::class, 'addFragment'])->name('sources.fragments.store');
        Route::post('fuentes/versiones/{version}/activar', [AcademicSourceController::class, 'activate'])->name('sources.versions.activate');
        Route::post('fuentes/versiones/{version}/clonar', [AcademicSourceController::class, 'clone'])->name('sources.versions.clone');
        Route::post('fuentes/conflictos/{conflict}/resolver', [AcademicSourceController::class, 'resolveConflict'])->name('sources.conflicts.resolve');
    });

    Route::prefix('coordinacion')->middleware('active-role')->name('coordination.')->group(function () {
        Route::get('mallas-materias', [CareerAcademicStructureController::class, 'curricula'])
            ->name('academic.curricula.index');
        Route::get('oferta-paralelos', [CareerAcademicStructureController::class, 'offerings'])
            ->name('academic.offerings.index');
        Route::get('asignaciones-docentes', [CareerAcademicStructureController::class, 'teacherAssignments'])
            ->name('academic.teacher-assignments.index');
        Route::post('estructura-academica/{entity}', [CareerAcademicStructureController::class, 'store'])
            ->name('academic.store');
        Route::patch('estructura-academica/{entity}/{record}/estado', [CareerAcademicStructureController::class, 'setStatus'])
            ->whereUuid('record')
            ->name('academic.status.update');
        Route::post('mallas/{curriculum}/publicar', [CareerAcademicStructureController::class, 'publishCurriculum'])
            ->whereUuid('curriculum')
            ->name('academic.curricula.publish');
    });

    Route::prefix('admin')->middleware('active-role')->name('admin.')->group(function () {
        Route::get('trabajos', [JobExecutionController::class, 'index'])->name('jobs.index');
        Route::post('trabajos/{execution}/reintentar', [JobExecutionController::class, 'retry'])->name('jobs.retry');
        Route::get('auditoria', [AuditEventController::class, 'index'])->name('audit.index');
        Route::get('integraciones', [InstitutionalImportController::class, 'index'])->name('integrations.index');
        Route::post('integraciones', [InstitutionalImportController::class, 'store'])
            ->middleware('throttle:institutional-import')
            ->name('integrations.store');
        Route::post('integraciones/conflictos/{conflict}/excluir', [InstitutionalImportController::class, 'exclude'])
            ->name('integrations.conflicts.exclude');
        Route::get('usuarios', [ManagedUserController::class, 'index'])->name('users.index');
        Route::post('usuarios', [ManagedUserController::class, 'store'])->name('users.store');
        Route::get('usuarios/{user}', [ManagedUserController::class, 'show'])->name('users.show');
        Route::post('usuarios/{user}/roles', [ManagedUserController::class, 'assignRole'])->name('users.roles.store');
        Route::patch('usuarios/{user}/estado', [ManagedUserController::class, 'setStatus'])->name('users.status.update');
        Route::redirect('facultades-carreras', '/admin/estructura-academica/facultades');
        Route::get('estructura-academica/{section?}', [AcademicGovernanceController::class, 'index'])
            ->whereIn('section', ['facultades', 'carreras', 'campus', 'modalidades', 'periodos-academicos'])
            ->name('academic.index');
        Route::get('coordinaciones', [AcademicGovernanceController::class, 'coordinations'])->name('coordinations.index');
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
        Route::post('plantillas/versiones/{version}/campos', [TemplateController::class, 'storeField'])->name('templates.fields.store');
        Route::patch('plantillas/versiones/{version}/campos/{field}', [TemplateController::class, 'updateField'])->name('templates.fields.update');
        Route::post('plantillas/versiones/{version}/publicar', [TemplateController::class, 'publish'])->name('templates.publish');
        Route::post('plantillas/versiones/{version}/clonar', [TemplateController::class, 'clone'])->name('templates.clone');
    });
});

require __DIR__.'/settings.php';
