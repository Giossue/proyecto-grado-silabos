<?php

namespace App\Modules\Syllabus\Domain\Policies;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;

class SyllabusPolicy
{
    public function __construct(private readonly ActiveRole $roles) {}

    public function viewAny(User $user): bool
    {
        return $user->activo && $this->roles->hasRole(request(), RoleCode::Teacher);
    }

    public function reviewAny(User $user): bool
    {
        return $user->activo && $this->roles->hasRole(request(), RoleCode::Coordinator);
    }

    public function view(User $user, Syllabus $syllabus): bool
    {
        $activeRole = $this->roles->resolve(request());
        if (! $user->activo || $activeRole === null) {
            return false;
        }
        if ($activeRole->role->codigo === RoleCode::Coordinator->value) {
            return $activeRole->carrera_id === $syllabus->convocation()->value('carrera_id');
        }
        if ($activeRole->role->codigo !== RoleCode::Teacher->value
            || $activeRole->carrera_id !== $syllabus->convocation()->value('carrera_id')) {
            return false;
        }

        return $this->hasCurrentCollaboration($user, $syllabus);
    }

    public function start(User $user, Syllabus $syllabus): bool
    {
        return $this->canTeacherEdit($user, $syllabus) && $syllabus->estado === 'sin_iniciar';
    }

    public function edit(User $user, Syllabus $syllabus): bool
    {
        return $this->canTeacherEdit($user, $syllabus)
            && in_array($syllabus->estado, ['borrador', 'correccion_solicitada'], true);
    }

    public function submit(User $user, Syllabus $syllabus): bool
    {
        return $this->canTeacherEdit($user, $syllabus)
            && in_array($syllabus->estado, ['borrador', 'correccion_solicitada', 'en_revision'], true);
    }

    public function respond(User $user, Syllabus $syllabus): bool
    {
        return $this->canTeacherEdit($user, $syllabus) && $syllabus->estado === 'correccion_solicitada';
    }

    /**
     * Relevar al responsable es gobierno de la carrera, no edición de contenido: el
     * coordinador cambia quién responde por el expediente sin poder escribir en él.
     * La edición excepcional de contenido no forma parte de este permiso.
     */
    public function transferTeacher(User $user, Syllabus $syllabus): bool
    {
        return $this->review($user, $syllabus) && $syllabus->estado !== 'en_revision';
    }

    public function review(User $user, Syllabus $syllabus): bool
    {
        $activeRole = $this->roles->resolve(request());

        return $user->activo
            && $activeRole?->role->codigo === RoleCode::Coordinator->value
            && $activeRole->carrera_id === $syllabus->convocation()->value('carrera_id');
    }

    private function canTeacherEdit(User $user, Syllabus $syllabus): bool
    {
        $activeRole = $this->roles->resolve(request());

        return $user->activo
            && $activeRole?->role->codigo === RoleCode::Teacher->value
            && $activeRole->carrera_id === $syllabus->convocation()->value('carrera_id')
            // En curso: abierta por la carrera y con el proceso institucional abierto. Una
            // pausa en cualquiera de los dos niveles detiene la edición.
            && $syllabus->convocation()->running()->exists()
            && $this->hasCurrentCollaboration($user, $syllabus);
    }

    private function hasCurrentCollaboration(User $user, Syllabus $syllabus): bool
    {
        return $syllabus->collaborators()
            ->where('usuario_id', $user->id)
            ->whereHas('teacherAssignment', fn ($query) => $query
                ->where('activo', true)
                ->where('vigente_desde', '<=', now())
                ->where(fn ($validity) => $validity->whereNull('vigente_hasta')->orWhere('vigente_hasta', '>', now())))
            ->exists();
    }
}
