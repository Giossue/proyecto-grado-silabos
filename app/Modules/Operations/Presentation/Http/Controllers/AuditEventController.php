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
            'actor:id,nombre',
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
                ->orWhereHas('actor', fn ($actor) => $actor->where('nombre', 'ilike', "%{$escaped}%")));
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
            'academico.campus.creacion' => 'Campus creado',
            'academico.campus.cambio_estado' => 'Estado de campus actualizado',
            'academico.campus.actualizacion' => 'Campus actualizado',
            'academico.carrera.creacion' => 'Carrera creada',
            'academico.carrera.cambio_estado' => 'Estado de carrera actualizado',
            'academico.carrera.actualizacion' => 'Carrera actualizada',
            'academico.escuela.creacion' => 'Escuela creada',
            'academico.escuela.cambio_estado' => 'Estado de escuela actualizado',
            'academico.escuela.actualizacion' => 'Escuela actualizada',
            'academico.facultad.creacion' => 'Facultad creada',
            'academico.facultad.cambio_estado' => 'Estado de facultad actualizado',
            'academico.facultad.actualizacion' => 'Facultad actualizada',
            'academico.modalidad.creacion' => 'Modalidad creada',
            'academico.modalidad.cambio_estado' => 'Estado de modalidad actualizado',
            'academico.modalidad.actualizacion' => 'Modalidad actualizada',
            'academico.periodo.creacion' => 'Periodo académico creado',
            'academico.periodo.cambio_estado' => 'Estado de periodo académico actualizado',
            'academico.periodo.actualizacion' => 'Periodo académico actualizado',
            'academico.malla.actualizacion' => 'Malla actualizada',
            'academico.malla.eliminacion' => 'Malla eliminada',
            'academico.malla.configuracion_actualizada' => 'Configuración de malla actualizada',
            'academico.campo_malla.creacion' => 'Campo de malla agregado',
            'academico.campo_malla.eliminacion' => 'Campo de malla retirado',
            'academico.asignatura.creacion' => 'Materia creada',
            'academico.asignatura.actualizacion' => 'Materia actualizada',
            'academico.asignatura.eliminacion' => 'Materia retirada',
            'academico.asignatura.posicion_actualizada' => 'Materia reubicada en la malla',
            'academico.requisito_asignatura.creacion' => 'Relación académica agregada',
            'academico.requisito_asignatura.eliminacion' => 'Relación académica eliminada',
            'academico.oferta.creacion' => 'Oferta académica creada',
            'academico.oferta.actualizacion' => 'Oferta académica actualizada',
            'academico.paralelo.creacion' => 'Paralelo creado',
            'academico.paralelo.actualizacion' => 'Paralelo actualizado',
            'academico.asignacion_docente.creacion' => 'Asignación docente creada',
            'academico.asignacion_docente.actualizacion' => 'Asignación docente actualizada',
            'convocatoria.creada' => 'Convocatoria creada',
            'convocatoria.abierta' => 'Convocatoria abierta',
            'convocatoria.plazo_extendido' => 'Plazo de convocatoria extendido',
            'documento.descargado' => 'Documento descargado',
            'documento.exportacion_completada' => 'Exportación completada',
            'documento.exportacion_fallida' => 'Exportación fallida',
            'documento.exportacion_solicitada' => 'Exportación solicitada',
            'trabajo.reintento_solicitado' => 'Reintento solicitado',
            'fuente.creada' => 'Fuente académica creada',
            'fuente.actualizada' => 'Fuente académica actualizada',
            'fuente.contenido_actualizado' => 'Contenido de fuente actualizado',
            'silabo.aprobado' => 'Sílabo aprobado',
            'silabo.correccion_solicitada' => 'Corrección solicitada',
            'silabo.reabierto' => 'Sílabo reabierto',
            'silabo.reiniciado' => 'Sílabo reiniciado',
            'silabo.reenviado' => 'Sílabo reenviado',
            'silabo.enviado' => 'Sílabo enviado',
            'silabo.observacion_agregada' => 'Observación registrada',
            'silabo.observacion_respondida' => 'Observación respondida',
            'silabo.observacion_verificada' => 'Observación verificada',
            'silabo.borrador_iniciado' => 'Borrador iniciado',
            'silabo.campo_guardado' => 'Campo guardado',
            'silabo.docente_transferido' => 'Docente transferido',
            'silabo.validado' => 'Borrador validado',
            'plantilla.creada' => 'Plantilla creada',
            'plantilla.version_publicada' => 'Plantilla publicada',
            'plantilla.version_clonada' => 'Versión de plantilla clonada',
            'usuario.creado' => 'Usuario creado',
            'usuario.rol_asignado' => 'Rol asignado',
            'usuario.activado' => 'Cuenta activada',
            'usuario.desactivado' => 'Cuenta desactivada',
            'usuario.perfil_actualizado' => 'Perfil actualizado',
            'usuario.contrasena_temporal_cambiada' => 'Contraseña temporal cambiada',
            'rol_activo.seleccionado' => 'Rol activo seleccionado',
            'ia.analisis_solicitado' => 'Análisis de IA solicitado',
            'ia.analisis_completado' => 'Análisis de IA completado',
            'ia.analisis_fallido' => 'Análisis de IA fallido',
            default => 'Acción registrada',
        };
    }

    private function resourceLabel(string $resource): string
    {
        return match ($resource) {
            'fuente_academica' => 'Fuente académica',
            'aprobacion' => 'Aprobación',
            'campus' => 'Campus',
            'convocatoria' => 'Convocatoria',
            'carrera' => 'Carrera',
            'escuela' => 'Escuela',
            'solicitud_correccion' => 'Solicitud de corrección',
            'artefacto_exportacion' => 'Exportación',
            'facultad' => 'Facultad',
            'ejecucion_trabajo' => 'Trabajo asíncrono',
            'modalidad' => 'Modalidad',
            'malla' => 'Malla',
            'campo_malla' => 'Campo de malla',
            'asignatura' => 'Materia',
            'requisito' => 'Relación académica',
            'oferta' => 'Oferta académica',
            'paralelo' => 'Paralelo',
            'asignacion_docente' => 'Asignación docente',
            'asignacion_coordinador' => 'Asignación de coordinación',
            'periodo' => 'Periodo académico',
            'observacion_revision' => 'Observación',
            'silabo' => 'Sílabo',
            'revision_silabo' => 'Revisión de sílabo',
            'version_plantilla' => 'Versión de plantilla',
            'plantilla_silabo' => 'Plantilla de sílabo',
            'ejecucion_ia' => 'Análisis de IA',
            'evento_saliente' => 'Evento saliente',
            'asignacion_rol' => 'Asignación de rol',
            'usuario' => 'Usuario',
            default => 'Recurso del sistema',
        };
    }

    private function actorName(AuditEvent $event): string
    {
        $actor = $event->getRelation('actor');

        return $actor instanceof User ? $actor->nombre : 'Sistema';
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
