<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Illuminate\Validation\ValidationException;

/**
 * Qué se congela mientras el trabajo docente avanza.
 *
 * Con el proceso institucional abierto, la plantilla no cambia: los docentes están
 * llenando ese formato. Con una convocatoria en curso, la malla y las fuentes de esa
 * carrera no cambian: los sílabos se apoyan en ellas. Para editar, primero se pausa —
 * Administración el proceso, Coordinación su convocatoria— y el bloqueo se levanta solo
 * en ese alcance.
 *
 * Las razones se devuelven como texto para que la interfaz explique el bloqueo con las
 * mismas palabras con las que el servidor lo rechaza.
 */
class ProcessLocks
{
    public function templateLockReason(): ?string
    {
        $process = SyllabusProcess::query()
            ->where('estado', SyllabusProcess::STATE_OPEN)
            ->first(['nombre']);

        if ($process === null) {
            return null;
        }

        return "El proceso «{$process->nombre}» está abierto y los docentes trabajan con esta plantilla."
            .' Pause el proceso desde Convocatorias para modificarla.';
    }

    public function assertTemplateEditable(): void
    {
        $reason = $this->templateLockReason();

        if ($reason !== null) {
            throw ValidationException::withMessages(['process' => $reason]);
        }
    }

    /**
     * Los catálogos institucionales también quedan congelados mientras la universidad
     * trabaja con un proceso abierto. Sus cambios no deben aparecer a mitad del ciclo.
     * Al pausar el proceso, Administración vuelve a tener el espacio de corrección.
     */
    public function assertInstitutionalStructureEditable(): void
    {
        $reason = $this->institutionalStructureLockReason();

        if ($reason !== null) {
            throw ValidationException::withMessages(['process' => $reason]);
        }
    }

    public function institutionalStructureLockReason(): ?string
    {
        $process = SyllabusProcess::query()
            ->where('estado', SyllabusProcess::STATE_OPEN)
            ->first(['nombre']);

        return $process === null
            ? null
            : "El proceso institucional «{$process->nombre}» está abierto. Pause el proceso desde Convocatorias antes de modificar la estructura institucional.";
    }

    public function careerLockReason(?string $careerId): ?string
    {
        if ($careerId === null) {
            return null;
        }

        $convocation = Convocation::query()
            ->where('carrera_id', $careerId)
            ->running()
            ->first(['nombre']);

        if ($convocation === null) {
            return null;
        }

        return "La convocatoria «{$convocation->nombre}» está en curso y los sílabos se apoyan en esta información."
            .' Pause la convocatoria desde Convocatorias para modificarla; las demás carreras no se ven afectadas.';
    }

    public function assertCareerEditable(?string $careerId): void
    {
        $reason = $this->careerLockReason($careerId);

        if ($reason !== null) {
            throw ValidationException::withMessages(['process' => $reason]);
        }
    }
}
