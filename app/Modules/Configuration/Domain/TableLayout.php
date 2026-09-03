<?php

namespace App\Modules\Configuration\Domain;

use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use Illuminate\Validation\ValidationException;

/**
 * Esquema de una tabla de la plantilla (I-34).
 *
 * Una tabla compleja se descompone en piezas simples: columnas planas (un valor por
 * celda), agrupaciones de cabecera en dos niveles (`group` dentro de `band`), campos de
 * cabecera por unidad, fila de totales y repetición por unidad. Las celdas combinadas
 * solo existen en la cabecera y en los totales; el cuerpo siempre es rectangular.
 *
 * @phpstan-type Column array{key: string, label: string, type: 'text'|'number', group: string|null, band: string|null, sum: bool, width: int|null}
 * @phpstan-type Named array{key: string, label: string}
 * @phpstan-type Layout array{
 *     columns: list<Column>,
 *     groups: list<Named>,
 *     bands: list<Named>,
 *     header_fields: list<Named>,
 *     totals: array{enabled: bool, label: string},
 *     repeat: array{enabled: bool, label: string},
 * }
 */
final class TableLayout
{
    public const TYPES = ['text', 'number'];

    public const KEY_PATTERN = '/^[a-z][a-z0-9_]*$/';

    private const MAX_COLUMNS = 24;

    /**
     * Tabla mínima: una columna de texto con la clave histórica `texto`, para que las
     * filas guardadas antes del esquema sigan leyéndose.
     *
     * @return Layout
     */
    public static function default(): array
    {
        return [
            'columns' => [
                ['key' => 'texto', 'label' => 'Contenido', 'type' => 'text', 'group' => null, 'band' => null, 'sum' => false, 'width' => null],
            ],
            'groups' => [],
            'bands' => [],
            'header_fields' => [],
            'totals' => ['enabled' => false, 'label' => 'Total'],
            'repeat' => ['enabled' => false, 'label' => 'Unidad'],
        ];
    }

    /** @return Layout|null Solo los bloques de tipo tabla llevan esquema. */
    public static function fromBlock(TemplateBlock $block): ?array
    {
        if ($block->configuredContentType() !== 'table') {
            return null;
        }

        $configuration = $block->getAttribute('configuracion');
        $raw = is_array($configuration) ? ($configuration['table'] ?? null) : null;

        return is_array($raw) ? self::normalize($raw) : self::default();
    }

    /**
     * Devuelve la forma canónica o lanza errores de validación legibles.
     *
     * @param  array<string, mixed>  $raw
     * @return Layout
     */
    public static function normalize(array $raw): array
    {
        $errors = [];

        $groups = self::named($raw['groups'] ?? [], 'groups', $errors);
        $bands = self::named($raw['bands'] ?? [], 'bands', $errors);
        $headerFields = self::named($raw['header_fields'] ?? [], 'header_fields', $errors);

        $columns = [];
        $rawColumns = is_array($raw['columns'] ?? null) ? array_values($raw['columns']) : [];
        if ($rawColumns === []) {
            $errors['columns'] = 'La tabla necesita al menos una columna.';
        }
        if (count($rawColumns) > self::MAX_COLUMNS) {
            $errors['columns'] = 'La tabla admite hasta '.self::MAX_COLUMNS.' columnas.';
        }
        $groupKeys = array_column($groups, 'key');
        $bandKeys = array_column($bands, 'key');
        foreach ($rawColumns as $index => $column) {
            if (! is_array($column)) {
                $errors["columns.$index"] = 'Columna inválida.';

                continue;
            }
            $key = self::key($column['key'] ?? null);
            $label = self::label($column['label'] ?? null);
            $type = is_string($column['type'] ?? null) && in_array($column['type'], self::TYPES, true)
                ? $column['type']
                : 'text';
            $group = self::reference($column['group'] ?? null, $groupKeys);
            $band = self::reference($column['band'] ?? null, $bandKeys);
            if ($key === null) {
                $errors["columns.$index.key"] = 'La columna necesita una clave válida.';
            }
            if ($label === null) {
                $errors["columns.$index.label"] = 'La columna necesita un nombre.';
            }
            if ($group === false) {
                $errors["columns.$index.group"] = 'El grupo indicado no existe.';
            }
            if ($band === false) {
                $errors["columns.$index.band"] = 'El agrupamiento indicado no existe.';
            }
            // `sum`: si la columna numérica entra en la fila de totales (las semanas no
            // suman). `width`: peso relativo del ancho, calcado del formato oficial.
            $width = $column['width'] ?? null;
            $columns[] = [
                'key' => $key ?? "columna_$index",
                'label' => $label ?? '',
                'type' => $type,
                'group' => $group === false ? null : $group,
                'band' => $band === false ? null : $band,
                'sum' => $type === 'number' && (bool) ($column['sum'] ?? true),
                'width' => is_numeric($width) && (int) $width > 0 ? (int) $width : null,
            ];
        }

        self::assertUniqueKeys(array_column($columns, 'key'), 'columns', $errors);
        self::assertContiguous($columns, 'group', 'groups', $errors);
        self::assertContiguous($columns, 'band', 'bands', $errors);
        self::assertGroupsInsideBands($columns, $errors);

        if ($errors !== []) {
            throw ValidationException::withMessages($errors);
        }

        $usedGroups = array_filter(array_unique(array_column($columns, 'group')));
        $usedBands = array_filter(array_unique(array_column($columns, 'band')));

        return [
            'columns' => $columns,
            // Un grupo sin columnas no aporta nada: se descarta en silencio.
            'groups' => array_values(array_filter($groups, fn (array $group): bool => in_array($group['key'], $usedGroups, true))),
            'bands' => array_values(array_filter($bands, fn (array $band): bool => in_array($band['key'], $usedBands, true))),
            'header_fields' => $headerFields,
            'totals' => [
                'enabled' => (bool) (($raw['totals']['enabled'] ?? false)),
                'label' => self::label($raw['totals']['label'] ?? null) ?? 'Total',
            ],
            'repeat' => [
                'enabled' => (bool) (($raw['repeat']['enabled'] ?? false)),
                'label' => self::label($raw['repeat']['label'] ?? null) ?? 'Unidad',
            ],
        ];
    }

