<?php

namespace App\Modules\Academic\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Academic\Application\Actions\CreateAcademicRecord;
use App\Modules\Academic\Application\Actions\SetAcademicRecordStatus;
use App\Modules\Academic\Application\Actions\UpdateAcademicRecord;
use App\Modules\Academic\Application\Queries\AcademicStructureViewData;
use App\Modules\Academic\Presentation\Http\Requests\ManageAcademicGovernanceRequest;
use App\Modules\Academic\Presentation\Http\Requests\SetAcademicRecordStatusRequest;
use App\Modules\Academic\Presentation\Http\Requests\StoreAcademicRecordRequest;
use App\Modules\Academic\Presentation\Http\Requests\UpdateAcademicRecordRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class AcademicGovernanceController extends Controller
{
    public function index(
        ManageAcademicGovernanceRequest $request,
        AcademicStructureViewData $viewData,
    ): Response {
        $routeSection = $request->route('section');
        $section = match ($routeSection) {
            null, 'facultades' => 'faculties',
            'carreras' => 'careers',
            'campus' => 'campuses',
            'modalidades' => 'modalities',
            'periodos-academicos' => 'academic-periods',
            default => abort(404),
        };

        return Inertia::render('Admin/Academic/Index', [
            ...$viewData->governance(),
            'section' => $section,
        ]);
    }

    public function store(
        string $entity,
        StoreAcademicRecordRequest $request,
        CreateAcademicRecord $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($entity, $request->validated(), $actor, $request);

        return back()->with('success', 'Registro institucional creado.');
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
            ? 'Registro reactivado.'
            : 'Registro archivado sin borrar su historial.');
    }

    public function update(
        string $entity,
        string $record,
        UpdateAcademicRecordRequest $request,
        UpdateAcademicRecord $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($entity, $record, $request->validated(), $actor, $request);

        return back()->with('success', 'Datos institucionales actualizados y auditados.');
    }
}
