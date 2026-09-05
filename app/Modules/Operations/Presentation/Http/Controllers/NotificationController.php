<?php

namespace App\Modules\Operations\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\AiAssistance\Infrastructure\Persistence\Models\AiExecution;
use App\Modules\Documents\Infrastructure\Persistence\Models\ExportArtifact;
use App\Modules\Operations\Infrastructure\Persistence\Models\InternalNotification;
use App\Modules\Operations\Presentation\Http\Requests\MarkAllNotificationsReadRequest;
use App\Modules\Operations\Presentation\Http\Requests\MarkNotificationReadRequest;
use App\Modules\Operations\Presentation\Http\Requests\ViewNotificationsRequest;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Illuminate\Http\RedirectResponse;
use Inertia\Inertia;
use Inertia\Response;

class NotificationController extends Controller
{
    public function index(ViewNotificationsRequest $request): Response
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        $status = $request->string('status')->toString() ?: 'all';
        $query = InternalNotification::query()->where('usuario_id', $actor->id);
        if ($status === 'unread') {
            $query->whereNull('leido_en');
        }

        return Inertia::render('Notifications/Index', [
            'filters' => ['status' => $status],
            'notifications' => $query->latest('notificado_en')->paginate(20)->withQueryString()
                ->through(fn (InternalNotification $notification): array => [
                    'id' => $notification->id,
                    'tipo' => $notification->tipo,
                    'titulo' => $notification->titulo,
                    'mensaje' => $notification->mensaje,
                    'leido_en' => $notification->leido_en?->toIso8601String(),
                    'notificado_en' => $notification->notificado_en->toIso8601String(),
                    'url_recurso' => $this->resourceUrl($notification, $actor),
                ]),
        ]);
    }

    public function markRead(
        InternalNotification $notification,
        MarkNotificationReadRequest $request,
    ): RedirectResponse {
        if ($notification->leido_en === null) {
            $notification->update(['leido_en' => now()]);
        }

        return back()->with('success', 'Notificación marcada como leída.');
    }

    public function markAllRead(MarkAllNotificationsReadRequest $request): RedirectResponse
    {
        $actor = $request->user();
        abort_unless($actor instanceof User, 401);
        InternalNotification::query()
            ->where('usuario_id', $actor->id)
            ->whereNull('leido_en')
            ->update(['leido_en' => now()]);

        return back()->with('success', 'Todas las notificaciones quedaron marcadas como leídas.');
    }

    private function resourceUrl(InternalNotification $notification, User $actor): ?string
    {
        if ($notification->recurso_id === null) {
            return null;
        }
        if ($notification->tipo_recurso === 'silabo') {
            $syllabus = Syllabus::query()->find($notification->recurso_id);
            if ($syllabus !== null && $actor->can('review', $syllabus)) {
                $revision = $syllabus->revisions()->latest('numero_revision')->first();

                return $revision === null ? null : route('reviews.show', $revision);
            }

            return $syllabus !== null && $actor->can('view', $syllabus)
                ? route('syllabi.show', $syllabus)
                : null;
        }
        if ($notification->tipo_recurso === 'artefacto_exportacion') {
            $artifact = ExportArtifact::query()->with('revision')->find($notification->recurso_id);

            return $artifact !== null && $actor->can('view', $artifact)
                ? route('documents.show', $artifact->revision)
                : null;
        }
        if ($notification->tipo_recurso === 'ejecucion_ia') {
            $execution = AiExecution::query()->with(['syllabus', 'field'])->find($notification->recurso_id);

            return $execution !== null && $actor->can('edit', $execution->syllabus)
                ? route('syllabi.ai.show', [$execution->syllabus, $execution->field])
                : null;
        }

        return null;
    }
}
