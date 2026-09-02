<?php

namespace App\Modules\Syllabus\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use App\Modules\Operations\Application\Actions\RecordWorkflowOutbox;
use App\Modules\Operations\Application\WorkflowNotificationRecipients;
use App\Modules\Syllabus\Application\AcademicContextSnapshot;
use App\Modules\Syllabus\Application\InheritMasterValues;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\RepeatableRow;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\ValidationRun;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Reiniciar un sílabo: el docente empieza de cero.
 *
 * Es la respuesta a «ya lo presentó y justo cambió la base»: la coordinación descarta lo
 * hecho, el expediente vuelve a «Sin iniciar» y toma de nuevo la malla, la oferta y la
 * plantilla tal como están ahora. Las revisiones enviadas, las observaciones y las
 * transiciones no se tocan —son evidencia y la base no las deja borrar—; lo que se pierde
 * es el borrador actual, y por eso pide motivo y queda en auditoría con el avance
 * descartado.
 *
 * Un sílabo aprobado no se reinicia: para eso está reabrir, que conserva la aprobación.
 */
class ResetSyllabus
{
    /** @var list<string> */
    public const RESETTABLE_STATES = ['borrador', 'en_revision', 'correccion_solicitada'];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
        private readonly RecordWorkflowOutbox $outbox,
        private readonly WorkflowNotificationRecipients $recipients,
        private readonly AcademicContextSnapshot $academicContext,
        private readonly InheritMasterValues $inherit,
    ) {}

    public function execute(Syllabus $syllabus, string $reason, User $actor, Request $request): Syllabus
    {
        $activeRole = $this->roles->resolve($request);
        if ($activeRole?->role->codigo !== RoleCode::Coordinator->value
            || $activeRole->carrera_id !== $syllabus->convocation()->value('carrera_id')) {
            abort(403);
        }

        return DB::transaction(function () use ($activeRole, $actor, $reason, $request, $syllabus): Syllabus {
            $locked = Syllabus::query()
                ->lockForUpdate()
                ->with(['convocation', 'scopes.offering', 'template.sections.blocks.fields'])
                ->findOrFail($syllabus->id);

            if (! in_array($locked->estado, self::RESETTABLE_STATES, true)) {
                throw ValidationException::withMessages([
                    'syllabus' => $locked->estado === 'aprobado'
                        ? 'Un sílabo aprobado no se reinicia: reábralo para conservar la aprobación.'
                        : 'El sílabo todavía no tiene trabajo que descartar.',
                ]);
            }
            if (! in_array($locked->convocation->estado, [Convocation::STATE_OPEN, Convocation::STATE_PAUSED], true)) {
                throw ValidationException::withMessages([
                    'syllabus' => 'La convocatoria ya no admite cambios en sus expedientes.',
                ]);
            }

            $offering = $locked->scopes->first()?->offering;
            if ($offering === null) {
                throw ValidationException::withMessages(['syllabus' => 'El sílabo no tiene una oferta asociada.']);
            }

            $discarded = [
                'previous_state' => $locked->estado,
                'discarded_completion' => (float) $locked->porcentaje_completitud,
                'discarded_values' => $locked->values()->count(),
                'discarded_rows' => $locked->rows()->count(),
            ];

            // Lo escrito se descarta; las revisiones enviadas siguen ahí como historial.
            FieldValue::query()->where('silabo_id', $locked->id)->delete();
            RepeatableRow::query()->where('silabo_id', $locked->id)->delete();
            ValidationRun::query()->where('silabo_id', $locked->id)->get()->each->delete();

            // Se vuelve a tomar la fotografía: la malla y la plantilla pudieron cambiar.
            $locked->update([
                'estado' => 'sin_iniciar',
                'version_bloqueo' => 0,
                'porcentaje_completitud' => 0,
                'iniciado_en' => null,
                'guardado_en' => null,
                'contexto_academico' => $this->academicContext->build($offering),
            ]);
            $this->inherit->execute(
                $locked,
                $locked->template->sections->flatMap(fn ($section) => $section->blocks->flatMap(fn ($block) => $block->fields)),
                $offering,
            );

            $correlationId = $request->attributes->getString('correlation_id') ?: null;
            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole->id,
                action: 'silabo.reiniciado',
                resourceType: 'silabo',
                resourceId: $locked->id,
                result: 'exito',
                metadata: [...$discarded, 'reason' => $reason],
                correlationId: $correlationId,
            );
            $this->outbox->execute(
                syllabus: $locked,
                eventType: 'silabo.reiniciado',
                deduplicationKey: 'silabo.reiniciado:'.$locked->id.':'.now()->timestamp,
                recipientIds: $this->recipients->teachersFor($locked),
                revisionNumber: null,
                correlationId: $correlationId,
            );

            return $locked->refresh();
        });
    }
}
