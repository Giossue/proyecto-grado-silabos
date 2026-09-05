<?php

namespace App\Modules\Operations\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Operations\Application\Actions\RetryJobExecution;
use App\Modules\Operations\Infrastructure\Persistence\Models\JobExecution;
use App\Modules\Operations\Presentation\Http\Requests\RetryJobExecutionRequest;
use App\Modules\Operations\Presentation\Http\Requests\ViewJobExecutionsRequest;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class JobExecutionController extends Controller
{
    public function index(ViewJobExecutionsRequest $request): Response
    {
        $search = trim($request->string('q')->toString());
        $status = $request->string('status')->toString();
        $type = $request->string('type')->toString();
        $queue = $request->string('queue')->toString();
        $query = JobExecution::query();
        if ($search !== '') {
            $escaped = addcslashes($search, '%_\\');
            $matchingTypes = collect($this->typeOptions())
                ->filter(fn (array $option): bool => str_contains(mb_strtolower($option['label']), mb_strtolower($search)))
                ->pluck('value');
            $matchingQueues = collect($this->queueOptions())
                ->filter(fn (array $option): bool => str_contains(mb_strtolower($option['label']), mb_strtolower($search)))
                ->pluck('value');
            $query->where(fn ($builder) => $builder
                ->where('tipo', 'ilike', "%{$escaped}%")
                ->orWhere('cola', 'ilike', "%{$escaped}%")
                ->orWhereIn('tipo', $matchingTypes)
                ->orWhereIn('cola', $matchingQueues));
        }
        if ($status !== '') {
            $query->where('estado', $status);
        }
        if ($type !== '') {
            $query->where('tipo', $type);
        }
        if ($queue !== '') {
            $query->where('cola', $queue);
        }

        return Inertia::render('Admin/Operations/Jobs', [
            'filters' => ['q' => $search, 'status' => $status, 'type' => $type, 'queue' => $queue],
            'type_options' => $this->typeOptions(),
            'queue_options' => $this->queueOptions(),
            'executions' => $query->latest('encolado_en')->paginate(25)->withQueryString()
                ->through(fn (JobExecution $execution): array => [
                    'id' => $execution->id,
                    'tipo' => $this->typeLabel($execution->tipo),
                    'cola' => $this->queueLabel($execution->cola),
                    'estado' => $execution->estado,
                    'intentos' => $execution->intentos,
                    'intentos_maximos' => $execution->intentos_maximos,
                    'progreso' => $execution->progreso,
                    'mensaje_error' => $this->safeError($execution),
                    'encolado_en' => $execution->encolado_en?->toIso8601String(),
                    'iniciado_en' => $execution->iniciado_en?->toIso8601String(),
                    'finalizado_en' => $execution->finalizado_en?->toIso8601String(),
                    'reintentable' => $execution->estado === 'fallida'
                        && in_array($execution->tipo, ['documento.exportacion', 'notificacion.interna'], true),
                ]),
        ]);
    }

    public function retry(
        JobExecution $execution,
        RetryJobExecutionRequest $request,
        RetryJobExecution $action,
    ): RedirectResponse {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $action->execute($execution, $actor, $request);

        return back()->with('success', 'El trabajo fallido quedó en cola para un nuevo ciclo de intentos.');
    }

    private function typeLabel(string $type): string
    {
        return match ($type) {
            'ia.analisis' => 'Asistencia de IA',
            'documento.exportacion' => 'Generación documental',
            'notificacion.interna' => 'Notificación interna',
            'plataforma.verificacion' => 'Comprobación de plataforma',
            default => 'Proceso del sistema',
        };
    }

    /** @return list<array{value: string, label: string}> */
    private function typeOptions(): array
    {
        $options = [];
        foreach (JobExecution::query()->distinct()->orderBy('tipo')->pluck('tipo') as $value) {
            if (is_string($value)) {
                $options[] = ['value' => $value, 'label' => $this->typeLabel($value)];
            }
        }

        return $options;
    }

    private function queueLabel(string $queue): string
    {
        return match ($queue) {
            'ia' => 'IA local',
            'documentos' => 'Documentos',
            'notificaciones' => 'Notificaciones',
            'critica' => 'Crítica',
            'integraciones' => 'Integraciones',
            default => 'General',
        };
    }

    /** @return list<array{value: string, label: string}> */
    private function queueOptions(): array
    {
        $options = [];
        foreach (JobExecution::query()->distinct()->orderBy('cola')->pluck('cola') as $value) {
            if (is_string($value)) {
                $options[] = ['value' => $value, 'label' => $this->queueLabel($value)];
            }
        }

        return $options;
    }

    private function safeError(JobExecution $execution): ?string
    {
        if ($execution->estado !== 'fallida') {
            return null;
        }

        return in_array($execution->codigo_error, [
            'analisis_ia_fallido', 'contrato_ia_invalido', 'servicio_ia_no_disponible',
            'exportacion_documento_fallida', 'notificacion_interna_fallida',
        ], true)
            ? $execution->mensaje_error
            : 'El trabajo terminó con un error. Revise los registros técnicos usando su identificador de correlación.';
    }
}
