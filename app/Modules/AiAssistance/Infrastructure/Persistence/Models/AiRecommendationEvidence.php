<?php

namespace App\Modules\AiAssistance\Infrastructure\Persistence\Models;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Concerns\ImmutableRecord;
use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class AiRecommendationEvidence extends Model
{
    use HasUuids, ImmutableRecord;

    public $timestamps = false;

    protected $table = 'recomendacion_evidencias_ia';

    /** @var list<string> */
    protected $fillable = ['recomendacion_ia_id', 'evidencia_ia_id'];
}
