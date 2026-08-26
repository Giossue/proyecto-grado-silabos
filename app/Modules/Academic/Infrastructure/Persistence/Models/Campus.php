<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Campus extends Model
{
    use HasUuids;

    protected $table = 'campus';

    /** @var list<string> */
    protected $fillable = ['codigo_institucional', 'nombre', 'activo'];
}
