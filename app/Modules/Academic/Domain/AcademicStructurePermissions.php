<?php

namespace App\Modules\Academic\Domain;

use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;

final class AcademicStructurePermissions
{
    /** @var list<string> */
    public const GOVERNANCE_ENTITIES = [
        'facultad',
        'carrera',
        'campus',
        'modalidad',
        'periodo',
        'asignacion_coordinador',
    ];

    /** @var list<string> */
    public const CAREER_ENTITIES = [
        'malla',
        'asignatura',
        'oferta',
        'paralelo',
        'asignacion_docente',
    ];

    /** @var list<string> */
    public const GOVERNANCE_STATUS_ENTITIES = [
        'facultad',
        'carrera',
        'campus',
        'modalidad',
        'periodo',
        'asignacion_coordinador',
    ];

    /** @var list<string> */
    public const GOVERNANCE_UPDATE_ENTITIES = [
        'facultad',
        'carrera',
        'campus',
        'modalidad',
        'periodo',
    ];

    /** @var list<string> */
    public const CAREER_UPDATE_ENTITIES = [
        'malla',
        'asignatura',
        'oferta',
        'paralelo',
        'asignacion_docente',
    ];

    /** @var list<string> */
    public const CAREER_STATUS_ENTITIES = [
        'malla',
        'asignatura',
        'oferta',
        'paralelo',
        'asignacion_docente',
    ];

    public static function isGovernanceContext(?RoleAssignment $activeRole): bool
    {
        return $activeRole?->role->codigo === RoleCode::Administrator->value;
    }

    public static function isCareerContext(?RoleAssignment $activeRole): bool
    {
        return $activeRole?->role->codigo === RoleCode::Coordinator->value
            && $activeRole->carrera_id !== null
            && $activeRole->career?->activo === true;
    }

    public static function mayCreate(?RoleAssignment $activeRole, string $entity): bool
    {
        return (self::isGovernanceContext($activeRole) && in_array($entity, self::GOVERNANCE_ENTITIES, true))
            || (self::isCareerContext($activeRole) && in_array($entity, self::CAREER_ENTITIES, true));
    }

    public static function mayChangeStatus(?RoleAssignment $activeRole, string $entity): bool
    {
        return (self::isGovernanceContext($activeRole) && in_array($entity, self::GOVERNANCE_STATUS_ENTITIES, true))
            || (self::isCareerContext($activeRole) && in_array($entity, self::CAREER_STATUS_ENTITIES, true));
    }

    public static function mayUpdate(?RoleAssignment $activeRole, string $entity): bool
    {
        return (self::isGovernanceContext($activeRole)
            && in_array($entity, self::GOVERNANCE_UPDATE_ENTITIES, true))
            || (self::isCareerContext($activeRole)
                && in_array($entity, self::CAREER_UPDATE_ENTITIES, true));
    }
}
