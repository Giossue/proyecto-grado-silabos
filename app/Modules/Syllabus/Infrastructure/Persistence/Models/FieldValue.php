<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models;

use App\Modules\Configuration\Infrastructure\Persistence\Models\FieldDefinition;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** @property array<string, mixed>|list<mixed>|bool|float|int|string|null $valor @property bool $heredado */
class FieldValue extends Model
{
    use HasUuids;

    public $timestamps = false;

    protected $table = 'valores_campo';

    /** @var list<string> */
    protected $fillable = ['silabo_id', 'definicion_campo_id', 'valor', 'heredado', 'origen'];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return ['valor' => 'json', 'heredado' => 'boolean'];
    }

    /** @return BelongsTo<FieldDefinition, $this> */
    public function field(): BelongsTo
    {
        return $this->belongsTo(FieldDefinition::class, 'definicion_campo_id');
    }
}
