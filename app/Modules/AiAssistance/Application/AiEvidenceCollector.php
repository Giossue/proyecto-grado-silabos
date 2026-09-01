<?php

namespace App\Modules\AiAssistance\Application;

use App\Modules\Syllabus\Infrastructure\Persistence\Models\Syllabus;
use App\Support\CanonicalHasher;

class AiEvidenceCollector
{
    public function __construct(private readonly CanonicalHasher $hasher) {}

    /**
     * @return array{
     *   items: list<array{
     *     source_id: string, source_name: string, excerpt: string, fingerprint: string
     *   }>,
     *   fingerprint: string,
     *   too_many: bool
     * }
     */
    public function collect(Syllabus $syllabus): array
    {
        $syllabus->loadMissing('convocation');
        $sources = $syllabus->convocation->sources()
            ->where('fuentes_academicas.activo', true)
            ->where('fuentes_academicas.carrera_id', $syllabus->convocation->carrera_id)
            ->orderBy('fuentes_academicas.id')
            ->get();

        $items = [];
        foreach ($sources as $source) {
            $content = $source->contenido;
            if (! is_string($content) || trim($content) === '') {
                continue;
            }
            $items[] = [
                'source_id' => $source->id,
                'source_name' => $source->nombre,
                'excerpt' => mb_substr($content, 0, (int) config('ai.limits.evidence_excerpt_characters')),
                'fingerprint' => $this->hasher->hash($content),
            ];
        }

        $limit = (int) config('ai.limits.evidence_items');

        return [
            'items' => array_slice($items, 0, $limit),
            'fingerprint' => $this->hasher->hash(array_map(fn (array $item): array => [
                'source_id' => $item['source_id'],
                'fingerprint' => $item['fingerprint'],
            ], $items)),
            'too_many' => count($items) > $limit,
        ];
    }
}
