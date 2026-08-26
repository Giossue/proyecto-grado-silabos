<?php

namespace App\Modules\Operations\Infrastructure\Persistence\Models;

use Carbon\CarbonImmutable;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

/**
 * @property string $id
 * @property string $type
 * @property string $queue_name
 * @property string $status
 * @property string $idempotency_key
 * @property string|null $correlation_id
 * @property string|null $resource_type
 * @property string|null $resource_id
 * @property int $attempts
 * @property int $max_attempts
 * @property int $progress
 * @property array<string, mixed>|null $result
 * @property string|null $error_code
 * @property string|null $error_message
 * @property CarbonImmutable|null $started_at
 * @property CarbonImmutable|null $finished_at
 * @property CarbonImmutable|null $created_at
 * @property CarbonImmutable|null $updated_at
 */
class JobExecution extends Model
{
    use HasUuids;

    protected $table = 'ejecuciones_trabajo';

    /** @var list<string> */
    protected $fillable = [
        'type',
        'queue_name',
        'status',
        'idempotency_key',
        'correlation_id',
        'resource_type',
        'resource_id',
        'attempts',
        'max_attempts',
        'progress',
        'result',
        'error_code',
        'error_message',
        'started_at',
        'finished_at',
    ];

    /** @return array<string, string> */
    protected function casts(): array
    {
        return [
            'attempts' => 'integer',
            'max_attempts' => 'integer',
            'progress' => 'integer',
            'result' => 'array',
            'started_at' => 'immutable_datetime',
            'finished_at' => 'immutable_datetime',
        ];
    }
}
