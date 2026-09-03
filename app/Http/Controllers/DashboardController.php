<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Modules\Academic\Infrastructure\Persistence\Models\Career;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Identity\Domain\Enums\RoleCode;
use App\Modules\Operations\Application\SetupChecklist;
use App\Modules\Syllabus\Application\ConvocationSchedule;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\SyllabusProcess;
use App\Support\RoleArea;
use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Inertia\Inertia;
use Inertia\Response;

/**
 * El panel resume el trabajo con el alcance del rol activo. Ninguna métrica cruza ese
 * alcance: Coordinación cuenta dentro de su carrera y Docencia solo lo propio.
 */
class DashboardController extends Controller
{
    public function index(Request $request, ActiveRole $roles, SetupChecklist $setup, ConvocationSchedule $schedule): Response|RedirectResponse
    {
        $activeRole = $roles->resolve($request);
        $user = $request->user();

        /*
         * El panel es la misma pantalla para los tres roles, pero cada uno tiene la suya
         * en su área. La dirección corta, protegida por `active-role`, llega con el rol
         * resuelto y lleva a la copia que corresponde.
         */
        $area = $activeRole === null ? null : RoleArea::routePrefix();

        if ($area !== null && $request->route()?->getName() === 'dashboard') {
            return redirect()->route("{$area}.dashboard");
        }

        $metrics = match (true) {
            $activeRole === null || ! $user instanceof User => [],
            $activeRole->role->codigo === RoleCode::Administrator->value => $this->administratorMetrics(),
            $activeRole->role->codigo === RoleCode::Coordinator->value => $this->coordinatorMetrics($activeRole->carrera_id, $schedule),
            $activeRole->role->codigo === RoleCode::Teacher->value => $this->teacherMetrics($user, $activeRole->carrera_id, $schedule),
            default => [],
        };

        // Puesta en marcha: lo que falta para que el rol pueda trabajar, en orden.
        $checklist = match (true) {
            $activeRole === null || ! $user instanceof User => null,
            $activeRole->role->codigo === RoleCode::Administrator->value => $setup->forAdministrator(),
            $activeRole->role->codigo === RoleCode::Coordinator->value => $setup->forCoordinator($activeRole->carrera_id),
            $activeRole->role->codigo === RoleCode::Teacher->value => $setup->forTeacher($user, $activeRole->carrera_id),
            default => null,
        };

        return Inertia::render('Dashboard', ['metrics' => $metrics, 'setup' => $checklist]);
    }

    /**
     * Indicadores del proceso en curso para toda la institución: cuánto va, cuánto
     * queda y dónde hay que empujar.
     *
     * @return list<array{key: string, label: string, value: int, suffix: string|null, hint: string}>
     */
    private function administratorMetrics(): array
    {
        $process = SyllabusProcess::query()->inProgress()->first();
        $syllabi = Syllabus::query()->when(
            $process !== null,
            fn (Builder $query) => $query->whereHas('convocation', fn (Builder $convocation) => $convocation->where('proceso_id', $process->id)),
            fn (Builder $query) => $query->whereRaw('1 = 0'),
        );
        $total = (clone $syllabi)->count();
        $approved = (clone $syllabi)->where('estado', 'aprobado')->count();
        $careersWithoutConvocation = $process === null
            ? Career::query()->where('activo', true)->count()
            : Career::query()->where('activo', true)
                ->whereNotIn('id', Convocation::query()->where('proceso_id', $process->id)->select('carrera_id'))
                ->count();

        return [
            $this->progressMetric($approved, $total, $process === null ? 'Sin proceso en curso' : null),
            $this->daysLeftMetric($process?->entrega_en, $process === null ? 'Sin proceso en curso' : null),
            [
                'key' => 'careers_without_convocation',
                'label' => 'Carreras sin convocar',
                'value' => $careersWithoutConvocation,
                'suffix' => null,
                'hint' => 'Coordinaciones que aún no abren su convocatoria',
            ],
            [
                'key' => 'not_started',
                'label' => 'Sílabos sin iniciar',
                'value' => (clone $syllabi)->where('estado', 'sin_iniciar')->count(),
                'suffix' => null,
                'hint' => 'Docentes que todavía no empiezan',
            ],
        ];
    }

