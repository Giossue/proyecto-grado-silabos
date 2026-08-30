<?php

namespace App\Modules\Academic\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Application\Actions\CreateAcademicRecord;
use App\Modules\Academic\Application\Actions\PublishCurriculumVersion;
use App\Modules\Academic\Application\Actions\SetAcademicRecordStatus;
use App\Modules\Academic\Application\Actions\UpdateCareerAcademicRecord;
use App\Modules\Academic\Application\Queries\AcademicStructureViewData;
use App\Modules\Academic\Presentation\Http\Requests\ManageCareerAcademicStructureRequest;
use App\Modules\Academic\Presentation\Http\Requests\SetAcademicRecordStatusRequest;
use App\Modules\Academic\Presentation\Http\Requests\StoreAcademicRecordRequest;
use App\Modules\Academic\Presentation\Http\Requests\UpdateCareerAcademicRecordRequest;
use App\Modules\Identity\Application\ActiveRole;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class CareerAcademicStructureController extends Controller
{
    public function curricula(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response {
        return Inertia::render(
            'Coordination/Academic/Curricula',
            $viewData->curricula($this->careerId($request, $roles)),
        );
    }

    public function subjects(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response {
        return Inertia::render(
            'Coordination/Academic/Subjects',
            $viewData->curricula($this->careerId($request, $roles)),
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

    public function parallels(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
        AcademicStructureViewData $viewData,
    ): Response {
        return Inertia::render(
            'Coordination/Academic/Parallels',
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

        return back()->with('success', $active
            ? 'Registro activado.'
            : 'Registro archivado sin borrar su historial.');
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

    public function publishCurriculum(
        string $curriculum,
        ManageCareerAcademicStructureRequest $request,
        PublishCurriculumVersion $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($curriculum, $actor, $request);

        return back()->with('success', 'Malla publicada. Su contenido queda inmutable.');
    }

    private function careerId(
        ManageCareerAcademicStructureRequest $request,
        ActiveRole $roles,
    ): string {
        $careerId = $roles->resolve($request)?->carrera_id;
        abort_unless(is_string($careerId), 403);

        return $careerId;
    }
}
