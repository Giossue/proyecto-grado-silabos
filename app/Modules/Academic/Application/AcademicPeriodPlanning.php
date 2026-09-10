<?php

namespace App\Modules\Academic\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\AcademicPeriod;
use App\Modules\Academic\Infrastructure\Persistence\Models\Parallel;
use App\Modules\Academic\Infrastructure\Persistence\Models\ScheduledSubject;
use App\Modules\Academic\Infrastructure\Persistence\Models\TeacherAssignment;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/** Estado temporal derivado y puerta de escritura de la planificación académica. */
final class AcademicPeriodPlanning
{
    public const UPCOMING = 'proximo';

    public const CURRENT = 'en_curso';

    public const FINISHED = 'finalizado';

    /** @return self::UPCOMING|self::CURRENT|self::FINISHED */
    public function status(AcademicPeriod $period): string
    {
        $today = CarbonImmutable::today((string) config('app.display_timezone', 'America/Guayaquil'));

        if ($period->fecha_fin->lt($today)) {
            return self::FINISHED;
        }

        return $period->fecha_inicio->gt($today) ? self::UPCOMING : self::CURRENT;
    }

    public function label(AcademicPeriod $period): string
    {
        return match ($this->status($period)) {
            self::UPCOMING => 'Próximo',
            self::CURRENT => 'En curso',
            self::FINISHED => 'Finalizado',
        };
    }

    public function mayPlan(AcademicPeriod $period): bool
    {
        return $period->activo && $this->status($period) !== self::FINISHED;
    }

    public function assertMayPlan(AcademicPeriod $period, string $field = 'period_id'): void
    {
        if ($this->status($period) === self::FINISHED) {
            throw ValidationException::withMessages([
                $field => 'El período finalizó y se conserva únicamente para consulta.',
            ]);
        }

        if (! $period->activo) {
            throw ValidationException::withMessages([
                $field => 'El período está inactivo y no admite cambios de planificación.',
            ]);
        }
    }

    public function assertScheduledSubjectMayChange(ScheduledSubject $scheduledSubject, string $field = 'record'): void
    {
        $scheduledSubject->loadMissing('academicPeriod');
        $this->assertMayPlan($scheduledSubject->academicPeriod, $field);
    }

    public function assertParallelMayChange(Parallel $parallel, string $field = 'record'): void
    {
        $parallel->loadMissing('scheduledSubject.academicPeriod');
        $this->assertMayPlan($parallel->scheduledSubject->academicPeriod, $field);
    }

    public function assertTeacherAssignmentMayChange(TeacherAssignment $assignment, string $field = 'record'): void
    {
        $assignment->loadMissing('parallel.scheduledSubject.academicPeriod');
        $this->assertMayPlan($assignment->parallel->scheduledSubject->academicPeriod, $field);
    }
}