    /**
     * @param  Layout  $layout
     * @return list<string> Claves de las columnas numéricas, las que suman en totales.
     */
    public static function numericColumns(array $layout): array
    {
        return array_values(array_map(
            fn (array $column): string => $column['key'],
            array_filter($layout['columns'], fn (array $column): bool => $column['type'] === 'number' && $column['sum']),
        ));
    }

    /**
     * @param  array<string, string>  $errors
     * @return list<Named>
     */
    private static function named(mixed $raw, string $path, array &$errors): array
    {
        if (! is_array($raw)) {
            return [];
        }
        $items = [];
        foreach (array_values($raw) as $index => $item) {
            $key = is_array($item) ? self::key($item['key'] ?? null) : null;
            $label = is_array($item) ? self::label($item['label'] ?? null) : null;
            if ($key === null || $label === null) {
                $errors["$path.$index"] = 'Necesita clave y nombre.';

                continue;
            }
            $items[] = ['key' => $key, 'label' => $label];
        }
        self::assertUniqueKeys(array_column($items, 'key'), $path, $errors);

        return $items;
    }

    private static function key(mixed $value): ?string
    {
        return is_string($value) && preg_match(self::KEY_PATTERN, $value) === 1 && strlen($value) <= 60
            ? $value
            : null;
    }

    private static function label(mixed $value): ?string
    {
        if (! is_string($value)) {
            return null;
        }
        $trimmed = trim(preg_replace('/\s+/u', ' ', $value) ?? '');

        return $trimmed !== '' && mb_strlen($trimmed) <= 180 ? $trimmed : null;
    }

    /**
     * @param  list<string>  $known
     * @return string|null|false Nulo cuando no referencia nada; falso cuando referencia algo inexistente.
     */
    private static function reference(mixed $value, array $known): string|null|false
    {
        if ($value === null || $value === '') {
            return null;
        }

        return is_string($value) && in_array($value, $known, true) ? $value : false;
    }

    /**
     * @param  list<string>  $keys
     * @param  array<string, string>  $errors
     */
    private static function assertUniqueKeys(array $keys, string $path, array &$errors): void
    {
        if (count($keys) !== count(array_unique($keys))) {
            $errors[$path] = 'Hay claves repetidas.';
        }
    }

    /**
     * Las columnas de un mismo grupo (o agrupamiento) deben ser vecinas: así la
     * cabecera combinada es un rectángulo y no hay celdas imposibles.
     *
     * @param  list<Column>  $columns
     * @param  array<string, string>  $errors
     */
    private static function assertContiguous(array $columns, string $attribute, string $path, array &$errors): void
    {
        $seen = [];
        $previous = null;
        foreach ($columns as $column) {
            $current = $column[$attribute];
            if ($current !== null && $current !== $previous && in_array($current, $seen, true)) {
                $errors[$path] = 'Las columnas agrupadas deben estar juntas.';

                return;
            }
            if ($current !== null) {
                $seen[] = $current;
            }
            $previous = $current;
        }
    }

    /**
     * Un grupo vive entero dentro de un agrupamiento o fuera de todos.
     *
     * @param  list<Column>  $columns
     * @param  array<string, string>  $errors
     */
    private static function assertGroupsInsideBands(array $columns, array &$errors): void
    {
        $bandByGroup = [];
        foreach ($columns as $column) {
            if ($column['group'] === null) {
                continue;
            }
            if (array_key_exists($column['group'], $bandByGroup) && $bandByGroup[$column['group']] !== $column['band']) {
                $errors['groups'] = 'Un grupo no puede cruzar dos agrupamientos.';

                return;
            }
            $bandByGroup[$column['group']] = $column['band'];
        }
    }
}
