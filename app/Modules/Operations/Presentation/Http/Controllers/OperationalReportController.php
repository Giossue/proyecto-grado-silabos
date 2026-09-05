<?php

namespace App\Modules\Operations\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Presentation\Http\Requests\ViewOperationalReportsRequest;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Convocation;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Database\Eloquent\Builder;
use Inertia\Inertia;
use Inertia\Response;

class OperationalReportController extends Controller
{
    /** @var list<string> */
    private const STATES = ['sin_iniciar', 'borrador', 'en_revision', 'correccion_solicitada', 'aprobado'];

    public function index(ViewOperationalReportsRequest $request, ActiveRole $roles): Response
    {
        $careerId = $roles->resolve($request)?->carrera_id;
        abort_unless(is_string($careerId), 403);
        $convocationId = $request->string('convocation')->toString();
        $state = $request->string('state')->toString();
        $search = trim($request->string('search')->toString());
        $query = $this->scopedQuery($careerId, $convocationId, $state, $search);

        $counts = array_fill_keys(self::STATES, 0);
        foreach ((clone $query)->selectRaw('estado, COUNT(*) AS total')->groupBy('estado')->get() as $row) {
            if (array_key_exists($row->estado, $counts)) {
                $counts[$row->estado] = (int) $row->getAttribute('total');
            }
        }
        $total = array_sum($counts);
        $averageCompletion = (float) ((clone $query)->avg('porcentaje_completitud') ?? 0);
        $convocations = Convocation::query()
            ->where('carrera_id', $careerId)
            ->with(['career:id,nombre', 'process.academicPeriod:id,nombre'])
            ->latest('creado_en')
            ->get(['id', 'carrera_id', 'proceso_id', 'estado']);
        $convocationBreakdown = (clone $query)
            ->join('convocatorias_carreras', 'convocatorias_carreras.id', '=', 'silabos.convocatoria_id')
            ->join('convocatorias_universidad', 'convocatorias_universidad.id', '=', 'convocatorias_carreras.proceso_id')
            ->join('periodos_academicos', 'periodos_academicos.id', '=', 'convocatorias_universidad.periodo_academico_id')
            ->selectRaw(<<<'SQL'
                convocatorias_carreras.id,
                periodos_academicos.nombre,
                COUNT(*) AS total,
                COUNT(*) FILTER (WHERE silabos.estado = 'sin_iniciar') AS not_started,
                COUNT(*) FILTER (WHERE silabos.estado = 'borrador') AS draft,
                COUNT(*) FILTER (WHERE silabos.estado = 'en_revision') AS in_review,
                COUNT(*) FILTER (WHERE silabos.estado = 'correccion_solicitada') AS correction_requested,
                COUNT(*) FILTER (WHERE silabos.estado = 'aprobado') AS approved
                SQL)
            ->groupBy('convocatorias_carreras.id', 'periodos_academicos.nombre')
            ->orderBy('periodos_academicos.nombre')
            ->get()
            ->map(fn (Syllabus $row): array => [
                'id' => $row->getAttribute('id'),
                'name' => $row->getAttribute('nombre'),
                'total' => (int) $row->getAttribute('total'),
                'not_started' => (int) $row->getAttribute('not_started'),
                'draft' => (int) $row->getAttribute('draft'),
                'in_review' => (int) $row->getAttribute('in_review'),
                'correction_requested' => (int) $row->getAttribute('correction_requested'),
                'approved' => (int) $row->getAttribute('approved'),
            ]);
        $detail = (clone $query)
            ->with([
                'convocation.process.academicPeriod:id,nombre',
                'subject:id,nombre,codigo_institucional',
                'teachers:id,nombre',
                'revisions' => fn ($revision) => $revision->orderByDesc('numero_revision')->limit(1),
            ])
            ->withCount(['reviewObservations as unresolved_observations_count' => fn ($observation) => $observation
                ->where('estado', '!=', 'verificada')])
            ->orderByDesc('actualizado_en')
            ->paginate(20)
            ->withQueryString()
            ->through(fn (Syllabus $syllabus): array => [
                'id' => $syllabus->id,
                'subject' => $syllabus->subject->nombre,
                'code' => $syllabus->subject->codigo_institucional,
                'convocation' => $syllabus->convocation->nombre,
                'period' => $syllabus->convocation->process->academicPeriod->nombre,
                'state' => $syllabus->estado,
                'completion' => (float) $syllabus->porcentaje_completitud,
                'teachers' => $syllabus->teachers->pluck('nombre')->values(),
                'unresolved_observations' => (int) $syllabus->unresolved_observations_count,
                'actualizado_en' => $syllabus->actualizado_en?->toIso8601String(),
                'latest_revision_id' => $syllabus->revisions->first()?->id,
            ]);

        return Inertia::render('Coordination/Reports/Index', [
            'filters' => ['convocation' => $convocationId, 'state' => $state, 'search' => $search],
            'convocations' => $convocations->map(fn (Convocation $convocation): array => [
                'id' => $convocation->id,
                'name' => $convocation->nombre,
                'period' => $convocation->process->academicPeriod->nombre,
                'state' => $convocation->estado,
            ]),
            'indicators' => [
                'total' => $total,
                'teacher_action' => $counts['sin_iniciar'] + $counts['borrador'] + $counts['correccion_solicitada'],
                'coordination_action' => $counts['en_revision'],
                'approved' => $counts['aprobado'],
                'average_completion' => round($averageCompletion, 1),
                'states' => $counts,
            ],
            'convocation_breakdown' => $convocationBreakdown,
            'syllabi' => $detail,
        ]);
    }

    /** @return Builder<Syllabus> */
    private function scopedQuery(string $careerId, string $convocationId, string $state, string $search): Builder
    {
        $query = Syllabus::query()
            ->whereHas('convocation', fn ($convocation) => $convocation->where('carrera_id', $careerId));
        if ($convocationId !== '') {
            $query->where('convocatoria_id', $convocationId);
        }
        if ($state !== '') {
            $query->where('estado', $state);
        }
        if ($search !== '') {
            $escaped = addcslashes($search, '%_\\');
            $query->whereHas('subject', fn ($subject) => $subject
                ->where('nombre', 'ilike', "%{$escaped}%")
                ->orWhere('codigo_institucional', 'ilike', "%{$escaped}%"));
        }

        return $query;
    }
}
