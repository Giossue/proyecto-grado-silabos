<?php

namespace App\Modules\Academic\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Application\Actions\CreateAcademicRecord;
use App\Modules\Academic\Application\Actions\CreateParallels;
use App\Modules\Academic\Application\Actions\DeleteAcademicRecord;
use App\Modules\Academic\Application\Actions\DeleteCourseOffering;
use App\Modules\Academic\Application\Actions\DeleteCurriculum;
use App\Modules\Academic\Application\Actions\MutateCurriculumBuilder;
use App\Modules\Academic\Application\Actions\PreparePeriod;
use App\Modules\Academic\Application\Actions\SetAcademicRecordStatus;
use App\Modules\Academic\Application\Actions\UpdateCareerAcademicRecord;
use App\Modules\Academic\Application\Queries\AcademicStructureViewData;
use App\Modules\Academic\Presentation\Http\Requests\ManageCareerAcademicStructureRequest;
use App\Modules\Academic\Presentation\Http\Requests\PreparePeriodRequest;
use App\Modules\Academic\Presentation\Http\Requests\SetAcademicRecordStatusRequest;
use App\Modules\Academic\Presentation\Http\Requests\StoreAcademicRecordRequest;
use App\Modules\Academic\Presentation\Http\Requests\StoreCurriculumFieldRequest;
use App\Modules\Academic\Presentation\Http\Requests\StoreParallelsRequest;
use App\Modules\Academic\Presentation\Http\Requests\StoreSubjectRequirementRequest;
use App\Modules\Academic\Presentation\Http\Requests\UpdateCareerAcademicRecordRequest;
use App\Modules\Academic\Presentation\Http\Requests\UpdateCurriculumConfigurationRequest;
use App\Modules\Academic\Presentation\Http\Requests\UpdateSubjectLayoutRequest;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Syllabus\Application\Actions\RelieveTeacher;
use App\Modules\Syllabus\Presentation\Http\Requests\RelieveTeacherRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class CareerAcademicStructureController extends Controller
{
    public function curricula(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response|RedirectResponse {
        $careerId = $this->careerId($request, $roles);
        $curriculumId = $viewData->currentCurriculumId($careerId);
        if ($curriculumId !== null) {
            return to_route('coordination.academic.curricula.show', $curriculumId);
        }

        return Inertia::render(
            'Coordination/Academic/Curricula',
            $viewData->curricula($careerId),
        );
    }

    public function curriculumBuilder(
        string $curriculum,
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response {
        return Inertia::render(
            'Coordination/Academic/CurriculumBuilder',
            $viewData->curriculumBuilder($this->careerId($request, $roles), $curriculum),
        );
    }

    public function offerings(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response {
        return Inertia::render(
            'Coordination/Academic/Offerings',
            $viewData->offerings($this->careerId($request, $roles)),
        );
    }

    public function teacherAssignments(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response {
        return Inertia::render(
            'Coordination/Academic/TeacherAssignments',
            $viewData->teacherAssignments($this->careerId($request, $roles)),
        );
    }

    public function store(
        string $entity,
        StoreAcademicRecordRequest $request,
        CreateAcademicRecord $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($entity, $request->validated(), $actor, $request);

        return back()->with('success', 'Registro académico creado dentro de su carrera.');
    }

    /** Crea varios paralelos de una misma oferta en una operación atómica (I-40). */
    public function storeParallels(
        StoreParallelsRequest $request,
        CreateParallels $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        /** @var array{offering_id: string, codes: list<string>, shift?: string|null} $data */
        $data = $request->validated();
        $created = $action->execute($data, $actor, $request);

        return back()->with('success', "{$created} paralelos creados dentro de su carrera.");
    }

    /** Relevo de un docente en todos sus paralelos y sílabos de la carrera (I-39). */
    public function relieveTeacher(RelieveTeacherRequest $request, RelieveTeacher $action): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $summary = $action->execute(
            $request->string('outgoing_user_id')->toString(),
            $request->string('incoming_user_id')->toString(),
            $request->backing(),
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', "Relevo aplicado en {$summary['parallels']} paralelos; {$summary['syllabi']} sílabos pasaron al docente entrante.");
    }

    /** Prepara de forma atómica las materias y paralelos seleccionados para un período. */
    public function preparePeriod(
        PreparePeriodRequest $request,
        PreparePeriod $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        /** @var array{period_id: string, subjects: list<array{id: string, codes: list<string>, shift?: string|null}>} $data */
        $data = $request->validated();
        $result = $action->execute($data, $actor, $request);

        $message = sprintf(
            'Período preparado: %d %s y %d %s nuevos para %d %s.',
            $result['offerings'],
            $result['offerings'] === 1 ? 'oferta' : 'ofertas',
            $result['parallels'],
            $result['parallels'] === 1 ? 'paralelo' : 'paralelos',
            $result['subjects'],
            $result['subjects'] === 1 ? 'materia' : 'materias',
        );

        return back()->with('success', $message);
    }

    public function setStatus(
        string $entity,
        string $record,
        SetAcademicRecordStatusRequest $request,
        SetAcademicRecordStatus $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $active = $request->boolean('active');
        $action->execute($entity, $record, $active, $actor, $request);

        if ($entity === 'malla') {
            return back()->with('success', $active
                ? 'Malla reactivada. Los procesos nuevos vuelven a estar disponibles.'
                : 'Malla deshabilitada. No se crearán procesos nuevos y el historial se conserva.');
        }

        return back()->with('success', $active
            ? 'Registro activado.'
            : 'Registro desactivado sin borrar su historial.');
    }

    public function update(
        string $entity,
        string $record,
        UpdateCareerAcademicRecordRequest $request,
        UpdateCareerAcademicRecord $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($entity, $record, $request->validated(), $actor, $request);

        return back()->with('success', 'Registro académico actualizado.');
    }

    public function destroyCurriculum(
        string $curriculum,
        ManageCareerAcademicStructureRequest $request,
        DeleteCurriculum $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($curriculum, $actor, $request);

        return to_route('coordination.academic.curricula.index')
            ->with('success', 'Malla eliminada. La carrera queda sin estructura académica activa.');
    }

    public function destroyOffering(
        string $offering,
        ManageCareerAcademicStructureRequest $request,
        DeleteCourseOffering $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($offering, $actor, $request);

        return back()->with('success', 'Oferta eliminada junto con sus paralelos y asignaciones sin historial.');
    }

    public function destroy(
        string $entity,
        string $record,
        ManageCareerAcademicStructureRequest $request,
        DeleteAcademicRecord $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($entity, $record, $actor, $request);

        return back()->with('success', 'Registro académico eliminado.');
    }

    public function updateCurriculumConfiguration(
        string $curriculum,
        UpdateCurriculumConfigurationRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        /** @var array{code: string, cycle_count: int|string} $data */
        $data = $request->validated();
        $action->updateConfiguration(
            $curriculum,
            $data,
            $this->actor($request),
            $request,
        );

        return back()->with('success', 'Configuración de la malla actualizada.');
    }

    public function storeCurriculumField(
        string $curriculum,
        StoreCurriculumFieldRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        $action->createField($curriculum, $request->validated(), $this->actor($request), $request);

        return back()->with('success', 'Campo agregado a la malla.');
    }

    public function destroyCurriculumField(
        string $curriculum,
        string $field,
        ManageCareerAcademicStructureRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        $action->deleteField($curriculum, $field, $this->actor($request), $request);

        return back()->with('success', 'Campo retirado de la malla.');
    }

    public function storeSubjectRequirement(
        string $curriculum,
        StoreSubjectRequirementRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        $action->createRequirement($curriculum, $request->validated(), $this->actor($request), $request);

        return back()->with('success', 'Relación académica agregada.');
    }

    public function destroySubjectRequirement(
        string $curriculum,
        string $requirement,
        ManageCareerAcademicStructureRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        $action->deleteRequirement($curriculum, $requirement, $this->actor($request), $request);

        return back()->with('success', 'Relación académica eliminada.');
    }

    public function destroySubject(
        string $curriculum,
        string $subject,
        ManageCareerAcademicStructureRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        $action->deleteSubject($curriculum, $subject, $this->actor($request), $request);

        return back()->with('success', 'Materia eliminada de la malla.');
    }

    public function updateSubjectLayout(
        string $curriculum,
        UpdateSubjectLayoutRequest $request,
        MutateCurriculumBuilder $action,
    ): RedirectResponse {
        $action->updateSubjectLayout($curriculum, $request->validated(), $this->actor($request), $request);

        return back()->with('success', 'Posición de la materia actualizada.');
    }

    private function careerId(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
    ): string {
        $careerId = $roles->resolve($request)?->carrera_id;
        abort_unless(is_string($careerId), 403);

        return $careerId;
    }

    private function actor(ManageCareerAcademicStructureRequest|StoreCurriculumFieldRequest|StoreSubjectRequirementRequest|UpdateCurriculumConfigurationRequest|UpdateSubjectLayoutRequest $request): User
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);

        return $actor;
    }
}
