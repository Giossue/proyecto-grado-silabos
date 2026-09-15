<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use App\Support\Database\MapsLegacyColumnNames;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Campus extends Model
{
    use HasUuids, MapsLegacyColumnNames;

    protected const LEGACY_COLUMN_ALIASES = [
        'nombre' => 'nombre_campus',
        'activo' => 'campus_activo',
    ];

    public $timestamps = false;

    protected $table = 'campus';

    /** @var list<string> */
    protected $fillable = ['codigo_campus', 'nombre', 'activo'];
}
