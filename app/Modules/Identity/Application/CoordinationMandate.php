<?php

namespace App\Modules\Identity\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\CoordinatorAssignment;
use App\Modules\Identity\Domain\Enums\RoleCode;
use Illuminate\Validation\ValidationException;

/**
 * El nombramiento que acompaña al rol de Coordinador.
 *
 * El rol dice qué puede hacer alguien; el nombramiento, que ejerce esa coordinación en
 * una carrera. `AcademicRoleEligibility` exige el segundo para dejar
 * activar el primero, así que separarlos en dos pantallas dejaba cuentas con la insignia
 * de coordinador que no podían coordinar nada. Aquí van juntos.
 */
class CoordinationMandate
{
    /**
     * Abre el nombramiento al conceder el rol. Es idempotente: repetir la concesión no
     * duplica el nombramiento.
     *
     * @throws ValidationException cuando la carrera ya tiene a otra persona al mando
     */
    public function open(
        string $userId,
        string $roleCode,
        ?string $careerId,
        string $quality = 'titular',
    ): ?CoordinatorAssignment {
        if ($roleCode !== RoleCode::Coordinator->value || $careerId === null) {
            return null;
        }

        $current = CoordinatorAssignment::query()
            ->effective()
            ->where('carrera_id', $careerId)
            ->first();

        if ($current !== null && $current->usuario_id === $userId) {
            return $current;
        }

        // La base impide dos coordinaciones activas en una carrera, y
        // cerrarla por nuestra cuenta le quitaría el mando a alguien sin decirlo. Se
        // rechaza con un mensaje que nombra el paso que falta.
        if ($current !== null) {
            throw ValidationException::withMessages([
                'role_code' => 'Esa carrera ya tiene una coordinación activa. Desactive primero a quien la ejerce.',
            ]);
        }

        return CoordinatorAssignment::query()->create([
            'usuario_id' => $userId,
            'carrera_id' => $careerId,
            'activo' => true,
            'calidad' => $quality,
        ]);
    }

    /**
     * Cierra los nombramientos activos de una persona. Se llama al desactivarla: dejar
     * la coordinación abierta bloquearía la carrera, porque nadie más podría asumirla.
     */
    public function closeFor(string $userId): int
    {
        return CoordinatorAssignment::query()
            ->effective()
            ->where('usuario_id', $userId)
            ->update(['activo' => false]);
    }
}
