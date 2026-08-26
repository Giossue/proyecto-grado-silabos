<?php

namespace App\Modules\Integrations\Application;

use App\Modules\Integrations\Domain\Contracts\AcademicRecordMapper;
use App\Modules\Integrations\Domain\Data\InstitutionalRecord;
use App\Modules\Integrations\Domain\Data\MappingResult;

/**
 * Mapper del contrato real de la fuente institucional SIANET para `asignaturas`.
 *
 * Las cotas provienen del respaldo del 23 de junio de 2025, no de supuestos:
 *  - `cod_asig` incluye paréntesis en 332 de 4939 filas, p. ej. PLCE(MF)H-UB-207.
 *  - `nom_asig` llega exactamente a 180 caracteres y 248 filas traen espacios en los
 *    bordes, por lo que se recorta antes de medir.
 *  - `num_cred_asig` va de 0 a 22.
 *  - El ciclo vive en `detalles_malla` y 21 asignaturas no tienen fila allí, así que
 *    es opcional.
 *  - Las horas llegan desglosadas en seis columnas y cualquiera puede faltar.
 */
class SianetAcademicRecordMapper implements AcademicRecordMapper
{
    private const HOUR_FIELDS = [
        'hours_project', 'hours_ap', 'hours_ac', 'hours_pae', 'hours_aa', 'hours_paec',
    ];

    public function version(): string
    {
        return 'sianet-subject-mapper-v1';
    }

    public function map(InstitutionalRecord $record): MappingResult
    {
        if ($record->entityType !== 'subject') {
            return new MappingResult(false, null, 'unsupported_entity_type');
        }
        if ($record->externalReference === ''
            || mb_strlen($record->externalReference) > 180
            || preg_match('/[\x00-\x1F\x7F]/', $record->externalReference) === 1) {
            return new MappingResult(false, null, 'invalid_external_reference');
        }

        $allowed = array_merge([
            'career_code', 'curriculum_code', 'institutional_code', 'hidden_code',
            'name', 'cycle', 'credits', 'active',
        ], self::HOUR_FIELDS);
        if (array_diff(array_keys($record->payload), $allowed) !== []) {
            return new MappingResult(false, null, 'unknown_payload_field');
        }

        foreach (['career_code', 'curriculum_code', 'institutional_code', 'name'] as $key) {
            $value = $record->payload[$key] ?? null;
            if (! is_string($value) || trim($value) === '') {
                return new MappingResult(false, null, "invalid_{$key}");
            }
        }

        $careerCode = trim($record->payload['career_code']);
        $curriculumCode = trim($record->payload['curriculum_code']);
        $institutionalCode = trim($record->payload['institutional_code']);
        $name = trim($record->payload['name']);
        if (mb_strlen($careerCode) > 60
            || mb_strlen($curriculumCode) > 80
            || mb_strlen($institutionalCode) > 80
            || mb_strlen($name) > 180
            || preg_match('/<\/?[a-z][^>]*>/i', $name) === 1) {
            return new MappingResult(false, null, 'text_out_of_bounds');
        }
        // La fuente usa paréntesis dentro del código visible; se aceptan sin volverlos
        // significativos y se siguen rechazando espacios y caracteres de control.
        foreach ([$careerCode, $curriculumCode, $institutionalCode] as $code) {
            if (preg_match('/^[A-Za-z0-9._()-]+$/', $code) !== 1) {
                return new MappingResult(false, null, 'invalid_code_format');
            }
        }

        // `cod_oculto` es la identidad canónica: todas las claves ajenas de la fuente
        // apuntan a él, mientras que `cod_asig` solo es el código visible.
        $hiddenCode = $record->payload['hidden_code'] ?? null;
        if (! is_int($hiddenCode) || $hiddenCode < 1) {
            return new MappingResult(false, null, 'invalid_hidden_code');
        }

        $cycle = $record->payload['cycle'] ?? null;
        $credits = $record->payload['credits'] ?? null;
        $active = $record->payload['active'] ?? null;
        if (($cycle !== null && (! is_int($cycle) || $cycle < 1 || $cycle > 20))
            || (! is_int($credits) && ! is_float($credits)) || $credits < 0 || $credits > 50
            || ! is_bool($active)) {
            return new MappingResult(false, null, 'invalid_academic_values');
        }

        $hours = [];
        foreach (self::HOUR_FIELDS as $field) {
            $value = $record->payload[$field] ?? null;
            if ($value === null) {
                $hours[$field] = null;

                continue;
            }
            if ((! is_int($value) && ! is_float($value)) || $value < 0 || $value > 2000) {
                return new MappingResult(false, null, 'invalid_hour_breakdown');
            }
            $hours[$field] = (float) $value;
        }

        return new MappingResult(true, array_merge([
            'career_code' => $careerCode,
            'curriculum_code' => $curriculumCode,
            'institutional_code' => $institutionalCode,
            'hidden_code' => $hiddenCode,
            'name' => $name,
            'cycle' => $cycle,
            'credits' => (float) $credits,
            'active' => $active,
        ], $hours), 'mapped');
    }
}
