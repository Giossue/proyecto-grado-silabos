<?php

namespace App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns;

use Illuminate\Database\Eloquent\Model;
use LogicException;

trait ImmutableRecord
{
    protected static function bootImmutableRecord(): void
    {
        static::updating(fn (Model $model) => throw new LogicException('El registro histórico es inmutable.'));
        static::deleting(fn (Model $model) => throw new LogicException('El registro histórico no puede eliminarse.'));
    }
}
