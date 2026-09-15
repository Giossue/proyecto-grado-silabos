<?php

namespace App\Support\Database;

use Illuminate\Database\Eloquent\Builder;

/** @template TModel of \Illuminate\Database\Eloquent\Model */
class ExplicitColumnBuilder extends Builder
{
    private function mapped(mixed $column): mixed
    {
        if (! is_string($column) || ! method_exists($this->model, 'mappedColumn')) {
            return $column;
        }

        /** @var MapsLegacyColumnNames $model */
        $model = $this->model;

        return $model->mappedColumn($column);
    }

    private function mappedColumns(mixed $columns): mixed
    {
        if (is_string($columns)) {
            return $this->mapped($columns);
        }

        if (! is_array($columns)) {
            return $columns;
        }

        return array_map(fn (mixed $column): mixed => $this->mapped($column), $columns);
    }

    public function where($column, $operator = null, $value = null, $boolean = 'and')
    {
        if (is_array($column)) {
            $column = collect($column)->mapWithKeys(fn (mixed $value, string $key): array => [$this->mapped($key) => $value])->all();
        } else {
            $column = $this->mapped($column);
        }

        return parent::where($column, $operator, $value, $boolean);
    }

    public function whereIn($column, $values, $boolean = 'and', $not = false)
    {
        return parent::whereIn($this->mapped($column), $values, $boolean, $not);
    }

    public function whereNotIn($column, $values, $boolean = 'and')
    {
        return parent::whereNotIn($this->mapped($column), $values, $boolean);
    }

    public function whereNull($columns, $boolean = 'and', $not = false)
    {
        return parent::whereNull($this->mappedColumns($columns), $boolean, $not);
    }

    public function orderBy($column, $direction = 'asc')
    {
        return parent::orderBy($this->mapped($column), $direction);
    }

    public function orderByDesc($column)
    {
        return parent::orderByDesc($this->mapped($column));
    }

    public function orderByAsc($column)
    {
        return parent::orderByAsc($this->mapped($column));
    }

    public function latest($column = null)
    {
        return parent::latest($column === null ? null : $this->mapped($column));
    }

    public function oldest($column = null)
    {
        return parent::oldest($column === null ? null : $this->mapped($column));
    }

    public function select($columns = ['*'])
    {
        return parent::select($this->mappedColumns($columns));
    }

    public function addSelect($column)
    {
        return parent::addSelect($this->mappedColumns($column));
    }

    public function get($columns = ['*'])
    {
        return parent::get($this->mappedColumns($columns));
    }

    public function value($column)
    {
        return parent::value($this->mapped($column));
    }

    public function pluck($column, $key = null)
    {
        return parent::pluck($this->mapped($column), $key === null ? null : $this->mapped($key));
    }

    public function max($column)
    {
        return $this->toBase()->max($this->mapped($column));
    }

    public function min($column)
    {
        return $this->toBase()->min($this->mapped($column));
    }

    public function sum($column)
    {
        return $this->toBase()->sum($this->mapped($column));
    }

    public function avg($column)
    {
        return $this->toBase()->avg($this->mapped($column));
    }

    public function average($column)
    {
        return $this->toBase()->average($this->mapped($column));
    }

    public function increment($column, $amount = 1, array $extra = [])
    {
        return parent::increment($this->mapped($column), $amount, $this->mappedValues($extra));
    }

    public function decrement($column, $amount = 1, array $extra = [])
    {
        return parent::decrement($this->mapped($column), $amount, $this->mappedValues($extra));
    }

    public function update(array $values)
    {
        return parent::update($this->mappedValues($values));
    }

    /** @param array<string, mixed> $values @return array<string, mixed> */
    private function mappedValues(array $values): array
    {
        $mapped = [];
        foreach ($values as $column => $value) {
            $mapped[$this->mapped($column)] = $value;
        }

        return $mapped;
    }
}
