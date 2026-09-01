<?php

namespace App\Modules\Operations\Presentation\Http\Controllers;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Modules\Operations\Infrastructure\Persistence\Models\AuditEvent;
use App\Modules\Operations\Presentation\Http\Requests\ViewAuditEventsRequest;
use Carbon\CarbonImmutable;
use Inertia\Inertia;
use Inertia\Response;

class AuditEventController extends Controller
{
    public function index(ViewAuditEventsRequest $request): Response
    {
        $action = $request->string('action')->toString();
        $result = $request->string('result')->toString();
        $search = trim($request->string('search')->toString());
        $from = $request->string('from')->toString();
        $to = $request->string('to')->toString();
        $query = AuditEvent::query()->with([
            'actor:id,name',
            'roleAssignment.role:id,nombre',
            'roleAssignment.career:id,nombre',
        ]);
        if ($action !== '') {
            $query->where('accion', $action);
        }
        if ($result !== '') {
            $query->where('resultado', $result);
        }
        if ($search !== '') {
            $escaped = addcslashes($search, '%_\\');
            $query->where(fn ($builder) => $builder
                ->where('accion', 'ilike', "%{$escaped}%")
                ->orWhereHas('actor', fn ($actor) => $actor->where('name', 'ilike', "%{$escaped}%")));
        }
        if ($from !== '') {
            $query->where('ocurrido_en', '>=', CarbonImmutable::createFromFormat('Y-m-d', $from, 'America/Guayaquil')
                ->startOfDay()->utc());
        }
        if ($to !== '') {
            $query->where('ocurrido_en', '<=', CarbonImmutable::createFromFormat('Y-m-d', $to, 'America/Guayaquil')
                ->endOfDay()->utc());
        }

        return Inertia::render('Admin/Operations/Audit', [
            'filters' => [
                'action' => $action,
                'result' => $result,
                'search' => $search,
                'from' => $from,
                'to' => $to,
            ],
            'action_options' => $this->actionOptions(),
            'events' => $query->latest('ocurrido_en')->paginate(30)->withQueryString()
                ->through(fn (AuditEvent $event): array => [
                    'id' => $event->id,
                    'action' => $this->actionLabel($event->accion),
                    'resource' => $this->resourceLabel($event->tipo_recurso),
                    'result' => $event->resultado,
                    'actor' => $this->actorName($event),
                    'role' => $event->roleAssignment?->role->nombre,
                    'career' => $event->roleAssignment?->career?->nombre,
                    'details' => $this->safeDetails($event->metadatos),
                    'occurred_at' => $event->ocurrido_en->toIso8601String(),
                ]),
        ]);
    }

    /** @return list<array{value: string, label: string}> */
    private function actionOptions(): array
    {
        $options = [];
        foreach (AuditEvent::query()->distinct()->orderBy('accion')->pluck('accion') as $value) {
            if (is_string($value)) {
                $options[] = ['value' => $value, 'label' => $this->actionLabel($value)];
            }
        }

        return $options;
    }

    private function actionLabel(string $action): string
    {
        return match ($action) {
            'academic.campus.created' => 'Campus creado',
            'academic.campus.status_changed' => 'Estado de campus actualizado',
            'academic.campus.updated' => 'Campus actualizado',
            'academic.career.created' => 'Carrera creada',
            'academic.career.status_changed' => 'Estado de carrera actualizado',
            'academic.career.updated' => 'Carrera actualizada',
            'academic.faculty.created' => 'Facultad creada',
            'academic.faculty.status_changed' => 'Estado de facultad actualizado',
            'academic.faculty.updated' => 'Facultad actualizada',
            'academic.modality.created' => 'Modalidad creada',
            'academic.modality.status_changed' => 'Estado de modalidad actualizado',
            'academic.modality.updated' => 'Modalidad actualizada',
            'academic.period.created' => 'Periodo académico creado',
            'academic.period.status_changed' => 'Estado de periodo académico actualizado',
            'academic.period.updated' => 'Periodo académico actualizado',
            'academic.curriculum.updated' => 'Malla actualizada',
            'academic.curriculum.configuration_updated' => 'Configuración de malla actualizada',
            'academic.curriculum_field.created' => 'Campo de malla agregado',
            'academic.curriculum_field.deleted' => 'Campo de malla retirado',
            'academic.subject.updated' => 'Materia actualizada',
            'academic.subject.layout_updated' => 'Materia reubicada en la malla',
            'academic.subject_requirement.created' => 'Relación académica agregada',
            'academic.subject_requirement.deleted' => 'Relación académica eliminada',
            'academic.offering.updated' => 'Oferta académica actualizada',
            'academic.parallel.updated' => 'Paralelo actualizado',
            'academic.teacher_assignment.updated' => 'Asignación docente actualizada',
            'convocation.created' => 'Convocatoria creada',
            'convocation.opened' => 'Convocatoria abierta',
            'document.downloaded' => 'Documento descargado',
            'document.export_completed' => 'Exportación completada',
            'document.export_failed' => 'Exportación fallida',
            'document.export_requested' => 'Exportación solicitada',
            'job.retry_requested' => 'Reintento solicitado',
            'source.created' => 'Fuente académica creada',
            'source.updated' => 'Fuente académica actualizada',
            'source.content_updated' => 'Contenido de fuente actualizado',
            'syllabus.approved' => 'Sílabo aprobado',
            'syllabus.correction_requested' => 'Corrección solicitada',
            'syllabus.reopened' => 'Sílabo reabierto',
            'syllabus.resubmit' => 'Sílabo reenviado',
            'syllabus.submit' => 'Sílabo enviado',
            'syllabus.observation_added' => 'Observación registrada',
            'syllabus.observation_responded' => 'Observación respondida',
            'syllabus.observation_verified' => 'Observación verificada',
            'syllabus.draft_started' => 'Borrador iniciado',
            'syllabus.field_updated' => 'Campo actualizado',
            'syllabus.validated' => 'Borrador validado',
            'template.created' => 'Plantilla creada',
            'template.published' => 'Plantilla publicada',
            'user.created' => 'Usuario creado',
            'user.role_assigned' => 'Rol asignado',
            'user.status_changed' => 'Estado de usuario actualizado',
            default => 'Acción registrada',
        };
    }

