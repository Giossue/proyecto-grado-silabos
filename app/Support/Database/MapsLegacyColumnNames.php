<?php

namespace App\Support\Database;

use Illuminate\Database\Eloquent\Builder;

/**
 * Permite migrar nombres físicos explícitos sin cambiar contratos de entrada o salida
 * en una sola entrega. Cada modelo declara `LEGACY_COLUMN_ALIASES` como
 * `nombre_anterior => nombre_fisico`.
 *
 * El alias existe solo en la capa de persistencia de la aplicación: PostgreSQL conserva
 * exclusivamente la columna explícita. Los casos de uso nuevos deben usar el nombre
 * físico; los alias permiten retirar las referencias antiguas de forma segura.
 */
trait MapsLegacyColumnNames
{
    /** @return array<string, string> */
    public function getCasts(): array
    {
        $casts = [];

        foreach (parent::getCasts() as $column => $cast) {
            $casts[$this->mappedColumn($column)] = $cast;
        }

        return $casts;
    }

    public function getAttribute($key): mixed
    {
        return parent::getAttribute($this->mappedColumn($key));
    }

    public function setAttribute($key, $value): static
    {
        return parent::setAttribute($this->mappedColumn($key), $value);
    }

    /** @return array<string, mixed> */
    public function attributesToArray(): array
    {
        $attributes = parent::attributesToArray();

        /** @var array<string, string> $aliases */
        $aliases = static::LEGACY_COLUMN_ALIASES;
        $legacyByPhysical = array_flip($aliases);

        foreach ($legacyByPhysical as $physical => $legacy) {
            if (array_key_exists($physical, $attributes)) {
                $attributes[$legacy] = $attributes[$physical];
                unset($attributes[$physical]);
            }
        }

        return $attributes;
    }

    public function newEloquentBuilder($query): Builder
    {
        return new ExplicitColumnBuilder($query);
    }

    public function mappedColumn(string $column): string
    {
        /** @var array<string, string> $aliases */
        $aliases = static::LEGACY_COLUMN_ALIASES;

        if (str_contains($column, '->')) {
            [$base, $path] = explode('->', $column, 2);

            return $this->mappedColumn($base).'->'.$path;
        }

        if (isset($aliases[$column])) {
            return $aliases[$column];
        }

        $prefix = $this->getTable().'.';
        if (str_starts_with($column, $prefix)) {
            $name = substr($column, strlen($prefix));

            return $prefix.($aliases[$name] ?? $name);
        }

        return $column;
    }
}
