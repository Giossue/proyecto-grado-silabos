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
                ->where('type', 'ilike', "%{$escaped}%")
                ->orWhere('queue_name', 'ilike', "%{$escaped}%")
                ->orWhereIn('type', $matchingTypes)
                ->orWhereIn('queue_name', $matchingQueues));
        }
        if ($status !== '') {
            $query->where('status', $status);
        }
        if ($type !== '') {
            $query->where('type', $type);
        }
        if ($queue !== '') {
            $query->where('queue_name', $queue);
        }

        return Inertia::render('Admin/Operations/Jobs', [
            'filters' => ['q' => $search, 'status' => $status, 'type' => $type, 'queue' => $queue],
            'type_options' => $this->typeOptions(),
            'queue_options' => $this->queueOptions(),
            'executions' => $query->latest('created_at')->paginate(25)->withQueryString()
                ->through(fn (JobExecution $execution): array => [
                    'id' => $execution->id,
                    'type' => $this->typeLabel($execution->type),
                    'queue' => $this->queueLabel($execution->queue_name),
                    'status' => $execution->status,
                    'attempts' => $execution->attempts,
                    'max_attempts' => $execution->max_attempts,
                    'progress' => $execution->progress,
                    'error_message' => $this->safeError($execution),
                    'created_at' => $execution->created_at?->toIso8601String(),
                    'started_at' => $execution->started_at?->toIso8601String(),
                    'finished_at' => $execution->finished_at?->toIso8601String(),
                    'retryable' => $execution->status === 'failed'
                        && in_array($execution->type, ['document.export', 'notification.internal'], true),
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
            'ai.analysis' => 'Asistencia de IA',
            'document.export' => 'Generación documental',
            'notification.internal' => 'Notificación interna',
            'platform.smoke' => 'Comprobación de plataforma',
            default => 'Proceso del sistema',
        };
    }

    /** @return list<array{value: string, label: string}> */
    private function typeOptions(): array
    {
        $options = [];
        foreach (JobExecution::query()->distinct()->orderBy('type')->pluck('type') as $value) {
            if (is_string($value)) {
                $options[] = ['value' => $value, 'label' => $this->typeLabel($value)];
            }
        }

        return $options;
    }

    private function queueLabel(string $queue): string
    {
        return match ($queue) {
            'ai' => 'IA local',
            'documents' => 'Documentos',
            'notifications' => 'Notificaciones',
            'critical' => 'Crítica',
            default => 'General',
        };
    }

    /** @return list<array{value: string, label: string}> */
    private function queueOptions(): array
    {
        $options = [];
        foreach (JobExecution::query()->distinct()->orderBy('queue_name')->pluck('queue_name') as $value) {
            if (is_string($value)) {
                $options[] = ['value' => $value, 'label' => $this->queueLabel($value)];
            }
        }

        return $options;
    }

    private function safeError(JobExecution $execution): ?string
    {
        if ($execution->status !== 'failed') {
            return null;
        }

        return in_array($execution->error_code, [
            'ai_analysis_failed', 'ai_contract_invalid', 'ai_service_unavailable',
            'import_contract_invalid', 'institutional_reader_unavailable', 'institutional_import_failed',
            'document_export_failed', 'internal_notification_failed',
        ], true)
            ? $execution->error_message
            : 'El trabajo terminó con un error. Revise los registros técnicos usando su identificador de correlación.';
    }
}
