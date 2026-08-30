<?php

namespace App\Modules\Academic\Domain;

use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Identity\Infrastructure\Persistence\Models\RoleAssignment;

final class AcademicStructurePermissions
{
    /** @var list<string> */
    public const GOVERNANCE_ENTITIES = [
        'faculty',
        'career',
        'campus',
        'modality',
        'period',
        'coordinator_assignment',
    ];

    /** @var list<string> */
    public const CAREER_ENTITIES = [
        'curriculum',
        'subject',
        'offering',
        'parallel',
        'teacher_assignment',
    ];

    /** @var list<string> */
    public const GOVERNANCE_STATUS_ENTITIES = [
        'faculty',
        'career',
        'campus',
        'modality',
        'period',
        'coordinator_assignment',
    ];

    /** @var list<string> */
    public const GOVERNANCE_UPDATE_ENTITIES = [
        'faculty',
        'career',
        'campus',
        'modality',
        'period',
    ];

    /** @var list<string> */
    public const CAREER_UPDATE_ENTITIES = [
        'curriculum',
        'subject',
        'offering',
        'parallel',
        'teacher_assignment',
    ];

    /** @var list<string> */
    public const CAREER_STATUS_ENTITIES = [
        'subject',
        'offering',
        'parallel',
        'teacher_assignment',
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
