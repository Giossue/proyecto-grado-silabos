<?php

namespace App\Modules\AiAssistance\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\AiAssistance\Application\Actions\ApplyAiRecommendation;
use App\Modules\AiAssistance\Application\Actions\RecordAiFeedback;
use App\Modules\AiAssistance\Application\Actions\RequestAiAnalysis;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiEvidence;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiExecution;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiRecommendation;
use App\Modules\AiAssistance\Presentation\Http\Requests\ApplyAiRecommendationRequest;
use App\Modules\AiAssistance\Presentation\Http\Requests\RecordAiFeedbackRequest;
use App\Modules\AiAssistance\Presentation\Http\Requests\RequestAiAnalysisRequest;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Inertia\Inertia;
use Inertia\Response;

class AiAssistanceController extends Controller
{
    public function show(Syllabus $syllabus, FieldDefinition $field, Request $request): Response
    {
        abort_unless($request->user()?->can('edit', $syllabus) === true, 403);
        $this->assertField($syllabus, $field);
        $actor = $request->user();
        $fieldValue = FieldValue::query()
            ->where('silabo_id', $syllabus->id)
            ->where('definicion_campo_id', $field->id)
            ->first();
        $current = $fieldValue === null ? '' : $fieldValue->valor;

        $executions = AiExecution::query()
            ->where('silabo_id', $syllabus->id)
            ->where('definicion_campo_id', $field->id)
            ->with([
                'evidence',
                'recommendations.evidence',
                'recommendations.feedback',
            ])
            ->latest('solicitado_en')
            ->limit(10)
            ->get();

        return Inertia::render('Teacher/Syllabi/Ai', [
            'syllabus' => [
                'id' => $syllabus->id,
                'subject' => $syllabus->subject()->valueOrFail('nombre'),
                'state' => $syllabus->estado,
                'lock_version' => $syllabus->lock_version,
            ],
            'field' => [
                'id' => $field->id,
                'key' => $field->clave,
                'label' => $field->etiqueta,
                'content' => is_string($current) ? $current : '',
            ],
            'environment' => [
                'is_provisional_simulator' => (string) config('ai.driver') === 'baseline',
            ],
            'executions' => $executions->map(fn (AiExecution $execution): array => [
                'id' => $execution->id,
                'status' => $execution->estado,
                'requested_at' => $execution->solicitado_en->toIso8601String(),
                'completed_at' => $execution->completado_en?->toIso8601String(),
                'analysis_label' => str_starts_with(
                    $execution->version_gateway_ejecutada ?? $execution->version_gateway_solicitada,
                    'contract-simulator-',
                ) ? 'Simulador técnico provisional' : 'Servicio local autorizado',
                'input_content' => $execution->contenido_entrada,
                'reason' => $this->reasonLabel($execution->motivo_no_concluyente),
                'error_message' => $execution->mensaje_error,
                'evidence' => $execution->evidence->map(fn (AiEvidence $evidence): array => [
                    'id' => $evidence->id,
                    'source' => $evidence->nombre_fuente,
                    'authority' => $evidence->autoridad_fuente,
                    'version' => $evidence->numero_version,
                    'fragment_key' => $evidence->clave_fragmento,
                    'fragment_title' => $evidence->titulo_fragmento,
                    'excerpt' => $evidence->extracto,
                ])->values(),
                'recommendations' => $execution->recommendations->map(fn (AiRecommendation $recommendation): array => [
                    'id' => $recommendation->id,
                    'type' => $recommendation->tipo,
                    'title' => $recommendation->titulo,
                    'explanation' => $recommendation->explicacion,
                    'suggested_text' => $recommendation->texto_sugerido,
                    'evidence_ids' => $recommendation->evidence->pluck('id')->values(),
                    'my_decisions' => $recommendation->feedback
                        ->where('usuario_id', $actor->id)
                        ->pluck('decision')
                        ->values(),
                    'applied' => $recommendation->feedback->contains('decision', 'applied'),
                ])->values(),
            ])->values(),
        ]);
    }

    public function store(
        Syllabus $syllabus,
        FieldDefinition $field,
        RequestAiAnalysisRequest $request,
        RequestAiAnalysis $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute(
            $syllabus,
            $field,
            $request->string('idempotency_key')->toString(),
            $actor,
            $request,
        );

        return to_route('syllabi.ai.show', [$syllabus, $field])
            ->with('success', 'La solicitud quedó registrada. Puede continuar editando mientras se procesa.');
    }

    public function feedback(
        Syllabus $syllabus,
        FieldDefinition $field,
        AiRecommendation $recommendation,
        RecordAiFeedbackRequest $request,
        RecordAiFeedback $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $this->assertField($syllabus, $field);
        abort_unless($recommendation->definicion_campo_id === $field->id, 404);
        $action->execute(
            $syllabus,
            $recommendation,
            $request->string('decision')->toString(),
            $actor,
            $request,
        );

        return back()->with('success', 'Decisión registrada sin modificar el borrador.');
    }

    public function apply(
        Syllabus $syllabus,
        FieldDefinition $field,
        AiRecommendation $recommendation,
        ApplyAiRecommendationRequest $request,
        ApplyAiRecommendation $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $this->assertField($syllabus, $field);
        abort_unless($recommendation->definicion_campo_id === $field->id, 404);
        $action->execute(
            $syllabus,
            $recommendation,
            $request->integer('lock_version'),
            $actor,
            $request,
        );

        return to_route('syllabi.ai.show', [$syllabus, $field])
            ->with('success', 'La recomendación se aplicó al campo después de verificar la versión del borrador.');
    }

    private function assertField(Syllabus $syllabus, FieldDefinition $field): void
    {
        abort_unless(
            $field->version_plantilla_id === $syllabus->version_plantilla_id
            && $field->ia_habilitada
            && $field->editable_docente
            && ! $field->heredado
            && in_array($field->tipo, ['short_text', 'long_text', 'markdown'], true),
            404,
        );
    }

    private function reasonLabel(?string $reason): ?string
    {
        return match ($reason) {
            'source_conflict' => 'Las fuentes vigentes contienen valores divergentes y requieren resolución humana.',
            'evidence_limit_exceeded' => 'El conjunto de evidencia excede el límite técnico seguro.',
            'insufficient_evidence' => 'No hay evidencia activa y vigente suficiente para analizar.',
            'empty_content' => 'El campo todavía no contiene texto para analizar.',
            'no_editorial_change' => 'No se identificó un cambio editorial verificable.',
            null => null,
            default => 'La evidencia disponible no permite producir una recomendación verificable.',
        };
    }
}
