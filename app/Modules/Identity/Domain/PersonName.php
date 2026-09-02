<?php

namespace App\Modules\Identity\Domain;

/**
 * Cómo se guarda el nombre de una persona (decisión del responsable del producto,
 * 2026-09-02): en mayúsculas, con sus tildes, primero los nombres y luego los
 * apellidos, sin espacios sobrantes. Normalizar al guardar evita que el mismo docente
 * exista tres veces con tres escrituras distintas.
 */
final class PersonName
{
    public static function normalize(string $value): string
    {
        $collapsed = preg_replace('/\s+/u', ' ', trim($value)) ?? trim($value);

        return mb_strtoupper($collapsed, 'UTF-8');
    }
}
