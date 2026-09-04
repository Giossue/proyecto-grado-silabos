<?php

namespace App\Modules\Identity\Application\Actions;

use App\Models\User;
use App\Modules\Identity\Application\ActiveRole;
use App\Modules\Operations\Application\Actions\RecordAuditEvent;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/**
 * Borra una cuenta que nunca se estrenó y no dejó rastro: solo su rol, su carrera y, si
 * acaso, un nombramiento de coordinación. Cualquier otra huella (sílabos, asignaciones
 * docentes, revisiones, auditoría como actor) la vuelve historia y entonces se desactiva,
 * no se borra (I-38).
 */
class DeleteManagedUser
{
    /** Tablas donde una cuenta deja historia que no se puede borrar. */
    private const TRACES = [
        'asignaciones_docente' => 'usuario_id',
        'colaboradores_silabo' => 'usuario_id',
        'eventos_auditoria' => 'actor_usuario_id',
        'convocatorias' => 'creado_por',
        'procesos_silabos' => 'creado_por',
        'observaciones_revision' => 'creado_por',
        'revisiones_silabo' => 'enviado_por',
        'artefactos_exportacion' => 'solicitado_por',
        'objetos_almacenados' => 'propietario_usuario_id',
    ];

    public function __construct(
        private readonly ActiveRole $roles,
        private readonly RecordAuditEvent $audit,
    ) {}

    public function execute(User $target, User $actor, Request $request): void
    {
        $activeRole = $this->roles->resolve($request);

        DB::transaction(function () use ($activeRole, $actor, $request, $target): void {
            $locked = User::query()->lockForUpdate()->findOrFail($target->id);
            if (! $locked->debe_cambiar_contrasena) {
                throw ValidationException::withMessages([
                    'user' => 'La cuenta ya fue activada por su titular. Desactívela en lugar de eliminarla.',
                ]);
            }
            foreach (self::TRACES as $table => $column) {
                if (DB::table($table)->where($column, $locked->id)->exists()) {
                    throw ValidationException::withMessages([
                        'user' => 'La cuenta ya tiene actividad registrada. Desactívela en lugar de eliminarla.',
                    ]);
                }
            }

            $email = $locked->correo_electronico;
            $name = $locked->nombre;
            foreach (['notificaciones_internas' => 'usuario_id', 'sesiones' => 'user_id', 'asignaciones_coordinador' => 'usuario_id', 'asignaciones_rol' => 'usuario_id'] as $table => $column) {
                DB::table($table)->where($column, $locked->id)->delete();
            }
            $locked->delete();

            $this->audit->execute(
                actorId: $actor->id,
                roleAssignmentId: $activeRole?->id,
                action: 'usuario.eliminado',
                resourceType: 'usuario',
                resourceId: $target->id,
                result: 'exito',
                metadata: ['email' => $email, 'name' => $name],
                correlationId: $request->attributes->getString('correlation_id') ?: null,
            );
        });
    }
}
