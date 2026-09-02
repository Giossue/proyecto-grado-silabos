<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * Qué trabajo docente cae cuando cambia la base sobre la que se hizo.
 *
 * Decisión del responsable del producto (I-32): si la plantilla o la malla cambian con
 * una convocatoria en curso, los sílabos de esa convocatoria se borran; es
 * responsabilidad de quien edita, y el cambio real ocurre cada pocos años. El borrado
 * se confirma en el momento de guardar, con la cifra delante.
 *
 * Límite que impone la base: revisiones, transiciones y ejecuciones de IA son de solo
 * inserción. Un sílabo que ya se envió o pidió análisis no puede borrarse; si hay
 * alguno, el cambio se rechaza y se explica el porqué.
 */
class InProgressWork
{
    public const CONFIRMATION_FIELD = 'confirm_purge';

    public function count(?string $careerId = null): int
    {
        return $this->inProgress($careerId)->count();
    }

    public function undeletable(?string $careerId = null): int
    {
        return $this->inProgress($careerId)
            ->where(fn (Builder $query) => $query
                ->whereHas('revisions')
                ->orWhereHas('transitions')
                ->orWhereHas('aiExecutions'))
            ->count();
    }

    /**
     * Exige confirmación explícita cuando el cambio va a borrar trabajo y, con ella,
     * lo borra. Sin trabajo en curso no pregunta nada.
     *
     * @throws ValidationException
     */
    public function requireConfirmation(Request $request, ?string $careerId = null): int
    {
        $count = $this->count($careerId);
        if ($count === 0) {
            return 0;
        }

        $undeletable = $this->undeletable($careerId);
        if ($undeletable > 0) {
            throw ValidationException::withMessages([
                'process' => "Este cambio afecta a {$count} sílabos en curso y {$undeletable} de ellos ya fueron enviados a revisión o tienen análisis de IA, que no se borran."
                    .' Cierre el proceso y abra uno nuevo para aplicar la nueva base.',
            ]);
        }

        if (! $request->boolean(self::CONFIRMATION_FIELD)) {
            throw ValidationException::withMessages([
                'purge_required' => $count === 1
                    ? 'Este cambio borrará 1 sílabo en curso. El docente empezará de cero cuando se reanude.'
                    : "Este cambio borrará {$count} sílabos en curso. Los docentes empezarán de cero cuando se reanude.",
                'purge_count' => (string) $count,
            ]);
        }

        return $this->purge($careerId);
    }

    /** Borra los sílabos en curso que la base permite borrar. Devuelve cuántos. */
    public function purge(?string $careerId = null): int
    {
        $deleted = 0;

        $this->inProgress($careerId)
            ->whereDoesntHave('revisions')
            ->whereDoesntHave('transitions')
            ->whereDoesntHave('aiExecutions')
            ->get(['id'])
            ->each(function (Syllabus $syllabus) use (&$deleted): void {
                $syllabus->delete();
                $deleted++;
            });

        return $deleted;
    }

    /** @return Builder<Syllabus> */
    private function inProgress(?string $careerId): Builder
    {
        return Syllabus::query()->whereHas('convocation', fn (Builder $query) => $query
            ->whereIn('estado', [Convocation::STATE_OPEN, Convocation::STATE_PAUSED])
            ->when($careerId !== null, fn (Builder $scoped) => $scoped->where('carrera_id', $careerId)));
    }
}
