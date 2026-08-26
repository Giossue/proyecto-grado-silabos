<?php

namespace App\Modules\Academic\Application\Actions;

use App\Models\User;
use App\Modules\Academic\Domain\AcademicStructurePermissions;
use App\Modules\Academic\Infrastructure\Persistence\Models\CurriculumVersion;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Auth\Access\AuthorizationException;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

class PublishCurriculumVersion
{
    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(string $curriculumId, User $actor, Request $request): CurriculumVersion
    {
        $activeRole = $this->roles->resolve($request);

        if (! $activeRole instanceof RoleAssignment
            || ! AcademicStructurePermissions::isCareerContext($activeRole)
            || $activeRole->carrera_id === null) {
            throw new AuthorizationException('Solo la coordinación vigente de la carrera puede publicar la malla.');
        }

        return DB::transaction(function () use ($actor, $activeRole, $curriculumId, $request): CurriculumVersion {
            $curriculum = CurriculumVersion::query()
                ->where('carrera_id', $activeRole->carrera_id)
                ->withCount('subjects')
                ->lockForUpdate()
                ->findOrFail($curriculumId);

            if ($curriculum->estado !== 'draft') {
                throw ValidationException::withMessages(['curriculum' => 'La malla ya no está en borrador.']);
            }

            if ($curriculum->subjects_count === 0) {
                throw ValidationException::withMessages(['curriculum' => 'Agregue al menos una materia antes de publicar.']);
            }

            $curriculum->update(['estado' => 'published', 'publicado_en' => now()]);

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'academic.curriculum.published',
                resourceType: 'curriculum',
                resourceId: $curriculum->id,
                result: 'success',
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );

            return $curriculum;
        });
    }
}
