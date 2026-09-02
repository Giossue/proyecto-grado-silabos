<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ConvocationDeadline;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use Carbon\CarbonImmutable;
use Illuminate\Validation\ValidationException;

/**
 * El calendario de una convocatoria vive en `fechas_limite_convocatoria`, una fila por
 * etapa. La etapa `inicio` vence cuando se habilita la elaboración; la etapa `borrador`,
 * cuando se cierra el envío. Modelarlo así evita duplicar el concepto de fecha en dos
 * sitios distintos.
 *
 * El reglamento de la UEB exige que la planificación microcurricular esté programada
 * antes de iniciar el periodo académico. Estas fechas son la forma de cumplirlo, y por eso
 * el vencimiento bloquea de verdad en lugar de quedar como aviso.
 */
class ConvocationSchedule
{
    public const STAGE_START = 'inicio';

    public const STAGE_DRAFT = 'borrador';

    public function startsAt(Convocation $convocation): ?CarbonImmutable
    {
        return $this->stage($convocation, self::STAGE_START)?->vence_en;
    }

    public function draftDeadline(Convocation $convocation): ?CarbonImmutable
    {
        return $this->stage($convocation, self::STAGE_DRAFT)?->vence_en;
    }

    public function stage(Convocation $convocation, string $stage): ?ConvocationDeadline
    {
        return $convocation->relationLoaded('deadlines')
            ? $convocation->deadlines->firstWhere('etapa', $stage)
            : ConvocationDeadline::query()
                ->where('convocatoria_id', $convocation->id)
                ->where('etapa', $stage)
                ->first();
    }

    /**
     * Se comprueba en el envío y no en la edición: quien se pasó del plazo puede seguir
     * trabajando, pero no entregar hasta que coordinación prorrogue.
     *
     * @throws ValidationException
     */
    public function assertOpenForSubmission(Convocation $convocation): void
    {
        $this->assertNotPaused($convocation);

        $now = CarbonImmutable::now();
        $startsAt = $this->startsAt($convocation);

        if ($startsAt !== null && $now->lessThan($startsAt)) {
            throw ValidationException::withMessages([
                'deadline' => 'La convocatoria todavía no inicia; podrá enviar a partir del '
                    .$startsAt->translatedFormat('d/m/Y H:i').'.',
            ]);
        }

        $deadline = $this->draftDeadline($convocation);

        if ($deadline !== null && $now->greaterThan($deadline)) {
            throw ValidationException::withMessages([
                'deadline' => 'El plazo de entrega venció el '
                    .$deadline->translatedFormat('d/m/Y H:i')
                    .'. Solicite una prórroga a la coordinación de su carrera.',
            ]);
        }
    }

    /**
     * Una pausa detiene el reloj para todos: nadie entrega mientras la carrera o la
     * universidad están corrigiendo la base sobre la que se trabaja.
     *
     * @throws ValidationException
     */
    public function assertNotPaused(Convocation $convocation): void
    {
        if ($convocation->estado === Convocation::STATE_PAUSED) {
            throw ValidationException::withMessages([
                'deadline' => 'La convocatoria está en pausa por decisión de la coordinación de su carrera. Podrá enviar cuando se reanude.',
            ]);
        }

        $processState = $convocation->relationLoaded('process')
            ? $convocation->process->estado
            : $convocation->process()->value('estado');

        if ($processState === SyllabusProcess::STATE_PAUSED) {
            throw ValidationException::withMessages([
                'deadline' => 'El proceso institucional está en pausa. Podrá enviar cuando Administración lo reanude.',
            ]);
        }
        if ($processState === SyllabusProcess::STATE_CLOSED) {
            throw ValidationException::withMessages([
                'deadline' => 'El proceso institucional ya se cerró y no admite más envíos.',
            ]);
        }
    }
}
