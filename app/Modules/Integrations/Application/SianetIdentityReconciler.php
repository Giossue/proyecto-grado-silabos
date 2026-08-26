<?php

namespace App\Modules\Integrations\Application;

use App\Modules\Academic\Infrastructure\Persistence\Models\Subject;
use App\Modules\Integrations\Domain\Contracts\ImportReconciler;
use App\Modules\Integrations\Domain\Data\ReconciliationProposal;
use App\Modules\Integrations\Domain\Exceptions\ImportContractException;

/**
 * Reconcilia contra la regla de identidad institucional confirmada en PV-10.
 *
 * En la fuente, `asignaturas.cod_oculto` es la identidad canónica de una materia: es la
 * clave primaria real y el destino de todas las claves ajenas. `cod_asig` es solo el
 * código visible y no sirve para reconciliar, porque se repite entre mallas.
 *
 * Sustituye a ConservativeImportReconciler, que declaraba todo conflicto mientras la
 * regla de identidad seguía sin confirmar.
 */
class SianetIdentityReconciler implements ImportReconciler
{
    public function version(): string
    {
        return 'sianet-identity-reconciler-v1';
    }

    public function propose(string $entityType, array $normalized): ReconciliationProposal
    {
        if ($entityType !== 'subject') {
            throw new ImportContractException('El reconciliador recibió un tipo no soportado.');
        }

        $hiddenCode = $normalized['hidden_code'] ?? null;
        if (! is_int($hiddenCode) || $hiddenCode < 1) {
            throw new ImportContractException('El registro normalizado no contiene la identidad institucional.');
        }

        $matches = Subject::query()
            ->where('codigo_oculto_institucional', $hiddenCode)
            ->get();

        if ($matches->isEmpty()) {
            return new ReconciliationProposal(
                'new',
                'create',
                'institutional_identity_absent',
                null,
                null,
                [],
            );
        }

        // El índice único sobre `codigo_oculto_institucional` lo vuelve improbable, pero
        // un catálogo cargado antes de esta alineación puede haber duplicado la materia.
        if ($matches->count() > 1) {
            $candidateIds = array_values($matches
                ->map(fn (Subject $subject): string => $subject->id)
                ->all());

            return new ReconciliationProposal(
                'conflict',
                null,
                'ambiguous_candidate',
                null,
                null,
                $candidateIds,
            );
        }

        $subject = $matches->firstOrFail();
        $same = $subject->nombre === ($normalized['name'] ?? null)
            && $subject->ciclo === ($normalized['cycle'] ?? null)
            && (float) $subject->creditos === ($normalized['credits'] ?? null)
            && $subject->codigo_institucional === ($normalized['institutional_code'] ?? null)
            && $subject->activo === ($normalized['active'] ?? null)
            && $this->sameHourBreakdown($subject, $normalized);

        return new ReconciliationProposal(
            $same ? 'unchanged' : 'change',
            $same ? 'none' : 'update',
            $same ? 'institutional_identity_matched' : 'institutional_attributes_differ',
            'subject',
            $subject->id,
            [$subject->id],
        );
    }

    /** @param array<string, bool|float|int|string|null> $normalized */
    private function sameHourBreakdown(Subject $subject, array $normalized): bool
    {
        $columns = [
            'hours_project' => 'horas_proyecto',
            'hours_ap' => 'horas_ap',
            'hours_ac' => 'horas_ac',
            'hours_pae' => 'horas_pae',
            'hours_aa' => 'horas_aa',
            'hours_paec' => 'horas_paec',
        ];

        foreach ($columns as $key => $column) {
            $incoming = $normalized[$key] ?? null;
            $stored = $subject->{$column};
            if ($incoming === null || $stored === null) {
                if ($incoming !== null || $stored !== null) {
                    return false;
                }

                continue;
            }
            if (abs((float) $stored - (float) $incoming) > 0.001) {
                return false;
            }
        }

        return true;
    }
}