    /** @return list<array{key: string, label: string, value: int, suffix: string|null, hint: string}> */
    private function coordinatorMetrics(?string $careerId, ConvocationSchedule $schedule): array
    {
        $convocation = Convocation::query()
            ->where('carrera_id', $careerId)
            ->whereIn('estado', ['abierta', 'pausada'])
            ->latest('creado_en')
            ->first();
        $syllabi = Syllabus::query()->when(
            $convocation !== null,
            fn (Builder $query) => $query->where('convocatoria_id', $convocation->id),
            fn (Builder $query) => $query->whereRaw('1 = 0'),
        );
        $total = (clone $syllabi)->count();
        $approved = (clone $syllabi)->where('estado', 'aprobado')->count();
        $none = $convocation === null ? 'Sin convocatoria en curso' : null;

        return [
            $this->progressMetric($approved, $total, $none),
            $this->daysLeftMetric($convocation === null ? null : $schedule->draftDeadline($convocation), $none),
            [
                'key' => 'in_review',
                'label' => 'Por revisar',
                'value' => (clone $syllabi)->where('estado', 'en_revision')->count(),
                'suffix' => null,
                'hint' => 'Enviados por los docentes y a la espera de su revisión',
            ],
            [
                'key' => 'not_started',
                'label' => 'Sílabos sin iniciar',
                'value' => (clone $syllabi)->where('estado', 'sin_iniciar')->count(),
                'suffix' => null,
                'hint' => 'Docentes que todavía no empiezan',
            ],
        ];
    }

    /** @return list<array{key: string, label: string, value: int, suffix: string|null, hint: string}> */
    private function teacherMetrics(User $user, ?string $careerId, ConvocationSchedule $schedule): array
    {
        $own = fn (): Builder => Syllabus::query()
            ->whereHas('convocation', fn (Builder $query) => $query->where('carrera_id', $careerId))
            ->whereHas('collaborators', fn (Builder $query) => $query->where('usuario_id', $user->id));
        $pending = $own()->whereNotIn('estado', ['en_revision', 'aprobado'])->count();
        $deadline = $own()->whereNotIn('estado', ['aprobado'])
            ->with('convocation')
            ->get()
            ->map(fn (Syllabus $syllabus): ?CarbonInterface => $schedule->draftDeadline($syllabus->convocation))
            ->filter()
            ->sort()
            ->first();
        $completion = (float) ($own()->whereIn('estado', ['borrador', 'correccion_solicitada'])->avg('porcentaje_completitud') ?? 0);

        return [
            [
                'key' => 'pending',
                'label' => 'Sílabos por entregar',
                'value' => $pending,
                'suffix' => null,
                'hint' => $pending === 0 ? 'Nada pendiente por ahora' : 'Aún no enviados a revisión',
            ],
            $this->daysLeftMetric($deadline, $pending === 0 ? 'Sin entregas pendientes' : null),
            [
                'key' => 'completion',
                'label' => 'Avance de sus borradores',
                'value' => (int) round($completion),
                'suffix' => '%',
                'hint' => 'Promedio de los campos completados',
            ],
            [
                'key' => 'correction_requested',
                'label' => 'Por corregir',
                'value' => $own()->where('estado', 'correccion_solicitada')->count(),
                'suffix' => null,
                'hint' => 'Devueltos por Coordinación con observaciones',
            ],
        ];
    }

    /** @return array{key: string, label: string, value: int, suffix: string|null, hint: string} */
    private function progressMetric(int $approved, int $total, ?string $none): array
    {
        return [
            'key' => 'progress',
            'label' => 'Avance del proceso',
            'value' => $total === 0 ? 0 : (int) round($approved * 100 / $total),
            'suffix' => '%',
            'hint' => $none ?? "{$approved} de {$total} sílabos aprobados",
        ];
    }

    /** @return array{key: string, label: string, value: int, suffix: string|null, hint: string} */
    private function daysLeftMetric(mixed $deadline, ?string $none): array
    {
        $due = $deadline === null ? null : ($deadline instanceof CarbonInterface ? $deadline : Carbon::parse((string) $deadline));
        $days = $due === null ? 0 : max(0, (int) now()->startOfDay()->diffInDays($due->copy()->startOfDay(), false));
        $hint = match (true) {
            $none !== null => $none,
            $due === null => 'Sin fecha de entrega',
            $due->isPast() => 'El plazo venció el '.$due->translatedFormat('j \d\e F'),
            default => 'Entrega hasta el '.$due->translatedFormat('j \d\e F'),
        };

        return ['key' => 'days_left', 'label' => 'Días para la entrega', 'value' => $days, 'suffix' => 'días', 'hint' => $hint];
    }
}
