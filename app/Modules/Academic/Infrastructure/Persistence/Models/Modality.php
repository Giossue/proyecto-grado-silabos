<?php

namespace App\Modules\Academic\Infrastructure\Persistence\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Modality extends Model
{
    use HasUuids;

    protected $table = 'modalidades';

    /** @var list<string> */
    protected $fillable = ['codigo', 'nombre', 'activo'];
}