    private function resourceLabel(string $resource): string
    {
        return match ($resource) {
            'academic_source' => 'Fuente académica',
            'approval' => 'Aprobación',
            'campus' => 'Campus',
            'convocation' => 'Convocatoria',
            'career' => 'Carrera',
            'correction_request' => 'Solicitud de corrección',
            'export_artifact' => 'Exportación',
            'faculty' => 'Facultad',
            'job_execution' => 'Trabajo asíncrono',
            'modality' => 'Modalidad',
            'curriculum' => 'Malla',
            'curriculum_field' => 'Campo de malla',
            'subject' => 'Materia',
            'subject_requirement' => 'Relación académica',
            'offering' => 'Oferta académica',
            'parallel' => 'Paralelo',
            'teacher_assignment' => 'Asignación docente',
            'period' => 'Periodo académico',
            'review_observation' => 'Observación',
            'syllabus' => 'Sílabo',
            'syllabus_revision' => 'Revisión de sílabo',
            'template_version' => 'Versión de plantilla',
            'user' => 'Usuario',
            default => 'Recurso del sistema',
        };
    }

    private function actorName(AuditEvent $event): string
    {
        $actor = $event->getRelation('actor');

        return $actor instanceof User ? $actor->name : 'Sistema';
    }

    /**
     * @param  array<string, mixed>|null  $activeRole
     * @return list<array{label: string, value: bool|float|int|string}>
     */
    private function safeDetails(?array $activeRole): array
    {
        $labels = [
            'active' => 'Activo',
            'after_code' => 'Código nuevo',
            'after_ends_on' => 'Fecha de fin nueva',
            'after_faculty' => 'Facultad nueva',
            'after_name' => 'Nombre nuevo',
            'after_starts_on' => 'Fecha de inicio nueva',
            'after_version_number' => 'Número de versión nuevo',
            'after_cycle' => 'Ciclo nuevo',
            'after_cycle_count' => 'Cantidad de ciclos nueva',
            'after_credits' => 'Créditos nuevos',
            'after_total_hours' => 'Horas totales nuevas',
            'after_valid_from' => 'Vigente desde nuevo',
            'after_valid_until' => 'Vigente hasta nuevo',
            'before_code' => 'Código anterior',
            'before_ends_on' => 'Fecha de fin anterior',
            'before_faculty' => 'Facultad anterior',
            'before_name' => 'Nombre anterior',
            'before_starts_on' => 'Fecha de inicio anterior',
            'before_version_number' => 'Número de versión anterior',
            'before_cycle' => 'Ciclo anterior',
            'before_cycle_count' => 'Cantidad de ciclos anterior',
            'before_credits' => 'Créditos anteriores',
            'before_total_hours' => 'Horas totales anteriores',
            'before_valid_from' => 'Vigente desde anterior',
            'before_valid_until' => 'Vigente hasta anterior',
            'blocking_errors' => 'Errores bloqueantes',
            'changed_fields' => 'Campos modificados',
            'decision' => 'Decisión',
            'field_key' => 'Campo',
            'fingerprint' => 'Huella del contenido',
            'key' => 'Clave del campo',
            'format' => 'Formato',
            'generated_count' => 'Expedientes generados',
            'grouping_mode' => 'Agrupación',
            'initial_role' => 'Rol inicial',
            'job_type' => 'Tipo de trabajo',
            'lock_version' => 'Versión de edición',
            'observation_count' => 'Observaciones',
            'previous_attempts' => 'Intentos anteriores',
            'previous_error_code' => 'Categoría de fallo previa',
            'renderer_version' => 'Versión de formato',
            'revision_number' => 'Número de revisión',
            'role' => 'Rol',
            'rule_version' => 'Versión de reglas',
            'source_count' => 'Fuentes vinculadas',
            'type' => 'Tipo de relación',
        ];
        $details = [];
        foreach ($activeRole ?? [] as $key => $value) {
            if (isset($labels[$key]) && (is_bool($value) || is_float($value) || is_int($value) || is_string($value))) {
                $details[] = ['label' => $labels[$key], 'value' => $value];
            }
        }

        return $details;
    }
}
