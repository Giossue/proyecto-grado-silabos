<?php

namespace App\Modules\Configuration\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * @property string $id
 * @property string $plantilla_id
 * @property string $bloque_plantilla_id
 * @property string $clave
 * @property string $etiqueta
 * @property string|null $ayuda
 * @property string $tipo
 * @property bool $obligatorio
 * @property bool $heredado
 * @property string|null $origen_maestro
 * @property bool $editable_docente
 * @property bool $ia_habilitada
 * @property array<string, mixed>|null $reglas
 * @property list<mixed>|null $opciones
 * @property string|null $marcador_documento
 * @property int $posicion
 */
class FieldDefinition extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'definiciones_campo';

    /** @var list<string> */
    protected $fillable = [
        'plantilla_id',
        'bloque_plantilla_id',
        'clave',
        'etiqueta',
        'ayuda',
        'tipo',
        'obligatorio',
        'heredado',
        'origen_maestro',
        'editable_docente',
        'ia_habilitada',
        'reglas',
        'opciones',
        'marcador_documento',
        'posicion',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'obligatorio' => 'boolean',
            'heredado' => 'boolean',
            'editable_docente' => 'boolean',
            'ia_habilitada' => 'boolean',
            'reglas' => 'array',
            'opciones' => 'array',
            'posicion' => 'integer',
        ];
    }

    /** @return BelongsTo<SyllabusTemplate, $this> */
    public function template(): BelongsTo
    {
        return $this->belongsTo(SyllabusTemplate::class, 'plantilla_id');
    }

    /** @return BelongsTo<TemplateBlock, $this> */
    public function block(): BelongsTo
    {
        return $this->belongsTo(TemplateBlock::class, 'bloque_plantilla_id');
    }
}
