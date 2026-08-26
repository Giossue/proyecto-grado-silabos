<?php

namespace App\Modules\Integrations\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Integrations\Application\Actions\ExcludeImportConflict;
use App\Modules\Integrations\Application\Actions\RequestInstitutionalImport;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportConflict;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportExecution;
use App\Modules\Integrations\Infrastructure\Persistence\Models\ImportItem;
use App\Modules\Integrations\Presentation\Http\Requests\ExcludeImportConflictRequest;
use App\Modules\Integrations\Presentation\Http\Requests\RequestImportSimulationRequest;
use App\Modules\Integrations\Presentation\Http\Requests\ViewInstitutionalImportsRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class InstitutionalImportController extends Controller
{
    public function index(ViewInstitutionalImportsRequest $request): Response
    {
        $search = trim($request->string('q')->toString());
        $status = $request->string('status')->toString();
        $result = $request->string('result')->toString();
        $runId = $request->string('run')->toString();
        $query = ImportExecution::query();
        if ($search !== '') {
            $escaped = addcslashes($search, '%_\\');
            $matchesBaseline = str_contains(
                mb_strtolower('Escenario académico sintético'),
                mb_strtolower($search),
            );
            $query->where(fn ($builder) => $builder
                ->where('perfil', 'ilike', "%{$escaped}%")
                ->orWhere('estado', 'ilike', "%{$escaped}%")
                ->when($matchesBaseline, fn ($match) => $match->orWhere('perfil', 'baseline')));
        }
        if ($status !== '') {
            $query->where('estado', $status);
        }

        $selected = $runId === ''
            ? ImportExecution::query()->latest('solicitado_en')->first()
            : ImportExecution::query()->findOrFail($runId);
        $items = null;
        if ($selected !== null) {
            $itemQuery = ImportItem::query()
                ->where('ejecucion_importacion_id', $selected->id)
                ->with('conflict')
                ->orderBy('numero_fila');
            if ($result !== '') {
                $itemQuery->where('resultado', $result);
            }
            $items = $itemQuery->paginate(50, ['*'], 'item_page')->withQueryString()
                ->through(fn (ImportItem $item): array => $this->itemPayload($item));
        }

        return Inertia::render('Admin/Integrations/Index', [
            'filters' => ['q' => $search, 'status' => $status, 'result' => $result],
            'environment' => [
                'enabled' => (string) config('integrations.institutional_import.driver') !== 'disabled',
                'fixture_only' => (string) config('integrations.institutional_import.driver') === 'fixture',
            ],
            'executions' => $query->latest('solicitado_en')->paginate(20)->withQueryString()
                ->through(fn (ImportExecution $execution): array => $this->executionPayload($execution)),
            'selected_execution' => $selected === null ? null : $this->executionPayload($selected),
            'items' => $items,
        ]);
    }

    public function store(
        RequestImportSimulationRequest $request,
        RequestInstitutionalImport $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $execution = $action->execute(
            $request->string('profile')->toString(),
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return to_route('admin.integrations.index', ['run' => $execution->id])
            ->with('success', 'La simulación quedó registrada. No se aplicará ningún cambio académico.');
    }

    public function exclude(
        ImportConflict $conflict,
        ExcludeImportConflictRequest $request,
        ExcludeImportConflict $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $conflict,
            $request->string('justification')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'La fila quedó excluida de una eventual aplicación futura.');
    }

    /** @return array<string, bool|int|string|null> */
    private function executionPayload(ImportExecution $execution): array
    {
        return [
            'id' => $execution->id,
            'status' => $execution->estado,
            'profile' => $execution->perfil === 'baseline' ? 'Escenario académico sintético' : 'Perfil autorizado',
            'mode' => 'Simulación sin aplicación',
            'total_items' => $execution->total_items,
            'valid_items' => $execution->items_validos,
            'rejected_items' => $execution->items_rechazados,
            'conflicts' => $execution->conflictos,
            'proposed_creates' => $execution->altas_propuestas,
            'proposed_updates' => $execution->cambios_propuestos,
            'proposed_unchanged' => $execution->sin_cambio_propuesto,
            'error_message' => $execution->mensaje_error,
            'requested_at' => $execution->solicitado_en->toIso8601String(),
            'completed_at' => $execution->completado_en?->toIso8601String(),
        ];
    }

    /** @return array<string, bool|int|string|null> */
    private function itemPayload(ImportItem $item): array
    {
        $normalized = $item->payload_normalizado;
        $name = is_array($normalized) && is_string($normalized['name'] ?? null)
            ? $normalized['name']
            : null;
        $code = is_array($normalized) && is_string($normalized['institutional_code'] ?? null)
            ? $normalized['institutional_code']
            : null;

        return [
            'row' => $item->numero_fila,
            'entity' => $item->tipo_entidad === 'subject' ? 'Asignatura' : 'Registro académico',
            'name' => $name,
            'code' => $code,
            'result' => $item->resultado,
            'proposed_action' => $item->accion_propuesta,
            'reason' => $this->reasonLabel($item->codigo_motivo),
            'conflict_id' => $item->conflict?->id,
            'conflict_status' => $item->conflict?->estado,
            'decision' => $item->conflict?->decision,
            'justification' => $item->conflict?->justificacion,
            'has_candidate' => $item->candidato_id !== null,
        ];
    }

    private function reasonLabel(string $reason): string
    {
        return match ($reason) {
            'identity_rule_unconfirmed' => 'La regla de identidad institucional aún no está confirmada.',
            'duplicate_external_reference' => 'La fuente repitió la misma referencia en este lote.',
            'ambiguous_candidate' => 'Existe más de un candidato académico posible.',
            'unsupported_entity_type' => 'El tipo de registro todavía no está admitido.',
            'invalid_external_reference' => 'La referencia de origen no cumple el contrato.',
            'unknown_payload_field' => 'La fila contiene un campo no admitido por el contrato.',
            'invalid_career_code', 'invalid_curriculum_code', 'invalid_institutional_code',
            'invalid_name', 'text_out_of_bounds', 'invalid_code_format', 'invalid_academic_values' => 'La fila contiene valores académicos inválidos.',
            default => 'La fila requiere revisión antes de cualquier uso.',
        };
    }
}
