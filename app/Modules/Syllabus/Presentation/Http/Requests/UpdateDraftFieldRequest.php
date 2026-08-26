<?php

namespace App\Modules\Syllabus\Presentation\Http\Requests;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use Closure;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateDraftFieldRequest extends FormRequest
{
    public function authorize(): bool
    {
        $syllabus = $this->route('syllabus');

        return $syllabus instanceof Syllabus && $this->user()?->can('edit', $syllabus) === true;
    }

    /** @return array<string, list<mixed>> */
    public function rules(): array
    {
        $field = $this->route('field');
        $valueRules = $field instanceof FieldDefinition
            ? $this->valueRules($field)
            : ['prohibited'];

        $rules = [
            'lock_version' => ['required', 'integer', 'min:0'],
            'value' => $valueRules,
            'rows' => ['nullable', 'array', 'max:100'],
            'rows.*.id' => ['nullable', 'uuid'],
            'rows.*.data' => ['required_with:rows', 'array:texto'],
            'rows.*.data.texto' => ['required_with:rows', 'string', 'max:10000'],
        ];
        if ($field instanceof FieldDefinition && $field->tipo === 'multi_select') {
            $rules['value.*'] = ['string', 'distinct', Rule::in($this->allowedOptions($field))];
        }

        return $rules;
    }

    /** @return array{lock_version: int, value?: mixed, rows?: list<array{id?: string|null, data: array<string, mixed>}>} */
    public function draftData(): array
    {
        $payload = ['lock_version' => $this->integer('lock_version')];
        if ($this->exists('value')) {
            $payload['value'] = $this->input('value');
        }

        $inputRows = $this->input('rows');
        if (is_array($inputRows)) {
            $rows = [];
            foreach ($inputRows as $inputRow) {
                if (! is_array($inputRow) || ! is_array($inputRow['data'] ?? null)) {
                    continue;
                }
                $row = ['data' => $inputRow['data']];
                if (is_string($inputRow['id'] ?? null)) {
                    $row['id'] = $inputRow['id'];
                }
                $rows[] = $row;
            }
            $payload['rows'] = $rows;
        }

        return $payload;
    }

    /** @return list<mixed> */
    private function valueRules(FieldDefinition $field): array
    {
        $presence = $field->obligatorio ? 'required' : 'nullable';

        return match ($field->tipo) {
            'short_text' => [$presence, 'string', 'max:1000'],
            'long_text', 'markdown' => [
                $presence,
                'string',
                'max:50000',
                function (string $attribute, mixed $value, Closure $fail): void {
                    if (is_string($value) && preg_match('/<\/?[a-z][^>]*>/i', $value) === 1) {
                        $fail('Use texto o Markdown; el HTML no está permitido.');
                    }
                },
            ],
            'number' => [$presence, 'numeric'],
            'date' => [$presence, 'date_format:Y-m-d'],
            'single_select' => [$presence, 'string', Rule::in($this->allowedOptions($field))],
            'multi_select' => [$presence, 'array', 'max:50'],
            'boolean' => [$presence, 'boolean'],
            'repeatable' => ['prohibited'],
            'master_reference', 'calculation' => ['nullable'],
            default => ['prohibited'],
        };
    }

    /** @return list<string> */
    private function allowedOptions(FieldDefinition $field): array
    {
        $options = $field->opciones ?? [];

        $values = [];
        foreach ($options as $option) {
            if (is_string($option) || is_int($option)) {
                $values[] = (string) $option;

                continue;
            }
            if (is_array($option) && (is_string($option['value'] ?? null) || is_int($option['value'] ?? null))) {
                $values[] = (string) $option['value'];
            }
        }

        return array_values(array_unique($values));
    }
}
