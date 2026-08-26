<?php

namespace App\Modules\Integrations\Infrastructure\Readers;

use App\Modules\Integrations\Domain\Contracts\InstitutionalDataReader;
use App\Modules\Integrations\Domain\Data\InstitutionalBatch;
use App\Modules\Integrations\Domain\Data\InstitutionalRecord;
use App\Modules\Integrations\Domain\Exceptions\ImportContractException;

/**
 * Lote sintético que reproduce la forma del contrato institucional sin contener un solo
 * dato real: códigos inventados, sin cédulas, nombres ni correos.
 *
 * La forma sí es la real y ejercita los casos observados en la fuente: identidad por
 * `cod_oculto`, código visible con paréntesis, ciclo ausente y horas desglosadas.
 */
class AnonymizedFixtureInstitutionalDataReader implements InstitutionalDataReader
{
    public function source(): string
    {
        return 'anonymized-fixture';
    }

    public function version(): string
    {
        return 'anonymized-fixture-v2';
    }

    public function read(string $profile): InstitutionalBatch
    {
        if ($profile !== 'baseline') {
            throw new ImportContractException('El perfil solicitado no existe en el fixture autorizado.');
        }

        return new InstitutionalBatch($this->source(), $this->version(), $profile, [
            // Coincide con el catálogo sembrado: sin cambios que proponer.
            new InstitutionalRecord(1, 'fixture-existing-subject', 'subject', [
                'career_code' => 'SOFTWARE',
                'curriculum_code' => 'MALLA-SW-2024',
                'institutional_code' => 'SW-601',
                'hidden_code' => 2601,
                'name' => 'Arquitectura de Software',
                'cycle' => 6,
                'credits' => 4,
                'hours_project' => null,
                'hours_ap' => null,
                'hours_ac' => 64.0,
                'hours_pae' => null,
                'hours_aa' => 96.0,
                'hours_paec' => null,
                'active' => true,
            ]),
            // Identidad institucional ausente en el catálogo: alta propuesta.
            new InstitutionalRecord(2, 'fixture-new-subject', 'subject', [
                'career_code' => 'SOFTWARE',
                'curriculum_code' => 'MALLA-SW-2024',
                'institutional_code' => 'SW-FIX-701',
                'hidden_code' => 2701,
                'name' => 'Calidad de Software',
                'cycle' => 7,
                'credits' => 3,
                'hours_project' => null,
                'hours_ap' => null,
                'hours_ac' => 48.0,
                'hours_pae' => null,
                'hours_aa' => 72.0,
                'hours_paec' => null,
                'active' => true,
            ]),
            // Dos filas comparten referencia externa: conflicto por duplicado.
            // La primera usa paréntesis en el código visible, como 332 filas de la fuente.
            new InstitutionalRecord(3, 'fixture-duplicate-reference', 'subject', [
                'career_code' => 'SOFTWARE',
                'curriculum_code' => 'MALLA-SW-2024',
                'institutional_code' => 'PLCE(MF)H-FIX-801',
                'hidden_code' => 2801,
                'name' => 'Práctica profesional I',
                'cycle' => 8,
                'credits' => 2,
                'hours_project' => 40.0,
                'hours_ap' => null,
                'hours_ac' => null,
                'hours_pae' => 40.0,
                'hours_aa' => null,
                'hours_paec' => null,
                'active' => true,
            ]),
            new InstitutionalRecord(4, 'fixture-duplicate-reference', 'subject', [
                'career_code' => 'SOFTWARE',
                'curriculum_code' => 'MALLA-SW-2024',
                'institutional_code' => 'SW-FIX-802',
                'hidden_code' => 2802,
                'name' => 'Práctica profesional II',
                'cycle' => null,
                'credits' => 2,
                'hours_project' => 40.0,
                'hours_ap' => null,
                'hours_ac' => null,
                'hours_pae' => 40.0,
                'hours_aa' => null,
                'hours_paec' => null,
                'active' => true,
            ]),
            // Incumple el contrato: se rechaza sin tocar el catálogo.
            new InstitutionalRecord(5, 'fixture-invalid-subject', 'subject', [
                'career_code' => 'SOFTWARE',
                'curriculum_code' => 'MALLA-SW-2024',
                'institutional_code' => 'SW-FIX-BAD',
                'hidden_code' => 0,
                'name' => '',
                'cycle' => 'octavo',
                'credits' => -1,
                'hours_project' => null,
                'hours_ap' => null,
                'hours_ac' => null,
                'hours_pae' => null,
                'hours_aa' => null,
                'hours_paec' => null,
                'active' => true,
            ]),
        ]);
    }
}
