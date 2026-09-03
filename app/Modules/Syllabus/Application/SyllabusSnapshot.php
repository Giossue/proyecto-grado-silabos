<?php

namespace App\Modules\Syllabus\Application;

use App\Modules\Configuration\Domain\TableLayout;
use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateBlock;
use App\Modules\Configuration\Infrastructure\Persistence\Models\TemplateSection;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\FieldValue;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\RepeatableRow;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;

class SyllabusSnapshot
{
    /** @return array<string, mixed> */
    public function build(Syllabus $syllabus): array
    {
        $syllabus->loadMissing(['template.sections.blocks.fields', 'values', 'rows']);
        $values = $syllabus->values->keyBy('definicion_campo_id');
        $rows = $syllabus->rows
            ->sortBy(fn (RepeatableRow $row): string => sprintf(
                '%s:%05d:%s',
                $row->definicion_campo_id,
                $row->posicion,
                $row->id,
            ))
            ->groupBy('definicion_campo_id');

        return [
            'schema_version' => 2,
            'template_id' => $syllabus->plantilla_id,
            'template_name' => $syllabus->template->nombre,
            // La copia lleva también el mapa del documento: la revisión se exporta desde
            // sí misma aunque la plantilla haya cambiado después.
            'document_mapping' => $syllabus->template->mapeo_documento,
            'academic_context' => $syllabus->contexto_academico,
            // Ficha de identificación ya armada: el documento no vuelve a consultar la malla.
            'identification' => IdentificationCard::fromSyllabus($syllabus),
            'sections' => $syllabus->template->sections
                ->map(fn (TemplateSection $section): array => [
                    'key' => $section->clave,
                    'title' => $section->titulo,
                    'blocks' => $section->blocks->map(fn (TemplateBlock $block): array => [
                        'key' => $block->clave,
                        'title' => $block->titulo,
                        'content_type' => $block->configuredContentType()
                            ?? ($block->tipo === 'repetible' ? 'table' : 'text'),
                        // El esquema de la tabla viaja con la copia: el documento se
                        // exporta con las columnas que el docente llenó.
                        'table' => TableLayout::fromBlock($block),
                        'fields' => $block->fields->map(fn (FieldDefinition $field): array => [
                            'definition_id' => $field->id,
                            'key' => $field->clave,
                            'label' => $field->etiqueta,
                            'type' => $field->tipo,
                            'inherited' => $field->heredado,
                            'master_source' => $field->origen_maestro,
                            'document_marker' => $field->marcador_documento,
                            'value' => $values->get($field->id)?->valor,
                            'rows' => ($rows->get($field->id) ?? collect())->map(fn (RepeatableRow $row): array => [
                                'id' => $row->id,
                                'position' => $row->posicion,
                                'data' => $row->datos,
                            ])->values()->all(),
                        ])->values()->all(),
                    ])->values()->all(),
                ])->values()->all(),
        ];
    }

    /** @param array<string, mixed> $snapshot */
    public function restore(Syllabus $syllabus, array $snapshot): void
    {
        $fieldIds = [];
        $rowsToRestore = [];
        foreach ($this->sections($snapshot) as $section) {
            foreach ($this->blocks($section) as $block) {
                foreach ($this->fields($block) as $field) {
                    $definitionId = $field['definition_id'] ?? null;
                    if (! is_string($definitionId)) {
                        continue;
                    }
                    $fieldIds[] = $definitionId;
                    FieldValue::query()->updateOrCreate([
                        'silabo_id' => $syllabus->id,
                        'definicion_campo_id' => $definitionId,
                    ], [
                        'valor' => $field['value'] ?? null,
                        'heredado' => (bool) ($field['inherited'] ?? false),
                        'origen' => null,
                    ]);
                    foreach ($this->rows($field) as $row) {
                        if (is_string($row['id'] ?? null) && is_array($row['data'] ?? null)) {
                            $rowsToRestore[] = [
                                'id' => $row['id'],
                                'field_id' => $definitionId,
                                'position' => is_int($row['position'] ?? null) ? $row['position'] : 1,
                                'data' => $row['data'],
                            ];
                        }
                    }
                }
            }
        }

        FieldValue::query()->where('silabo_id', $syllabus->id)->whereNotIn('definicion_campo_id', $fieldIds)->delete();
        RepeatableRow::query()->where('silabo_id', $syllabus->id)->delete();
        foreach ($rowsToRestore as $rowData) {
            $row = new RepeatableRow;
            $row->id = $rowData['id'];
            $row->fill([
                'silabo_id' => $syllabus->id,
                'definicion_campo_id' => $rowData['field_id'],
                'datos' => $rowData['data'],
                'posicion' => $rowData['position'],
            ])->save();
        }
    }

    /**
     * @param  array<string, mixed>  $value
     * @return list<array<string, mixed>>
     */
    private function sections(array $value): array
    {
        return $this->arrayList($value['sections'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $value
     * @return list<array<string, mixed>>
     */
    private function blocks(array $value): array
    {
        return $this->arrayList($value['blocks'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $value
     * @return list<array<string, mixed>>
     */
    private function fields(array $value): array
    {
        return $this->arrayList($value['fields'] ?? null);
    }

    /**
     * @param  array<string, mixed>  $value
     * @return list<array<string, mixed>>
     */
    private function rows(array $value): array
    {
        return $this->arrayList($value['rows'] ?? null);
    }

    /** @return list<array<string, mixed>> */
    private function arrayList(mixed $value): array
    {
        if (! is_array($value)) {
            return [];
        }

        return array_values(array_filter($value, is_array(...)));
    }
}
